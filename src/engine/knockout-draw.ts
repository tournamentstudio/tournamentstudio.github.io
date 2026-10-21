import type {
  GroupDrawIssue,
  KnockoutDrawPreview,
  Tournament,
} from "../domain/types";
import { normalizeDrawLabel } from "../domain/draw";
import {
  knockoutDrawErrors,
  knockoutDrawIssueText,
} from "../domain/knockout-draw";
import { previewAdvancement } from "./advancement";
import { singleElimination } from "./elimination";
import { DRAW_ALGORITHM, seedPositions, shuffle } from "./random";
import {
  solveKnockoutSeparation,
  type SeparationRule,
} from "./knockout-separation";
import { losersEncounterRounds } from "./losers-encounters";
import { solveKnockoutPaths } from "./knockout-paths";
import {
  canMeetInThirdPlace,
  prepareFinalsSeparation,
  type ThirdPlaceRule,
} from "./finals-separation";

export const KNOCKOUT_DRAW_ALGORITHM = "knockout-matching-fnv1a-mulberry32-v1";
export const KNOCKOUT_SEPARATION_ALGORITHM =
  "knockout-subtrees-fnv1a-mulberry32-v2";
export const KNOCKOUT_PATHS_ALGORITHM = "knockout-paths-fnv1a-mulberry32-v3";
export const KNOCKOUT_FINALS_ALGORITHM = "knockout-finals-fnv1a-mulberry32-v4";
export const KNOCKOUT_DRAW_NODE_LIMIT = 100000;
export const KNOCKOUT_DRAW_WORK_LIMIT = 20000000;

