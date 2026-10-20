import type { Match, Tournament } from "../domain/types";

const minutes = 60000;
const playable = (match: Match) =>
  match.status !== "bye" && match.status !== "canceled";
const duration = (tournament: Tournament, match: Match) =>
  (match.durationMinutes ?? tournament.schedule.matchMinutes) * minutes;

function possibleEntrants(tournament: Tournament): Map<string, Set<string>> {
  const index = new Map(tournament.matches.map((match) => [match.id, match]));
  const memo = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const find = (id: string): Set<string> => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id))
      throw new Error("A schedule cannot contain cyclic match dependencies.");
    visiting.add(id);
    const match = index.get(id);
    const result = new Set<string>();
    for (const slot of match?.slots ?? []) {
      if (slot.participantId) result.add(slot.participantId);
      else if (slot.source)
        for (const participantId of find(slot.source.matchId))
          result.add(participantId);
    }
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };
  for (const match of tournament.matches) find(match.id);
  return memo;
}

export function autoSchedule(input: Tournament): Tournament {
  const tournament = structuredClone(input);
  const { resources, restMinutes, matchMinutes } = tournament.schedule;
  const start = Date.parse(tournament.schedule.startAt);
  if (!Number.isFinite(start))
    throw new Error("Choose a valid schedule start time.");
  if (!resources.length) throw new Error("Add at least one playing resource.");
  if (
    !Number.isFinite(matchMinutes) ||
    matchMinutes < 1 ||
    !Number.isFinite(restMinutes) ||
    restMinutes < 0
  )
    throw new Error(
      "Match duration must be positive and rest time cannot be negative.",
    );
  if (
    new Set(resources.map((resource) => resource.id)).size !== resources.length
  )
    throw new Error("Resource identifiers must be unique.");
  const resourceReady = new Map(
    resources.map((resource) => [
      resource.id,
      Math.max(
        start,
        resource.availableFrom ? Date.parse(resource.availableFrom) : start,
      ),
    ]),
  );
  const participantReady = new Map<string, number>();
  const refereeReady = new Map<string, number>();
  const ends = new Map<string, number>();
  const possible = possibleEntrants(tournament);
  const remaining = [...tournament.matches].sort((a, b) => {
    const orderA =
      tournament.stages.find((stage) => stage.id === a.stageId)?.order ?? 0;
    const orderB =
      tournament.stages.find((stage) => stage.id === b.stageId)?.order ?? 0;
    return orderA - orderB || a.round - b.round || a.index - b.index;
  });
  const stageMatches = new Map(
    tournament.stages.map((stage) => [
      stage.id,
      tournament.matches
        .filter((match) => match.stageId === stage.id)
        .map((match) => match.id),
    ]),
  );
  while (remaining.length) {
    const nextIndex = remaining.findIndex((match) => {
      const dependencies = match.slots.flatMap((slot) =>
        slot.source ? [slot.source.matchId] : [],
      );
      const stage = tournament.stages.find(
        (stage) => stage.id === match.stageId,
      )!;
      dependencies.push(
        ...stage.sources.flatMap(
          (source) => stageMatches.get(source.stageId) ?? [],
        ),
      );
      return dependencies.every((id) => ends.has(id));
    });
    if (nextIndex < 0)
      throw new Error("The schedule has a missing or cyclic dependency.");
    const match = remaining.splice(nextIndex, 1)[0];
    const stage = tournament.stages.find(
      (stage) => stage.id === match.stageId,
    )!;
    const dependencies = match.slots.flatMap((slot) =>
      slot.source ? [slot.source.matchId] : [],
    );
    dependencies.push(
      ...stage.sources.flatMap(
        (source) => stageMatches.get(source.stageId) ?? [],
      ),
    );
    const dependencyEnd = Math.max(
      start,
      ...dependencies.map(
        (id) => (ends.get(id) ?? start) + restMinutes * minutes,
      ),
    );
    if (!playable(match)) {
      ends.set(
        match.id,
        dependencies.length
          ? Math.max(start, ...dependencies.map((id) => ends.get(id) ?? start))
          : start,
      );
      delete match.scheduledAt;
      delete match.resourceId;
      continue;
    }
    const ids = [...(possible.get(match.id) ?? [])];
    const availableFrom = ids
      .map(
        (id) =>
          tournament.participants.find((participant) => participant.id === id)
            ?.metadata.availableFrom,
      )
      .filter((value): value is string => typeof value === "string")
      .map((value) => Date.parse(value));
    const earliest = Math.max(
      start,
      dependencyEnd,
      ...ids.map((id) => participantReady.get(id) ?? start),
      ...availableFrom,
      match.referee ? (refereeReady.get(match.referee) ?? start) : start,
    );
    if (!Number.isFinite(earliest))
      throw new Error(
        "A participant or resource has an invalid availability time.",
      );
    const matchDuration = duration(tournament, match);
    if (!Number.isFinite(matchDuration) || matchDuration <= 0)
      throw new Error("Every match needs a positive duration.");
    const options = resources
      .map((resource) => ({
        resource,
        at: Math.max(earliest, resourceReady.get(resource.id)!),
      }))
      .filter(
        (option) =>
          !option.resource.availableUntil ||
          option.at + matchDuration <=
            Date.parse(option.resource.availableUntil),
      )
      .filter((option) =>
        ids.every((id) => {
          const until = tournament.participants.find(
            (participant) => participant.id === id,
          )?.metadata.availableUntil;
          return (
            typeof until !== "string" ||
            option.at + matchDuration <= Date.parse(until)
          );
        }),
      )
      .sort(
        (a, b) => a.at - b.at || a.resource.id.localeCompare(b.resource.id),
      );
    if (!options.length)
      throw new Error(
        `No available resource or participant time window can fit ${match.label}.`,
      );
    const choice = options[0];
    match.scheduledAt = new Date(choice.at).toISOString();
    match.resourceId = choice.resource.id;
    const end = choice.at + matchDuration;
    ends.set(match.id, end);
    resourceReady.set(choice.resource.id, end);
    for (const id of ids) participantReady.set(id, end + restMinutes * minutes);
    if (match.referee) refereeReady.set(match.referee, end);
  }
  return tournament;
}

