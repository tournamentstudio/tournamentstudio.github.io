import type {
  JsonValue,
  Match,
  MatchResult,
  Participant,
  Stage,
  Tournament,
} from "../domain/types";
import { validateResult } from "../scoring";
import { getStandings } from "../standings";
import { advancementErrors } from "../domain/advancement";
import { groupDrawErrors, groupDrawIssueText } from "../domain/draw";
import { previewAdvancement } from "./advancement";
import { previewGroupDraw } from "./group-draw";
import { gauntlet, gsl, singleElimination } from "./elimination";
import {
  distributeGroups,
  entrant,
  formats,
  newMatch,
  roundRobin,
  terminal,
} from "./formats";
import { ladderRound, swissRound, tripleRound } from "./pairing";
import { DRAW_ALGORITHM, shuffle } from "./random";

export { formats, getStandings, previewAdvancement };
export { previewGroupDraw };
export {
  GROUP_DRAW_ALGORITHM,
  GROUP_DRAW_NODE_LIMIT,
  GROUP_DRAW_WORK_LIMIT,
} from "./group-draw";
export { groupDrawIssueText, normalizeDrawLabel } from "../domain/draw";
export { autoSchedule, detectConflicts, estimateDuration } from "../scheduling";
export { DRAW_ALGORITHM, randomSource, seedPositions, shuffle } from "./random";
export { PairingError } from "./pairing";

const dynamic = new Set(["swiss", "triple-elimination", "ladder"]);

export class CorrectionRequiredError extends Error {
  affected: Match[];
  constructor(affected: Match[]) {
    super(
      `This correction affects ${affected.length} played or live matches. Confirm invalidation to keep a recovery record and reopen them.`,
    );
    this.name = "CorrectionRequiredError";
    this.affected = affected;
  }
}

function requireStage(tournament: Tournament, id: string): Stage {
  const stage = tournament.stages.find((value) => value.id === id);
  if (!stage) throw new Error("The stage does not exist.");
  return stage;
}

function resolveEntrants(tournament: Tournament, stage: Stage): string[] {
  if (!stage.sources.length) return stage.participantIds;
  const preview = previewAdvancement(tournament, stage.id);
  if (!preview.ready) throw new Error(preview.issues.join(" "));
  return preview.participantIds;
}

function validateConfig(stage: Stage, count: number): void {
  const format = formats.find((value) => value.id === stage.format);
  if (!format) throw new Error("This competition format is not supported.");
  if (stage.formatVersion !== 1)
    throw new Error("The stage requires a different format version.");
  if (count < format.minParticipants || count > format.maxParticipants)
    throw new Error(
      `This format supports ${format.minParticipants} to ${format.maxParticipants} entrants.`,
    );
  for (const [key, min, max] of [
    ["meetings", 1, 12],
    ["rounds", 1, 100],
    ["groupCount", 1, 128],
    ["capacity", 2, 512],
    ["advanceCount", 1, 512],
  ] as const) {
    const value = stage.config[key];
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  }
  if (stage.format === "groups" && stage.config.groupCount > count)
    throw new Error("The group count cannot exceed the entrant count.");
  if (stage.format === "gsl" && count % 4 !== 0)
    throw new Error(
      "GSL uses groups of exactly four entrants. Choose a participant count divisible by four.",
    );
  if (
    stage.format === "swiss" &&
    stage.config.rounds > count - (count % 2 === 0 ? 1 : 0)
  )
    throw new Error(
      "The requested Swiss rounds exceed the number of distinct possible opponents and byes.",
    );
}