/** Draw versions retain their own pairing policy and deterministic algorithm. */
export function previewKnockoutDraw(
  tournament: Tournament,
  stageId: string,
): KnockoutDrawPreview {
  const stage = tournament.stages.find((item) => item.id === stageId);
  const issueDetails: GroupDrawIssue[] = [];
  let participantIds: string[] = [];
  let byeIds: string[] = [];
  let fixedSlots: KnockoutDrawPreview["fixedSlots"] = [];
  let exploredNodes = 0;
  const add = (code: string, ...values: string[]) =>
    issueDetails.push({ code, values });
  const result = (slots: (string | null)[] = []): KnockoutDrawPreview => ({
    ready: issueDetails.length === 0,
    slots,
    participantIds,
    byeIds,
    fixedSlots,
    issues: issueDetails.map((issue) => knockoutDrawIssueText(issue)),
    issueDetails,
    algorithm: stage?.config.knockoutDraw
      ? stage.config.knockoutDraw.version === 4
        ? KNOCKOUT_FINALS_ALGORITHM
        : stage.config.knockoutDraw.version === 3
          ? KNOCKOUT_PATHS_ALGORITHM
          : stage.config.knockoutDraw.version === 2
            ? KNOCKOUT_SEPARATION_ALGORITHM
            : KNOCKOUT_DRAW_ALGORITHM
      : DRAW_ALGORITHM,
    exploredNodes,
  });
  if (!stage) {
    add("stage");
    return result();
  }
  if (!["single-elimination", "double-elimination"].includes(stage.format)) {
    add("format");
    return result();
  }
  issueDetails.push(...knockoutDrawErrors(tournament, stage));
  if (issueDetails.length) return result();
  const advancement = previewAdvancement(tournament, stage.id);
  if (!advancement.ready) {
    add("source");
    return result();
  }
  const ids = stage.sources.length
    ? advancement.participantIds
    : stage.participantIds;
  const participants = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  );
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !participants.has(id))
  ) {
    add("invalidEntrants");
    return result();
  }
  participantIds = ids.filter(
    (id) => participants.get(id)!.status === "active",
  );
  if (participantIds.length < 2 || participantIds.length > 512) {
    add("count");
    return result();
  }
  if (stage.config.seeding === "random")
    participantIds = shuffle(participantIds, stage.config.seed);
  else if (stage.config.seeding !== "manual" && !stage.sources.length)
    participantIds.sort(
      (a, b) =>
        participants.get(a)!.seed - participants.get(b)!.seed ||
        (stage.config.knockoutDraw
          ? a < b
            ? -1
            : a > b
              ? 1
              : 0
          : a.localeCompare(b)),
    );
  fixedSlots = advancement.bracketSlots;
  const draw = stage.config.knockoutDraw;
  if (!draw) {
    const slots = singleElimination(stage, participantIds, false, fixedSlots)
      .filter((match) => match.round === 1 && match.bracket === "winners")
      .flatMap((match) =>
        match.slots.map((slot) => slot.participantId ?? null),
      );
    byeIds = slots.filter(
      (id, index): id is string => id !== null && slots[index ^ 1] === null,
    );
    return result(slots);
  }
  const count = participantIds.length;
  const size = 2 ** Math.ceil(Math.log2(count));
  const positions = seedPositions(size);
  const preferredSlot = new Map(
    participantIds.map((id, index) => [id, positions.indexOf(index + 1)]),
  );
  byeIds = participantIds.slice(0, size - count);
  const byes = new Set(byeIds);
  const playing = participantIds.filter((id) => !byes.has(id));
  const playingMatches = playing.length / 2;
  const potById = new Map<string, number>();
  draw.pots.forEach((pot, index) => {
    if (!pot.participantIds.length) add("emptyPot");
    pot.participantIds.forEach((id) => potById.set(id, index));
  });
  if (
    draw.pots.length &&
    (potById.size !== count || participantIds.some((id) => !potById.has(id)))
  )
    add("incompletePots");
  if (draw.protectedSeeds > count) add("protectedCount");
  const keysById = new Map(participantIds.map((id) => [id, [] as string[]]));
  draw.pots.forEach((pot, index) => {
    for (const id of pot.participantIds) keysById.get(id)?.push(`pot:${index}`);
    const available = pot.participantIds.filter((id) => !byes.has(id)).length;
    if (available > playingMatches)
      add("capacity", pot.name, String(available), String(playingMatches));
  });
  for (const field of draw.restrictions) {
    const labels = new Map<string, { name: string; count: number }>();
    let missing = false;
    for (const id of participantIds) {
      const raw = participants.get(id)![field] ?? "";
      const normalized = normalizeDrawLabel(raw);
      if (!normalized) {
        missing = true;
        continue;
      }
      keysById.get(id)!.push(`${field}:${normalized}`);
      if (!byes.has(id)) {
        const previous = labels.get(normalized);
        labels.set(normalized, {
          name: previous?.name ?? raw.trim(),
          count: (previous?.count ?? 0) + 1,
        });
      }
    }
    if (missing)
      add(field === "region" ? "missingRegion" : "missingOrganization");
    for (const { name, count: total } of labels.values())
      if (total > playingMatches)
        add("capacity", name, String(total), String(playingMatches));
  }
  if (draw.version === 3 || draw.version === 4)
    for (const rule of draw.losersSeparation) {
      if (
        !draw.restrictions.includes(rule.field) &&
        participantIds.some(
          (id) => !normalizeDrawLabel(participants.get(id)![rule.field] ?? ""),
        )
      )
        add(rule.field === "region" ? "missingRegion" : "missingOrganization");
      const rounds = 2 * Math.log2(size) - 2;
      if (rule.throughRound > rounds)
        add("losersRound", String(rule.throughRound), String(rounds));
      if (rule.throughRound === rounds) {
        const totals = new Map<string, { name: string; count: number }>();
        for (const id of participantIds) {
          const raw = participants.get(id)![rule.field] ?? "";
          const label = normalizeDrawLabel(raw);
          const previous = totals.get(label);
          totals.set(label, {
            name: previous?.name ?? raw.trim(),
            count: (previous?.count ?? 0) + 1,
          });
        }
        for (const { name, count: total } of totals.values())
          if (total > 1) add("losersCapacity", name, String(total));
      }
    }
  let thirdPlaceSeparation: ThirdPlaceRule[] = [];
  if (draw.version === 4) {
    const prepared = prepareFinalsSeparation(
      draw,
      participantIds,
      participants,
    );
    thirdPlaceSeparation = prepared.thirdPlace;
    issueDetails.push(
      ...prepared.issues.filter(
        (issue) =>
          !issueDetails.some(
            (existing) =>
              existing.code === issue.code &&
              JSON.stringify(existing.values) === JSON.stringify(issue.values),
          ),
      ),
    );
  }
  if (issueDetails.length) return result();
  const separation: SeparationRule[] = [];
  if (draw.version !== 1) {
    for (const rule of draw.separation) {
      if (rule.throughRound > Math.log2(size)) {
        add(
          "separationRound",
          String(rule.throughRound),
          String(Math.log2(size)),
        );
        continue;
      }
      const labels = new Map<string, string>();
      const totals = new Map<string, { name: string; count: number }>();
      for (const id of participantIds) {
        const raw = participants.get(id)![rule.field]!;
        const label = normalizeDrawLabel(raw);
        labels.set(id, label);
        const previous = totals.get(label);
        totals.set(label, {
          name: previous?.name ?? raw.trim(),
          count: (previous?.count ?? 0) + 1,
        });
      }
      const capacity = size / 2 ** rule.throughRound;
      for (const { name, count: total } of totals.values())
        if (total > capacity)
          add(
            "separationCapacity",
            name,
            String(total),
            String(rule.throughRound),
            String(capacity),
          );
      separation.push({ ...rule, labels });
    }
  }
  if (issueDetails.length) return result();
  const slots: (string | null)[] = Array.from({ length: size }, () => null);
  const fixedById = new Map<string, number>();
  for (const placement of fixedSlots) {
    slots[placement.slot - 1] = placement.participantId;
    fixedById.set(placement.participantId, placement.slot - 1);
  }
  for (const id of participantIds.slice(0, draw.protectedSeeds)) {
    const slot = preferredSlot.get(id)!;
    if (
      (fixedById.has(id) && fixedById.get(id) !== slot) ||
      (slots[slot] !== null && slots[slot] !== id)
    ) {
      add("protectedConflict", String(participantIds.indexOf(id) + 1));
      continue;
    }
    slots[slot] = id;
    fixedById.set(id, slot);
  }
  fixedSlots = [...fixedById]
    .map(([participantId, index]) => ({ slot: index + 1, participantId }))
    .sort((a, b) => a.slot - b.slot);
  if (issueDetails.length) return result();
  const compatible = (a: string, b: string): boolean =>
    !keysById.get(a)!.some((key) => keysById.get(b)!.includes(key));
  const paired = new Set<string>();
  for (let index = 0; index < size; index += 2) {
    const a = slots[index];
    const b = slots[index + 1];
    if (!a || !b) continue;
    if (byes.has(a) || byes.has(b)) add("byeConflict");
    else if (!compatible(a, b)) add("fixedConflict");
    else {
      paired.add(a);
      paired.add(b);
    }
  }
  if (issueDetails.length) return result();
  if (draw.version !== 1) {
    for (const rule of separation) {
      const seen = new Set<string>();
      for (const [id, slot] of fixedById) {
        const key = JSON.stringify([
          Math.floor(slot / 2 ** rule.throughRound),
          rule.labels.get(id),
        ]);
        if (seen.has(key)) {
          add("separationFixed", rule.field, String(rule.throughRound));
          break;
        }
        seen.add(key);
      }
    }
    if (issueDetails.length) return result();
    if (draw.version === 3 || draw.version === 4) {
      const encounters = draw.losersSeparation.length
        ? losersEncounterRounds(stage, size)
        : new Uint8Array(0);
      const losersSeparation: SeparationRule[] = draw.losersSeparation.map(
        (rule) => ({
          ...rule,
          labels: new Map(
            participantIds.map((id) => [
              id,
              normalizeDrawLabel(participants.get(id)![rule.field]!),
            ]),
          ),
        }),
      );
      const fixed = [...fixedById];
      for (const rule of losersSeparation)
        for (let first = 0; first < fixed.length; first++) {
          let conflict = false;
          for (let second = first + 1; second < fixed.length; second++) {
            const [a, slotA] = fixed[first];
            const [b, slotB] = fixed[second];
            const round =
              encounters[
                (2 * Math.floor(slotA / 2) + Number(byes.has(a))) * size +
                  2 * Math.floor(slotB / 2) +
                  Number(byes.has(b))
              ];
            if (
              round > 0 &&
              round <= rule.throughRound &&
              rule.labels.get(a) === rule.labels.get(b)
            ) {
              conflict = true;
              break;
            }
          }
          if (conflict) {
            add("losersFixed", rule.field, String(rule.throughRound));
            break;
          }
        }
      if (draw.version === 4)
        for (const rule of draw.finalsSeparation) {
          if (!rule.targets.includes("third-place")) continue;
          let conflict = false;
          for (let first = 0; first < fixed.length && !conflict; first++)
            for (let second = first + 1; second < fixed.length; second++) {
              const [a, slotA] = fixed[first];
              const [b, slotB] = fixed[second];
              if (
                normalizeDrawLabel(participants.get(a)![rule.field]!) ===
                  normalizeDrawLabel(participants.get(b)![rule.field]!) &&
                canMeetInThirdPlace(
                  size,
                  byes,
                  a,
                  Math.floor(slotA / 2),
                  b,
                  Math.floor(slotB / 2),
                )
              ) {
                conflict = true;
                break;
              }
            }
          if (conflict) add("thirdPlaceFixed", rule.field);
        }
      if (issueDetails.length) return result();
      const solved = solveKnockoutPaths({
        slots,
        participantIds,
        byes,
        keysById,
        preferredSlot,
        separation,
        losersSeparation,
        ...(draw.version === 4 ? { thirdPlaceSeparation } : {}),
        encounters,
        seed: stage.config.seed,
        nodeLimit: KNOCKOUT_DRAW_NODE_LIMIT,
        workLimit: KNOCKOUT_DRAW_WORK_LIMIT,
      });
      exploredNodes = solved.exploredNodes;
      if (!solved.slots) {
        add(
          solved.exhausted
            ? "exhausted"
            : draw.version === 4
              ? "finalsInfeasible"
              : "losersInfeasible",
        );
        return result();
      }
      return result(solved.slots);
    }
    const solved = solveKnockoutSeparation({
      slots,
      participantIds,
      byes,
      keysById,
      preferredSlot,
      separation,
      seed: stage.config.seed,
      nodeLimit: KNOCKOUT_DRAW_NODE_LIMIT,
      workLimit: KNOCKOUT_DRAW_WORK_LIMIT,
    });
    exploredNodes = solved.exploredNodes;
    if (!solved.slots) {
      add(solved.exhausted ? "exhausted" : "separationInfeasible");
      return result();
    }
    return result(solved.slots);
  }
  const entrants = playing.filter((id) => !paired.has(id));
  const neighbors = entrants.map((id) => {
    const preferredOpponent =
      participantIds[positions[preferredSlot.get(id)! ^ 1] - 1];
    return shuffle(
      entrants
        .map((other, index) => ({ other, index }))
        .filter(
          ({ other }) =>
            id !== other &&
            !(fixedById.has(id) && fixedById.has(other)) &&
            compatible(id, other),
        )
        .map(({ index }) => index),
      `${stage.config.seed}|opponents|${id}`,
    ).sort(
      (a, b) =>
        Number(entrants[b] === preferredOpponent) -
        Number(entrants[a] === preferredOpponent),
    );
  });
  const active = entrants.map(() => true);
  const degrees = neighbors.map((items) => items.length);
  const pairs: [number, number][] = [];
  let exhausted = false;
  let work = entrants.length * entrants.length;
  const setActive = (index: number, enabled: boolean) => {
    active[index] = enabled;
    for (const neighbor of neighbors[index]) {
      degrees[neighbor] += enabled ? 1 : -1;
      work++;
    }
  };
  const search = (remaining: number): boolean => {
    if (!remaining) return true;
    if (
      exploredNodes >= KNOCKOUT_DRAW_NODE_LIMIT ||
      work >= KNOCKOUT_DRAW_WORK_LIMIT
    ) {
      exhausted = true;
      return false;
    }
    exploredNodes++;
    let chosen = -1;
    for (let index = 0; index < entrants.length; index++) {
      work++;
      if (active[index] && (chosen < 0 || degrees[index] < degrees[chosen]))
        chosen = index;
    }
    if (!degrees[chosen]) return false;
    for (const other of neighbors[chosen]) {
      if (!active[other]) continue;
      setActive(chosen, false);
      setActive(other, false);
      pairs.push([chosen, other]);
      if (search(remaining - 2)) return true;
      pairs.pop();
      setActive(other, true);
      setActive(chosen, true);
      if (exhausted) return false;
    }
    return false;
  };
  if (!search(entrants.length)) {
    add(exhausted ? "exhausted" : "infeasible");
    return result();
  }
  const emptyMatch = (preferred: number): number => {
    const first = preferred - (preferred % 2);
    if (slots[first] === null && slots[first + 1] === null) return first;
    return slots.findIndex(
      (id, index) =>
        index % 2 === 0 && id === null && slots[index + 1] === null,
    );
  };
  // Reserved singletons retain their opposite empty slot. Allocate all other BYEs first.
  for (const id of byeIds) {
    if (fixedById.has(id)) continue;
    const preferred = preferredSlot.get(id)!;
    const first = emptyMatch(preferred);
    slots[first + (preferred % 2)] = id;
  }
  for (const [a, b] of pairs) {
    const first = entrants[a];
    const second = entrants[b];
    const anchored = fixedById.has(first)
      ? first
      : fixedById.has(second)
        ? second
        : null;
    if (anchored) {
      slots[fixedById.get(anchored)! ^ 1] = anchored === first ? second : first;
    } else {
      const preferred = preferredSlot.get(first)!;
      const index = emptyMatch(preferred);
      slots[index + (preferred % 2)] = first;
      slots[(index + (preferred % 2)) ^ 1] = second;
    }
  }
  return result(slots);
}
