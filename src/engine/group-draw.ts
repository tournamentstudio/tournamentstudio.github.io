import type {
  GroupDrawIssue,
  GroupDrawPreview,
  Stage,
  Tournament,
} from "../domain/types";
import {
  groupDrawErrors,
  groupDrawIssueText,
  normalizeDrawLabel,
} from "../domain/draw";
import { previewAdvancement } from "./advancement";
import { distributeGroups } from "./formats";
import { DRAW_ALGORITHM, shuffle } from "./random";

export const GROUP_DRAW_ALGORITHM = "group-csp-fnv1a-mulberry32-v1";
export const GROUP_DRAW_NODE_LIMIT = 100000;
export const GROUP_DRAW_WORK_LIMIT = 20000000;

function orderedEntrants(
  tournament: Tournament,
  stage: Stage,
  ids: string[],
): string[] {
  if (stage.config.seeding === "random") return shuffle(ids, stage.config.seed);
  if (stage.config.seeding === "manual" || stage.sources.length)
    return [...ids];
  const seeds = new Map(tournament.participants.map((p) => [p.id, p.seed]));
  return [...ids].sort(
    (a, b) =>
      seeds.get(a)! - seeds.get(b)! ||
      (stage.config.draw ? (a < b ? -1 : a > b ? 1 : 0) : a.localeCompare(b)),
  );
}