export function generateStage(input: Tournament, stageId: string): Tournament {
  const tournament = structuredClone(input);
  const errors = validateGraph(tournament);
  if (errors.length) throw new Error(errors.join(" "));
  const stage = requireStage(tournament, stageId);
  if (
    tournament.matches.some(
      (match) =>
        match.stageId === stageId &&
        (match.status === "completed" || match.status === "live"),
    )
  ) {
    throw new Error(
      "This draw contains played or live matches. Duplicate the tournament or explicitly reset the stage before regenerating.",
    );
  }
  const descendants = descendantStages(tournament, stageId);
  if (tournament.matches.some((match) => descendants.has(match.stageId)))
    throw new Error("Reset dependent stages before regenerating this draw.");
  stage.participantIds = resolveEntrants(tournament, stage);
  let ids = [...stage.participantIds].filter(
    (id) =>
      tournament.participants.find((participant) => participant.id === id)
        ?.status === "active",
  );
  if (ids.length !== stage.participantIds.length) stage.participantIds = ids;
  validateConfig(stage, ids.length);
  const seeds = new Map(
    tournament.participants.map((participant) => [
      participant.id,
      participant.seed,
    ]),
  );
  if (stage.config.seeding === "random") ids = shuffle(ids, stage.config.seed);
  else if (stage.config.seeding !== "manual" && !stage.sources.length)
    ids.sort(
      (a, b) =>
        seeds.get(a)! - seeds.get(b)! ||
        (stage.config.draw ? (a < b ? -1 : a > b ? 1 : 0) : a.localeCompare(b)),
    );
  stage.metadata.drawAlgorithm = DRAW_ALGORITHM;
  stage.metadata.drawSeed = stage.config.seed;
  stage.metadata.drawOrder = [...ids];
  delete stage.metadata.championId;
  stage.status = "active";
  tournament.matches = tournament.matches.filter(
    (match) => match.stageId !== stageId,
  );
  let matches: Match[] = [];
  if (
    stage.format === "single-elimination" ||
    stage.format === "double-elimination"
  )
    matches = singleElimination(
      stage,
      ids,
      stage.format === "double-elimination",
      previewAdvancement(tournament, stage.id).bracketSlots,
    );
  if (stage.format === "gauntlet") matches = gauntlet(stage, ids);
  if (stage.format === "round-robin") matches = roundRobin(stage, ids);
  if (stage.format === "groups" || stage.format === "gsl") {
    const preview = previewGroupDraw(tournament, stageId);
    if (!preview.ready) throw new Error(preview.issues.join(" "));
    const groups = preview.groups;
    stage.metadata.drawAlgorithm = preview.algorithm;
    if (stage.format === "gsl" && groups.some((group) => group.length !== 4))
      throw new Error("Each GSL group must have four entrants.");
    stage.metadata.groups = groups;
    matches =
      stage.format === "gsl"
        ? gsl(stage, groups)
        : groups.flatMap((group, index) => {
            const name = String.fromCharCode(65 + index);
            return group.length === 1
              ? [
                  newMatch(stage, 1, 0, [entrant(group[0]), entrant()], {
                    group: name,
                  }),
                ]
              : roundRobin(stage, group, name);
          });
  }
  if (stage.format === "swiss") matches = swissRound(tournament, stage, 1);
  if (stage.format === "triple-elimination") {
    stage.metadata.policy = "progressive-three-loss-v1";
    matches = tripleRound(tournament, stage, 1);
  }
  if (stage.format === "ladder") {
    stage.metadata.policy = "alternating-adjacent-challenges-v1";
    stage.metadata.ladderOrder = ids;
    matches = ladderRound(stage, 1);
  }
  if (["free-for-all", "time-trial", "grand-prix"].includes(stage.format)) {
    const capacity =
      stage.format === "free-for-all" ? stage.config.capacity : ids.length;
    const groups = distributeGroups(ids, Math.ceil(ids.length / capacity));
    if (groups.some((group) => group.length < 2))
      throw new Error(
        "This heat capacity creates a one-entrant heat. Increase capacity so every heat has at least two entrants.",
      );
    for (let round = 1; round <= stage.config.rounds; round++) {
      groups.forEach((group, index) =>
        matches.push(
          newMatch(stage, round, index, group.map(entrant), {
            group:
              groups.length > 1 ? String.fromCharCode(65 + index) : undefined,
          }),
        ),
      );
    }
  }
  if (matches.length + tournament.matches.length > 20000)
    throw new Error(
      "This draw exceeds the 20000-match document limit. Reduce meetings or split the competition.",
    );
  tournament.matches.push(...matches);
  tournament.status = "ready";
  refresh(tournament);
  return tournament;
}