export function detectConflicts(tournament: Tournament): string[] {
  const conflicts: string[] = [];
  const possible = possibleEntrants(tournament);
  const matches = tournament.matches.filter(
    (match) => playable(match) && match.scheduledAt,
  );
  const index = new Map(tournament.matches.map((match) => [match.id, match]));
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = Date.parse(match.scheduledAt!);
    const end = start + duration(tournament, match);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      conflicts.push(`${match.label} has an invalid time or duration.`);
      continue;
    }
    const resource = tournament.schedule.resources.find(
      (resource) => resource.id === match.resourceId,
    );
    if (!resource) conflicts.push(`${match.label} has no valid resource.`);
    else if (
      (resource.availableFrom && start < Date.parse(resource.availableFrom)) ||
      (resource.availableUntil && end > Date.parse(resource.availableUntil))
    )
      conflicts.push(`${match.label} is outside its resource availability.`);
    for (const id of possible.get(match.id) ?? []) {
      const metadata = tournament.participants.find(
        (participant) => participant.id === id,
      )?.metadata;
      if (
        (typeof metadata?.availableFrom === "string" &&
          start < Date.parse(metadata.availableFrom)) ||
        (typeof metadata?.availableUntil === "string" &&
          end > Date.parse(metadata.availableUntil))
      )
        conflicts.push(`${match.label} is outside participant availability.`);
    }
    for (const slot of match.slots) {
      const previous = slot.source ? index.get(slot.source.matchId) : undefined;
      if (
        previous?.scheduledAt &&
        start <
          Date.parse(previous.scheduledAt) +
            duration(tournament, previous) +
            tournament.schedule.restMinutes * minutes
      )
        conflicts.push(
          `${match.label} starts before its source match and rest period finish.`,
        );
    }
    const stage = tournament.stages.find((stage) => stage.id === match.stageId);
    for (const source of stage?.sources ?? []) {
      const prior = matches.filter((item) => item.stageId === source.stageId);
      if (
        prior.some(
          (item) =>
            start <
            Date.parse(item.scheduledAt!) +
              duration(tournament, item) +
              tournament.schedule.restMinutes * minutes,
        )
      ) {
        conflicts.push(
          `${match.label} starts before its qualifying stage and rest period finish.`,
        );
      }
    }
    for (let j = i + 1; j < matches.length; j++) {
      const other = matches[j];
      const otherStart = Date.parse(other.scheduledAt!);
      const otherEnd = otherStart + duration(tournament, other);
      const overlap = start < otherEnd && otherStart < end;
      if (overlap && match.resourceId && match.resourceId === other.resourceId)
        conflicts.push(
          `${match.label} and ${other.label} overlap on one resource.`,
        );
      if (overlap && match.referee && match.referee === other.referee)
        conflicts.push(
          `${match.label} and ${other.label} assign the same referee.`,
        );
      const rest = tournament.schedule.restMinutes * minutes;
      if (
        start < otherEnd + rest &&
        otherStart < end + rest &&
        [...(possible.get(match.id) ?? [])].some((id) =>
          possible.get(other.id)?.has(id),
        )
      ) {
        conflicts.push(
          `${match.label} and ${other.label} may share an entrant without enough rest.`,
        );
      }
    }
  }
  return [...new Set(conflicts)];
}

export function estimateDuration(tournament: Tournament): {
  matches: number;
  resources: number;
  minimumMinutes: number;
  scheduledMinutes?: number;
  assumptions: string;
} {
  const matches = tournament.matches.filter(playable);
  const resources = Math.max(1, tournament.schedule.resources.length);
  const total = matches.reduce(
    (sum, match) => sum + duration(tournament, match) / minutes,
    0,
  );
  const scheduled = matches.filter((match) => match.scheduledAt);
  return {
    matches: matches.length,
    resources,
    minimumMinutes: Math.ceil(total / resources),
    ...(scheduled.length
      ? {
          scheduledMinutes: Math.ceil(
            (Math.max(
              ...scheduled.map(
                (match) =>
                  Date.parse(match.scheduledAt!) + duration(tournament, match),
              ),
            ) -
              Math.min(
                ...scheduled.map((match) => Date.parse(match.scheduledAt!)),
              )) /
              minutes,
          ),
        }
      : {}),
    assumptions:
      "The minimum divides total playing time by resources. Dependencies, rest, availability and future dynamic rounds can increase it.",
  };
}