/** A preview is pure. Generation commits exactly these groups after draw locks pass. */
export function previewGroupDraw(
  tournament: Tournament,
  stageId: string,
): GroupDrawPreview {
  const stage = tournament.stages.find((item) => item.id === stageId);
  const issueDetails: GroupDrawIssue[] = [];
  let participantIds: string[] = [];
  let exploredNodes = 0;
  const add = (code: string, ...values: string[]) =>
    issueDetails.push({ code, values });
  const result = (groups: string[][] = []): GroupDrawPreview => ({
    ready: issueDetails.length === 0,
    groups,
    participantIds,
    issues: issueDetails.map((issue) => groupDrawIssueText(issue)),
    issueDetails,
    algorithm: stage?.config.draw ? GROUP_DRAW_ALGORITHM : DRAW_ALGORITHM,
    exploredNodes,
  });
  if (!stage) {
    add("stage");
    return result();
  }
  if (stage.format !== "groups" && stage.format !== "gsl") {
    add("format");
    return result();
  }
  issueDetails.push(...groupDrawErrors(tournament, stage));
  if (issueDetails.length) return result();
  let ids = stage.participantIds;
  if (stage.sources.length) {
    const advancement = previewAdvancement(tournament, stage.id);
    if (!advancement.ready) {
      add("source");
      return result();
    }
    ids = advancement.participantIds;
  }
  const participants = new Map(
    tournament.participants.map((item) => [item.id, item]),
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
  const count = participantIds.length;
  if (count < 2 || count > 512) add("count");
  const groupCount =
    stage.format === "gsl" ? count / 4 : stage.config.groupCount;
  if (stage.format === "gsl" && count % 4 !== 0) add("gsl");
  if (
    !Number.isInteger(groupCount) ||
    groupCount < 1 ||
    groupCount > 128 ||
    groupCount > count
  )
    add("groupCount");
  if (issueDetails.length) return result();
  const ordered = orderedEntrants(tournament, stage, participantIds);
  const draw = stage.config.draw;
  if (!draw) {
    if (stage.config.groups !== undefined) {
      const groups = stage.config.groups;
      if (
        !Array.isArray(groups) ||
        !groups.every(
          (group) =>
            Array.isArray(group) &&
            group.length > 0 &&
            group.every((id) => typeof id === "string"),
        ) ||
        groups.flat().length !== count ||
        new Set(groups.flat()).size !== count ||
        groups
          .flat()
          .some(
            (id) => typeof id !== "string" || !participantIds.includes(id),
          ) ||
        (stage.format === "gsl" &&
          groups.some((group) => (group as string[]).length !== 4))
      ) {
        add("manualInvalid");
        return result();
      }
      return result(structuredClone(groups) as string[][]);
    }
    return result(distributeGroups(ordered, groupCount));
  }
  const potById = new Map<string, number>();
  draw.pots.forEach((pot, index) => {
    if (!pot.participantIds.length) add("emptyPot");
    if (pot.participantIds.length > groupCount) add("potSize", pot.name);
    pot.participantIds.forEach((id) => potById.set(id, index));
  });
  if (
    draw.pots.length &&
    (potById.size !== count || participantIds.some((id) => !potById.has(id)))
  )
    add("incompletePots");
  const limits = new Map<string, number>();
  const keysById = new Map(participantIds.map((id) => [id, [] as string[]]));
  for (const [id, pot] of potById) {
    const key = `pot:${pot}`;
    limits.set(key, 1);
    keysById.get(id)?.push(key);
  }
  const capacities = Array.from(
    { length: groupCount },
    (_, index) =>
      Math.floor(count / groupCount) + Number(index < count % groupCount),
  );
  for (const restriction of draw.restrictions) {
    const labels = new Map<string, { name: string; count: number }>();
    let missing = false;
    for (const id of participantIds) {
      const raw = participants.get(id)![restriction.field] ?? "";
      const label = normalizeDrawLabel(raw);
      if (!label) {
        missing = true;
        continue;
      }
      const key = `${restriction.field}:${label}`;
      limits.set(key, restriction.maxPerGroup);
      keysById.get(id)!.push(key);
      const existing = labels.get(label);
      labels.set(label, {
        name: existing?.name ?? raw.trim(),
        count: (existing?.count ?? 0) + 1,
      });
    }
    if (missing)
      add(
        restriction.field === "region"
          ? "missingRegion"
          : "missingOrganization",
      );
    const available = capacities.reduce(
      (sum, capacity) => sum + Math.min(capacity, restriction.maxPerGroup),
      0,
    );
    for (const { name, count: total } of labels.values()) {
      if (total > available)
        add(
          restriction.field === "region"
            ? "regionCapacity"
            : "organizationCapacity",
          name,
          String(total),
          String(available),
        );
    }
  }
  if (issueDetails.length) return result();
  if (!draw.pots.length && !draw.restrictions.length) {
    const groups: string[][] = capacities.map(() => []);
    ordered.forEach((id, index) => groups[index % groupCount].push(id));
    return result(groups);
  }

  const groups: string[][] = capacities.map(() => []);
  const used = capacities.map(() => new Map<string, number>());
  const frequency = new Map<string, number>();
  for (const keys of keysById.values())
    for (const key of keys) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  const entrants = shuffle(ordered, `${stage.config.seed}|entrants`)
    .map((id) => ({
      id,
      keys: keysById.get(id)!,
      priority: keysById
        .get(id)!
        .reduce(
          (sum, key) => sum + (frequency.get(key) ?? 0) / limits.get(key)!,
          0,
        ),
      groupOrder: shuffle(
        capacities.map((_, index) => index),
        `${stage.config.seed}|groups|${id}`,
      ),
    }))
    .sort((a, b) => b.priority - a.priority);
  const assigned = new Set<string>();
  let exhausted = false;
  let work = 0;
  const allowed = (item: (typeof entrants)[number], group: number): boolean => {
    work++;
    return (
      groups[group].length < capacities[group] &&
      item.keys.every((key) => (used[group].get(key) ?? 0) < limits.get(key)!)
    );
  };
  const search = (): boolean => {
    if (assigned.size === count) return true;
    if (
      exploredNodes >= GROUP_DRAW_NODE_LIMIT ||
      work >= GROUP_DRAW_WORK_LIMIT
    ) {
      exhausted = true;
      return false;
    }
    exploredNodes++;
    let chosen: (typeof entrants)[number] | undefined;
    let candidates: number[] = [];
    for (const item of entrants) {
      if (assigned.has(item.id)) continue;
      const available = item.groupOrder.filter((group) => allowed(item, group));
      if (!available.length) return false;
      if (!chosen || available.length < candidates.length) {
        chosen = item;
        candidates = available;
        if (available.length === 1) break;
      }
      if (work >= GROUP_DRAW_WORK_LIMIT) {
        exhausted = true;
        return false;
      }
    }
    const item = chosen!;
    const equivalent = new Set<string>();
    for (const group of candidates) {
      // Empty or identical group states differ only by their displayed label.
      const signature = JSON.stringify([
        capacities[group],
        groups[group].length,
        [...used[group]].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ]);
      if (equivalent.has(signature)) continue;
      equivalent.add(signature);
      groups[group].push(item.id);
      assigned.add(item.id);
      for (const key of item.keys)
        used[group].set(key, (used[group].get(key) ?? 0) + 1);
      if (search()) return true;
      groups[group].pop();
      assigned.delete(item.id);
      for (const key of item.keys) {
        const remaining = used[group].get(key)! - 1;
        if (remaining) used[group].set(key, remaining);
        else used[group].delete(key);
      }
      if (exhausted) return false;
    }
    return false;
  };
  if (!search()) {
    add(exhausted ? "exhausted" : "infeasible");
    return result();
  }
  return result(groups);
}