function descendantStages(
  tournament: Tournament,
  stageId: string,
): Set<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of tournament.stages) {
      if (
        !descendants.has(stage.id) &&
        stage.sources.some(
          (source) =>
            source.stageId === stageId || descendants.has(source.stageId),
        )
      ) {
        descendants.add(stage.id);
        changed = true;
      }
    }
  }
  return descendants;
}

export function getCorrectionImpact(
  tournament: Tournament,
  matchId: string,
): Match[] {
  const original = tournament.matches.find((match) => match.id === matchId);
  if (!original) throw new Error("The match does not exist.");
  const stage = requireStage(tournament, original.stageId);
  const stageIds = descendantStages(tournament, stage.id);
  const affected = new Set<string>();
  for (const match of tournament.matches) {
    if (
      stageIds.has(match.stageId) ||
      (dynamic.has(stage.format) &&
        match.stageId === stage.id &&
        match.round > original.round)
    )
      affected.add(match.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of tournament.matches) {
      if (
        !affected.has(match.id) &&
        match.slots.some(
          (slot) =>
            slot.source &&
            (slot.source.matchId === matchId ||
              affected.has(slot.source.matchId)),
        )
      ) {
        affected.add(match.id);
        changed = true;
      }
    }
  }
  return tournament.matches.filter((match) => affected.has(match.id));
}

function clearDownstream(
  tournament: Tournament,
  original: Match,
  impact: Match[],
): void {
  const stage = requireStage(tournament, original.stageId);
  const affected = new Set(impact.map((match) => match.id));
  const downstreamStages = descendantStages(tournament, stage.id);
  const removed = new Set(
    tournament.matches
      .filter(
        (match) =>
          downstreamStages.has(match.stageId) ||
          (dynamic.has(stage.format) &&
            match.stageId === stage.id &&
            match.round > original.round),
      )
      .map((match) => match.id),
  );
  tournament.matches = tournament.matches.filter(
    (match) => !removed.has(match.id),
  );
  for (const match of tournament.matches) {
    if (!affected.has(match.id)) continue;
    delete match.result;
    delete match.liveScores;
    delete match.hands;
    delete match.private;
    match.status = "pending";
    for (const slot of match.slots) if (slot.source) delete slot.participantId;
  }
  for (const item of tournament.stages) {
    if (downstreamStages.has(item.id)) {
      item.status = "draft";
      item.participantIds = [];
    } else if (item.id === stage.id) item.status = "active";
    if (item.id === stage.id || downstreamStages.has(item.id))
      delete item.metadata.championId;
  }
}

export function recordResult(
  input: Tournament,
  matchId: string,
  result: MatchResult,
  confirmInvalidate = false,
): Tournament {
  const tournament = structuredClone(input);
  const match = tournament.matches.find((item) => item.id === matchId);
  if (!match) throw new Error("The match does not exist.");
  if (
    match.status === "pending" ||
    match.status === "bye" ||
    match.status === "canceled"
  )
    throw new Error("This match is not ready for a result.");
  const stage = requireStage(tournament, match.stageId);
  const normalized = validateResult(match, stage, tournament.rules, result);
  const impact = match.result ? getCorrectionImpact(tournament, matchId) : [];
  const played = impact.filter(
    (item) =>
      item.status === "completed" ||
      item.status === "live" ||
      item.status === "contested",
  );
  if (played.length && !confirmInvalidate)
    throw new CorrectionRequiredError(played);
  if (match.result) {
    const recovery = Array.isArray(tournament.metadata.correctionRecovery)
      ? tournament.metadata.correctionRecovery
      : [];
    recovery.push({
      at: normalized.recordedAt,
      revision: tournament.revision,
      matchId,
      matches: JSON.parse(JSON.stringify([match, ...impact])) as JsonValue,
    });
    tournament.metadata.correctionRecovery = recovery.slice(-5);
    clearDownstream(tournament, match, impact);
  }
  match.result = normalized;
  delete match.liveScores;
  match.status = "completed";
  tournament.history.push({
    id: `result:${match.id}:${tournament.history.length}`,
    at: normalized.recordedAt,
    revision: tournament.revision,
    action: `${input.matches.find((item) => item.id === matchId)?.result ? "Corrected" : "Recorded"} ${match.label}${played.length ? `; reopened ${played.length} affected matches` : ""}`,
  });
  refresh(tournament);
  return tournament;
}

