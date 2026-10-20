import type { Advancement, Stage, Tournament } from "./types";

export function sourceGroups(tournament: Tournament, stage: Stage): string[] {
  const groups = [
    ...new Set(
      tournament.matches
        .filter((match) => match.stageId === stage.id && match.group)
        .map((match) => match.group!),
    ),
  ];
  if (groups.length) return groups.sort();
  const count = Array.isArray(stage.config.groups)
    ? stage.config.groups.length
    : stage.format === "groups"
      ? stage.config.groupCount
      : stage.format === "gsl"
        ? Math.ceil(stage.participantIds.length / 4)
        : 0;
  return Array.from({ length: count }, (_, index) =>
    String.fromCharCode(65 + index),
  );
}

export function sourceQuota(
  tournament: Tournament,
  source: Advancement,
): number {
  const previous = tournament.stages.find(
    (stage) => stage.id === source.stageId,
  );
  return (
    source.count *
    (source.perGroup && !source.selection && previous
      ? sourceGroups(tournament, previous).length
      : 1)
  );
}

function groupSize(
  tournament: Tournament,
  stage: Stage,
  group: string,
): number | undefined {
  const matches = tournament.matches.filter(
    (match) => match.stageId === stage.id && match.group === group,
  );
  if (matches.length)
    return new Set(
      matches.flatMap((match) =>
        match.slots.flatMap((slot) =>
          slot.participantId ? [slot.participantId] : [],
        ),
      ),
    ).size;
  const index = sourceGroups(tournament, stage).indexOf(group);
  const configured = stage.config.groups;
  if (Array.isArray(configured) && Array.isArray(configured[index]))
    return configured[index].length;
  if (stage.format === "gsl") return 4;
  if (stage.format === "groups" && stage.participantIds.length) {
    const count = stage.config.groupCount;
    if (stage.config.draw) {
      const active = new Set(
        tournament.participants
          .filter((participant) => participant.status === "active")
          .map((participant) => participant.id),
      );
      const entrants = stage.participantIds.filter((id) =>
        active.has(id),
      ).length;
      return Math.floor(entrants / count) + Number(index < entrants % count);
    }
    const sizes = Array.from({ length: count }, () => 0);
    for (let entrant = 0; entrant < stage.participantIds.length; entrant++) {
      const position =
        Math.floor(entrant / count) % 2
          ? count - 1 - (entrant % count)
          : entrant % count;
      sizes[position]++;
    }
    return sizes[index];
  }
  return undefined;
}

