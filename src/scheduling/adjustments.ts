import type { Tournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import { hasMatchEvidence } from "../engine/match-evidence";
import {
  detectConflicts,
  detectConflictsCore,
  possibleEntrants,
} from "./index";
import {
  hasAggregateBookings,
  expandedSchedule,
  collapsedSchedule,
  legCount,
  scheduleOccurrences,
} from "./legs";

export interface ScheduleChange {
  matchId: string;
  before: string;
  after: string;
  beforeResource?: string;
  afterResource?: string;
  beforeMinutes?: number;
  afterMinutes?: number;
}
export interface SchedulePreview {
  tournament: Tournament;
  changes: ScheduleChange[];
  conflicts: string[];
}
const active = (status: string) => !["bye", "canceled"].includes(status);
export function compareSchedules(
  before: Tournament,
  after: Tournament,
): SchedulePreview {
  const original = new Map(scheduleOccurrences(before).map((m) => [m.id, m]));
  const nextOccurrences = scheduleOccurrences(after);
  const nextIds = new Set(nextOccurrences.map((m) => m.id));
  return {
    tournament: validateTournament(after),
    changes: [
      ...nextOccurrences.flatMap((m) => {
        const old = original.get(m.id);
        return old?.scheduledAt !== m.scheduledAt ||
          old?.resourceId !== m.resourceId ||
          old?.durationMinutes !== m.durationMinutes
          ? [
              {
                matchId: m.id,
                before: old?.scheduledAt ?? "",
                after: m.scheduledAt ?? "",
                beforeResource: old?.resourceId,
                afterResource: m.resourceId,
                beforeMinutes:
                  old?.durationMinutes ?? before.schedule.matchMinutes,
                afterMinutes: m.durationMinutes ?? after.schedule.matchMinutes,
              },
            ]
          : [];
      }),
      ...[...original.values()]
        .filter((m) => !nextIds.has(m.id))
        .map((m) => ({
          matchId: m.id,
          before: m.scheduledAt ?? "",
          after: "",
          beforeResource: m.resourceId,
          beforeMinutes: m.durationMinutes ?? before.schedule.matchMinutes,
          afterMinutes: 0,
        })),
    ],
    conflicts: detectConflicts(after),
  };
}
export function moveScheduledMatch(
  input: Tournament,
  matchId: string,
  scheduledAt: string,
  resourceId: string,
): SchedulePreview {
  if (hasAggregateBookings(input)) {
    const expanded = expandedSchedule(input);
    const item = expanded.matches.find((m) => m.id === matchId);
    if (!item)
      throw new Error("Select an individual aggregate leg on the timeline.");
    const origin = input.matches.find(
      (m) => m.id === item.metadata.scheduleOrigin,
    )!;
    const leg = Number(item.metadata.scheduleLeg);
    if (origin.aggregateProgress?.[leg - 1])
      throw new Error("A scored aggregate leg cannot be rescheduled.");
    const changed = moveScheduledMatchCore(
      expanded,
      matchId,
      scheduledAt,
      resourceId,
    );
    return compareSchedules(input, collapsedSchedule(input, changed));
  }
  return compareSchedules(
    input,
    moveScheduledMatchCore(input, matchId, scheduledAt, resourceId),
  );
}
function moveScheduledMatchCore(
  input: Tournament,
  matchId: string,
  scheduledAt: string,
  resourceId: string,
): Tournament {
  const result = structuredClone(input);
  const match = result.matches.find((m) => m.id === matchId);
  if (!match || !active(match.status) || hasMatchEvidence(match))
    throw new Error("Only unplayed matches can move on the timeline.");
  const stage = result.stages.find((s) => s.id === match.stageId)!;
  if (legCount(result, match) > 1)
    throw new Error(
      "Edit individual aggregate legs in the leg schedule editor.",
    );
  const fixed = assignedKnockoutVenue(stage, match);
  if (fixed && fixed !== resourceId)
    throw new Error("The draw fixes this match to its assigned venue.");
  if (
    !Number.isFinite(Date.parse(scheduledAt)) ||
    !result.schedule.resources.some((r) => r.id === resourceId)
  )
    throw new Error("Choose a valid timeline time and venue.");
  match.scheduledAt = new Date(scheduledAt).toISOString();
  match.resourceId = resourceId;
  return result;
}

/** A delay keeps the published order and moves only the necessary later starts. */
export function propagateDelay(
  input: Tournament,
  matchId: string,
  delayMinutes: number,
  extendDuration = false,
): SchedulePreview {
  if (hasAggregateBookings(input)) {
    const expanded = expandedSchedule(input);
    const first = expanded.matches.find(
      (m) => m.id === matchId || m.metadata.scheduleOrigin === matchId,
    );
    if (!first)
      throw new Error("Choose a scheduled unfinished match for the delay.");
    const changed = propagateDelayCore(
      expanded,
      first.id,
      delayMinutes,
      extendDuration,
      input,
    );
    return compareSchedules(input, collapsedSchedule(input, changed));
  }
  return compareSchedules(
    input,
    propagateDelayCore(input, matchId, delayMinutes, extendDuration, input),
  );
}
function propagateDelayCore(
  input: Tournament,
  matchId: string,
  delayMinutes: number,
  extendDuration: boolean,
  venueSource: Tournament,
): Tournament {
  if (
    !Number.isInteger(delayMinutes) ||
    delayMinutes < 1 ||
    delayMinutes > 1440
  )
    throw new Error("Delay must be between 1 and 1440 whole minutes.");
  const original = input.matches.find((m) => m.id === matchId);
  if (!original?.scheduledAt || original.result || !active(original.status))
    throw new Error("Choose a scheduled unfinished match for the delay.");
  if (hasMatchEvidence(original) && !extendDuration)
    throw new Error(
      "Extend the duration of a live match instead of changing its start.",
    );
  if (input.matches.some((m) => active(m.status) && !m.scheduledAt))
    throw new Error("Schedule every match before propagating a delay.");
  if (detectConflictsCore(input, input.locale, venueSource).length)
    throw new Error(
      "Resolve existing schedule conflicts before propagating a delay.",
    );
  const result = structuredClone(input);
  const chosen = result.matches.find((m) => m.id === matchId)!;
  if (extendDuration)
    chosen.durationMinutes =
      (chosen.durationMinutes ?? result.schedule.matchMinutes) + delayMinutes;
  else
    chosen.scheduledAt = new Date(
      Date.parse(chosen.scheduledAt!) + delayMinutes * 60000,
    ).toISOString();
  const possible = possibleEntrants(result);
  const participantEnds = new Map<string, number>();
  const resourceEnds = new Map<string, number>();
  const refereeEnds = new Map<string, number>();
  const matchEnds = new Map<string, number>();
  const stageEnds = new Map<string, number>();
  const rest = result.schedule.restMinutes * 60000;
  const startTimes = new Map(
    input.matches.map((m) => [m.id, Date.parse(m.scheduledAt ?? "")]),
  );
  const ordered = result.matches
    .filter((m) => active(m.status))
    .sort(
      (a, b) =>
        startTimes.get(a.id)! - startTimes.get(b.id)! ||
        a.id.localeCompare(b.id),
    );
  for (const match of ordered) {
    const stage = result.stages.find((s) => s.id === match.stageId)!;
    const ids = possible.get(match.id)!;
    const earliest = Math.max(
      Date.parse(match.scheduledAt!),
      resourceEnds.get(match.resourceId!) ?? -Infinity,
      match.referee ? (refereeEnds.get(match.referee) ?? -Infinity) : -Infinity,
      ...[...ids].map((id) => (participantEnds.get(id) ?? -Infinity) + rest),
      ...match.slots.flatMap((s) =>
        s.source ? [(matchEnds.get(s.source.matchId) ?? -Infinity) + rest] : [],
      ),
      ...stage.sources.flatMap((s) =>
        s.selection?.kind === "match-results"
          ? s.selection.picks.map(
              (p) => (matchEnds.get(p.matchId) ?? -Infinity) + rest,
            )
          : [(stageEnds.get(s.stageId) ?? -Infinity) + rest],
      ),
    );
    if (earliest !== Date.parse(match.scheduledAt!) && hasMatchEvidence(match))
      throw new Error(
        "The delay would move a played or live match. Resolve that conflict explicitly.",
      );
    match.scheduledAt = new Date(earliest).toISOString();
    const end =
      earliest +
      (match.durationMinutes ?? result.schedule.matchMinutes) * 60000;
    matchEnds.set(match.id, end);
    stageEnds.set(
      match.stageId,
      Math.max(stageEnds.get(match.stageId) ?? 0, end),
    );
    resourceEnds.set(match.resourceId!, end);
    if (match.referee) refereeEnds.set(match.referee, end);
    ids.forEach((id) => participantEnds.set(id, end));
  }
  return result;
}