function resolveMatches(tournament: Tournament): void {
  const matches = new Map(tournament.matches.map((match) => [match.id, match]));
  let changed = true;
  let iterations = 0;
  while (changed && iterations++ <= tournament.matches.length + 1) {
    changed = false;
    for (const match of tournament.matches) {
      if (
        match.status === "completed" ||
        match.status === "live" ||
        match.status === "contested"
      )
        continue;
      let waiting = false;
      for (const slot of match.slots) {
        if (!slot.source) continue;
        const source = matches.get(slot.source.matchId);
        if (!source || !terminal(source)) {
          waiting = true;
          delete slot.participantId;
          continue;
        }
        const winners = source.result?.winnerIds ?? [];
        const resolved =
          slot.source.result === "winner"
            ? winners[slot.source.position ?? 0]
            : source.slots.find(
                (item) =>
                  item.participantId && !winners.includes(item.participantId),
              )?.participantId;
        if (resolved) slot.participantId = resolved;
        else delete slot.participantId;
      }
      if (match.metadata.conditionalReset) {
        const final = matches.get(String(match.metadata.conditionalReset))!;
        if (!terminal(final)) waiting = true;
        else if (final.result?.winnerIds[0] === final.slots[0].participantId) {
          if (match.status !== "canceled") {
            match.status = "canceled";
            delete match.result;
            changed = true;
          }
          continue;
        }
      }
      if (waiting) {
        if (match.status !== "pending") {
          match.status = "pending";
          delete match.result;
          changed = true;
        }
        continue;
      }
      const ids = match.slots.flatMap((slot) =>
        slot.participantId ? [slot.participantId] : [],
      );
      if (new Set(ids).size !== ids.length)
        throw new Error(
          "Progression assigned the same entrant to both sides of a match.",
        );
      if (ids.length < 2) {
        if (match.status !== "bye" || match.result?.winnerIds[0] !== ids[0]) {
          match.status = "bye";
          match.result = {
            scores: [],
            winnerIds: ids,
            outcome: "walkover",
            recordedAt: tournament.updatedAt,
          };
          changed = true;
        }
      } else if (match.status !== "ready" && match.status !== "postponed") {
        match.status = "ready";
        delete match.result;
        changed = true;
      }
    }
  }
}

function refresh(tournament: Tournament): void {
  resolveMatches(tournament);
  for (const stage of tournament.stages) {
    const matches = tournament.matches.filter(
      (match) => match.stageId === stage.id,
    );
    if (!matches.length) continue;
    let complete = matches.every(terminal);
    if (stage.format === "swiss" || stage.format === "ladder")
      complete =
        complete &&
        Math.max(...matches.map((match) => match.round)) >= stage.config.rounds;
    if (stage.format === "ladder") {
      const order = [
        ...((stage.metadata.drawOrder ?? stage.participantIds) as string[]),
      ];
      for (const match of [...matches].sort(
        (a, b) => a.round - b.round || a.index - b.index,
      )) {
        if (match.status !== "completed" || !match.result) continue;
        const winner = match.result.winnerIds[0];
        const loser = match.slots.find(
          (slot) => slot.participantId && slot.participantId !== winner,
        )?.participantId;
        if (loser && order.indexOf(winner) > order.indexOf(loser)) {
          const first = order.indexOf(winner);
          const second = order.indexOf(loser);
          [order[first], order[second]] = [order[second], order[first]];
        }
      }
      stage.metadata.ladderOrder = order;
    }
    if (stage.format === "triple-elimination") {
      const losses = new Map(stage.participantIds.map((id) => [id, 0]));
      for (const match of matches) {
        if (match.status !== "completed" || !match.result) continue;
        for (const slot of match.slots)
          if (
            slot.participantId &&
            !match.result.winnerIds.includes(slot.participantId)
          )
            losses.set(
              slot.participantId,
              (losses.get(slot.participantId) ?? 0) + 1,
            );
      }
      const remaining = [...losses].filter(
        ([id, count]) =>
          count < 3 &&
          tournament.participants.find((participant) => participant.id === id)
            ?.status === "active",
      );
      complete = complete && remaining.length <= 1;
      if (complete && remaining.length)
        stage.metadata.championId = remaining[0][0];
    }
    stage.status = complete ? "completed" : "active";
    if (complete) {
      const final = matches.find(
        (match) => match.metadata.championship && match.status !== "canceled",
      );
      const grandFinal = matches.find((match) => match.bracket === "final");
      const championId = (final?.result ?? grandFinal?.result)?.winnerIds[0];
      if (championId) stage.metadata.championId = championId;
      if (stage.format === "ladder")
        stage.metadata.championId = (stage.metadata.ladderOrder as string[])[0];
    } else delete stage.metadata.championId;
  }
  if (
    tournament.stages.length &&
    tournament.stages.every((stage) => stage.status === "completed")
  )
    tournament.status = "completed";
  else if (
    tournament.matches.some((match) =>
      ["completed", "live", "contested"].includes(match.status),
    )
  )
    tournament.status = "in-progress";
}