export function advancementErrors(
  tournament: Tournament,
  stage: Stage,
): string[] {
  const errors: string[] = [];
  const stages = new Map(tournament.stages.map((item) => [item.id, item]));
  const queue = stage.sources.map((source) => source.stageId);
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (id === stage.id) {
      errors.push("Stage dependencies contain a cycle.");
      break;
    }
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(
      ...(stages.get(id)?.sources.map((source) => source.stageId) ?? []),
    );
  }
  const directPicks = new Set<string>();
  const wildcardRules = new Set<string>();
  const slots = new Set<number>();
  let total = 0;
  for (const source of stage.sources) {
    const previous = tournament.stages.find(
      (item) => item.id === source.stageId,
    );
    if (!previous) {
      errors.push("An advancement source stage does not exist.");
      continue;
    }
    if (
      !Number.isInteger(source.count) ||
      source.count < 1 ||
      source.count > 512
    ) {
      errors.push("Advancement counts must be integers from 1 to 512.");
      continue;
    }
    const groups = sourceGroups(tournament, previous);
    const quota = sourceQuota(tournament, source);
    total += quota;
    const selected = source.selection;
    if (selected && source.perGroup)
      errors.push(
        "Explicit positions and wildcard rules cannot also select top entrants per group.",
      );
    if (!selected && source.perGroup && !groups.length)
      errors.push("Per-group advancement requires a grouped source stage.");
    const picks =
      selected?.kind === "positions"
        ? selected.picks
        : !selected
          ? (source.perGroup ? groups : [undefined]).flatMap((group) =>
              Array.from({ length: source.count }, (_, index) => ({
                group,
                rank: index + 1,
              })),
            )
          : [];
    if (
      selected?.kind === "positions" &&
      selected.picks.length !== source.count
    )
      errors.push("The position count must match the number of exact picks.");
    for (const pick of picks) {
      if (!Number.isInteger(pick.rank) || pick.rank < 1 || pick.rank > 512)
        errors.push("Finishing positions must be integers from 1 to 512.");
      if (pick.group !== undefined && !groups.includes(pick.group))
        errors.push(`The source has no group named ${pick.group}.`);
      if (
        previous.participantIds.length &&
        pick.rank > previous.participantIds.length
      )
        errors.push("A finishing position exceeds the source field size.");
      const size =
        pick.group === undefined
          ? undefined
          : groupSize(tournament, previous, pick.group);
      if (size !== undefined && pick.rank > size)
        errors.push(
          `Finishing position ${pick.rank} exceeds the size of group ${pick.group}.`,
        );
      const key = JSON.stringify([
        source.stageId,
        pick.group ?? null,
        pick.rank,
      ]);
      if (directPicks.has(key))
        errors.push("An advancement position is assigned more than once.");
      directPicks.add(key);
    }
    if (selected?.kind === "wildcard") {
      if (previous.format !== "groups")
        errors.push("Wildcard comparisons require a round-robin groups stage.");
      const selectedGroups = selected.groups ?? groups;
      if (
        !selectedGroups.length ||
        selectedGroups.some((group) => !groups.includes(group))
      )
        errors.push("A wildcard rule references an undefined group.");
      if (new Set(selectedGroups).size !== selectedGroups.length)
        errors.push("A wildcard rule repeats a group.");
      if (source.count > selectedGroups.length)
        errors.push(
          "The wildcard count exceeds the number of candidate groups.",
        );
      if (
        selectedGroups.some((group) => {
          const size = groupSize(tournament, previous, group);
          return size !== undefined && selected.rank > size;
        })
      )
        errors.push(
          "The wildcard finishing position exceeds a selected group size.",
        );
      if (
        !Number.isInteger(selected.rank) ||
        selected.rank < 1 ||
        selected.rank > 512
      )
        errors.push(
          "The wildcard finishing position must be an integer from 1 to 512.",
        );
      if (
        !["total", "per-match", "discard-bottom"].includes(selected.comparison)
      )
        errors.push("The wildcard comparison policy is not supported.");
      if (
        !selected.tieBreakers.length ||
        new Set(selected.tieBreakers).size !== selected.tieBreakers.length ||
        selected.tieBreakers.some(
          (breaker) =>
            !["points", "wins", "differential", "scored", "seed"].includes(
              breaker,
            ),
        )
      )
        errors.push("Choose distinct supported wildcard tie-breakers.");
      const key = JSON.stringify([
        source.stageId,
        selected.rank,
        [...selectedGroups].sort(),
      ]);
      if (wildcardRules.has(key))
        errors.push("A wildcard candidate pool is assigned more than once.");
      wildcardRules.add(key);
    }
    if (source.bracketSlots) {
      if (!["single-elimination", "double-elimination"].includes(stage.format))
        errors.push(
          "Physical bracket slots are supported for single and double elimination.",
        );
      if (source.bracketSlots.length !== quota)
        errors.push(
          "Provide one bracket slot for each qualifier from the source.",
        );
      for (const slot of source.bracketSlots) {
        if (!Number.isInteger(slot) || slot < 1 || slot > 512)
          errors.push("Bracket slots must be integers from 1 to 512.");
        if (slots.has(slot))
          errors.push("A physical bracket slot is assigned more than once.");
        slots.add(slot);
      }
    }
  }
  if (total > 512)
    errors.push("The destination cannot qualify more than 512 entrants.");
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, total)));
  if ([...slots].some((slot) => slot > size))
    errors.push("A physical bracket slot exceeds the destination draw size.");
  return [...new Set(errors)];
}