export function advanceStage(input: Tournament, stageId: string): Tournament {
  const tournament = structuredClone(input);
  const stage = requireStage(tournament, stageId);
  const matches = tournament.matches.filter(
    (match) => match.stageId === stageId,
  );
  if (!matches.length) return generateStage(tournament, stageId);
  refresh(tournament);
  if (!dynamic.has(stage.format) || stage.status === "completed")
    return tournament;
  if (!matches.every(terminal))
    throw new Error(
      "Complete the current round before generating the next round.",
    );
  const round = Math.max(...matches.map((match) => match.round)) + 1;
  const next =
    stage.format === "swiss"
      ? swissRound(tournament, stage, round)
      : stage.format === "triple-elimination"
        ? tripleRound(tournament, stage, round)
        : ladderRound(stage, round);
  if (!next.length)
    throw new Error("There are no valid matches for the next round.");
  if (next.length + tournament.matches.length > 20000)
    throw new Error("The document has reached its match limit.");
  tournament.matches.push(...next);
  refresh(tournament);
  return tournament;
}

export function validateGraph(tournament: Tournament): string[] {
  const errors: string[] = [];
  const participants = new Set(
    tournament.participants.map((participant) => participant.id),
  );
  const stages = new Map(tournament.stages.map((stage) => [stage.id, stage]));
  const matches = new Map(tournament.matches.map((match) => [match.id, match]));
  if (participants.size !== tournament.participants.length)
    errors.push("Participant identifiers must be unique.");
  if (stages.size !== tournament.stages.length)
    errors.push("Stage identifiers must be unique.");
  if (matches.size !== tournament.matches.length)
    errors.push("Match identifiers must be unique.");
  for (const stage of tournament.stages) {
    errors.push(...advancementErrors(tournament, stage));
    errors.push(
      ...groupDrawErrors(tournament, stage).map((issue) =>
        groupDrawIssueText(issue),
      ),
    );
    if (
      new Set(stage.participantIds).size !== stage.participantIds.length ||
      stage.participantIds.some((id) => !participants.has(id))
    )
      errors.push(`Invalid entrants in ${stage.name}.`);
    for (const source of stage.sources) {
      if (!stages.has(source.stageId))
        errors.push(`Missing advancement source in ${stage.name}.`);
      if (
        !Number.isInteger(source.count) ||
        source.count < 1 ||
        source.count > 512
      )
        errors.push(`Invalid qualification count in ${stage.name}.`);
    }
  }
  for (const match of tournament.matches) {
    if (!stages.has(match.stageId))
      errors.push("A match references a missing stage.");
    const occupied = match.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    );
    if (
      new Set(occupied).size !== occupied.length ||
      occupied.some((id) => !participants.has(id))
    )
      errors.push(`Invalid entrants in ${match.label}.`);
    for (const slot of match.slots)
      if (slot.source && !matches.has(slot.source.matchId))
        errors.push(`Broken source slot in ${match.label}.`);
  }
  const cyclic = (
    nodes: string[],
    edges: (id: string) => string[],
  ): boolean => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (done.has(id)) return false;
      visiting.add(id);
      if (edges(id).some(visit)) return true;
      visiting.delete(id);
      done.add(id);
      return false;
    };
    return nodes.some(visit);
  };
  if (
    cyclic(
      [...stages.keys()],
      (id) => stages.get(id)?.sources.map((source) => source.stageId) ?? [],
    )
  )
    errors.push("Stage dependencies contain a cycle.");
  if (
    cyclic(
      [...matches.keys()],
      (id) =>
        matches
          .get(id)
          ?.slots.flatMap((slot) =>
            slot.source ? [slot.source.matchId] : [],
          ) ?? [],
    )
  )
    errors.push("Match dependencies contain a cycle.");
  return [...new Set(errors)];
}

export function getChampion(tournament: Tournament): Participant | undefined {
  const downstream = new Set(
    tournament.stages.flatMap((stage) =>
      stage.sources.map((source) => source.stageId),
    ),
  );
  const finals = tournament.stages
    .filter((stage) => !downstream.has(stage.id))
    .sort((a, b) => b.order - a.order);
  if (finals.length !== 1 || finals[0].status !== "completed") return undefined;
  const stage = finals[0];
  if (
    (stage.format === "groups" || stage.format === "gsl") &&
    new Set(
      tournament.matches
        .filter((match) => match.stageId === stage.id)
        .map((match) => match.group),
    ).size > 1
  )
    return undefined;
  const standings = getStandings(tournament, stage.id);
  const id =
    typeof stage.metadata.championId === "string"
      ? stage.metadata.championId
      : standings[0]?.tied
        ? undefined
        : standings[0]?.participantId;
  return tournament.participants.find((participant) => participant.id === id);
}

/** Simulation returns a separate document. It never modifies the organizer's copy. */
export function simulate(input: Tournament): Tournament {
  let tournament = structuredClone(input);
  for (let iteration = 0; iteration < 25000; iteration++) {
    const draft = tournament.stages.find(
      (stage) =>
        stage.status === "draft" &&
        stage.sources.every(
          (source) =>
            tournament.stages.find((item) => item.id === source.stageId)
              ?.status === "completed",
        ),
    );
    if (draft) {
      tournament = generateStage(tournament, draft.id);
      continue;
    }
    const match = tournament.matches.find(
      (item) =>
        item.status === "ready" ||
        item.status === "live" ||
        item.status === "postponed",
    );
    if (match) {
      const stage = requireStage(tournament, match.stageId);
      const low =
        tournament.rules.scoring === "low" ||
        tournament.rules.scoring === "time" ||
        stage.format === "time-trial";
      const ranking = [...tournament.participants].sort(
        (a, b) => a.seed - b.seed || a.id.localeCompare(b.id),
      );
      const rankedIds = ranking.map((participant) => participant.id);
      const winningId = [...match.slots].sort(
        (a, b) =>
          rankedIds.indexOf(a.participantId!) -
          rankedIds.indexOf(b.participantId!),
      )[0].participantId!;
      // Seed-based outcomes avoid accidental all-equal league simulations.
      const scores = match.slots.map((slot) => {
        const rank = rankedIds.indexOf(slot.participantId!);
        return low ? rank + 1 : rankedIds.length - rank;
      });
      const winnerIndex = match.slots.findIndex(
        (slot) => slot.participantId === winningId,
      );
      const result: MatchResult = {
        scores,
        winnerIds: [winningId],
        outcome: "played",
        recordedAt: tournament.updatedAt,
        ...(tournament.rules.scoring === "sets"
          ? {
              sets: Array.from(
                { length: Math.floor(tournament.rules.bestOf / 2) + 1 },
                () =>
                  match.slots.map((_, index) =>
                    index === winnerIndex ? 1 : 0,
                  ),
              ),
            }
          : {}),
      };
      tournament = recordResult(tournament, match.id, result);
      continue;
    }
    const active = tournament.stages.find(
      (stage) => stage.status === "active" && dynamic.has(stage.format),
    );
    if (active) {
      tournament = advanceStage(tournament, active.id);
      continue;
    }
    refresh(tournament);
    return tournament;
  }
  throw new Error("The simulation exceeded its safety limit.");
}
