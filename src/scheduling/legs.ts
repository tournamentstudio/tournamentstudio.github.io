import { generatedMatchLabel } from "../i18n/match-labels";
import type { Match, Tournament } from "../domain/types";
export type LegBooking = {
  leg: number;
  scheduledAt: string;
  resourceId?: string;
  durationMinutes?: number;
};
type AggregateMatch = Match & { legSchedule?: LegBooking[] };
export function legCount(tournament: Tournament, match: Match): number {
  if (match.status === "bye" || match.status === "canceled") return 1;
  const config = tournament.stages.find((s) => s.id === match.stageId)?.config
    .aggregate;
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("legs" in config)
  )
    return 1;
  const count = Number(config.legs);
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 8 ||
    (match as AggregateMatch).legSchedule?.some(
      (l) => !Number.isInteger(l.leg) || l.leg < 1 || l.leg > 9,
    )
  )
    throw new Error(
      "Aggregate schedules need 2 to 8 legs and at most one extra leg.",
    );
  return Math.max(
    count,
    match.result?.legs?.length ?? 0,
    match.aggregateProgress?.length ?? 0,
    ...((match as AggregateMatch).legSchedule ?? []).map((l) => l.leg),
  );
}
export const hasAggregateBookings = (t: Tournament) =>
  t.matches.some((m) => legCount(t, m) > 1);
export function expandedSchedule(input: Tournament): Tournament {
  const output = structuredClone(input);
  const counts = new Map(input.matches.map((m) => [m.id, legCount(input, m)]));
  if ([...counts.values()].reduce((n, c) => n + c, 0) > 20000)
    throw new Error("The expanded schedule exceeds 20000 leg bookings.");
  const reserved = new Set(input.matches.map((m) => m.id));
  const virtualIds = new Map<string, string[]>();
  for (const match of input.matches) {
    const count = counts.get(match.id)!;
    virtualIds.set(
      match.id,
      Array.from({ length: count }, (_, index) => {
        if (count === 1) return match.id;
        let id = `${match.id}~leg~${index + 1}`;
        while (reserved.has(id)) id += "~";
        reserved.add(id);
        return id;
      }),
    );
  }
  const virtualId = (id: string, leg: number) =>
    virtualIds.get(id)?.[leg - 1] ?? id;
  const last = (id: string) => virtualId(id, counts.get(id) ?? 1);
  output.matches = input.matches.flatMap((match) =>
    Array.from({ length: counts.get(match.id)! }, (_, index) => {
      const leg = index + 1;
      const booking = (match as AggregateMatch).legSchedule?.find(
        (b) => b.leg === leg,
      );
      const copy: Match = {
        ...structuredClone(match),
        id: virtualId(match.id, leg),
        label:
          counts.get(match.id)! > 1
            ? `${generatedMatchLabel(match, input.locale)} (${input.locale === "fa" ? "بازی رفت‌وبرگشت" : "Leg"} ${leg.toLocaleString(input.locale)})`
            : match.label,
        slots: match.slots.map((s) => ({
          ...s,
          ...(s.source
            ? { source: { ...s.source, matchId: last(s.source.matchId) } }
            : {}),
        })),
        metadata: {
          ...match.metadata,
          scheduleOrigin: match.id,
          scheduleLeg: leg,
        },
      };
      delete (copy as AggregateMatch).legSchedule;
      if (counts.get(match.id)! > 1) {
        const scores =
          match.result?.legs?.[index] ?? match.aggregateProgress?.[index];
        // A temporary booking carries only the evidence of its own leg.
        delete copy.aggregateProgress;
        delete copy.liveScores;
        if (scores) {
          copy.result = {
            scores,
            winnerIds: [],
            outcome: "played",
            recordedAt: match.result?.recordedAt ?? input.updatedAt,
          };
          copy.status = "completed";
        } else if (
          !match.result &&
          match.status === "live" &&
          index > (match.aggregateProgress?.length ?? 0)
        ) {
          copy.status = "ready";
        }
        copy.scheduledAt =
          booking?.scheduledAt ??
          (leg === 1 && !(match as AggregateMatch).legSchedule?.length
            ? match.scheduledAt
            : undefined);
        copy.resourceId = booking?.resourceId ?? match.resourceId;
        copy.durationMinutes =
          booking?.durationMinutes ?? match.durationMinutes;
        if (leg > 1)
          copy.slots.push({
            source: { matchId: virtualId(match.id, leg - 1), result: "winner" },
          });
      }
      return copy;
    }),
  );
  for (const stage of output.stages) {
    delete stage.config.aggregate;
    stage.sources = stage.sources.map((s) => ({
      ...s,
      ...(s.selection?.kind === "match-results"
        ? {
            selection: {
              ...s.selection,
              picks: s.selection.picks.map((p) => ({
                ...p,
                matchId: last(p.matchId),
              })),
            },
          }
        : {}),
    }));
  }
  return output;
}
export function collapsedSchedule(
  input: Tournament,
  expanded: Tournament,
): Tournament {
  const result = structuredClone(input);
  const byOrigin = new Map<string, Match[]>();
  for (const m of expanded.matches) {
    const origin =
      typeof m.metadata.scheduleOrigin === "string"
        ? m.metadata.scheduleOrigin
        : m.id;
    byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), m]);
  }
  for (const m of result.matches) {
    const legs = (byOrigin.get(m.id) ?? []).sort(
      (a, b) =>
        Number(a.metadata.scheduleLeg ?? 1) -
        Number(b.metadata.scheduleLeg ?? 1),
    );
    const first = legs[0];
    if (!first) continue;
    m.scheduledAt = first.scheduledAt;
    m.resourceId = first.resourceId;
    if (legCount(input, m) > 1)
      (m as AggregateMatch).legSchedule = legs
        .filter((l) => l.scheduledAt)
        .map((l) => ({
          leg: Number(l.metadata.scheduleLeg),
          scheduledAt: l.scheduledAt!,
          ...(l.resourceId ? { resourceId: l.resourceId } : {}),
          ...(l.durationMinutes !== undefined
            ? { durationMinutes: l.durationMinutes }
            : {}),
        }));
    else m.durationMinutes = first.durationMinutes;
  }
  return result;
}
/** Visible exports use only original entrant slots, never synthetic leg dependencies. */
export function scheduleOccurrences(input: Tournament): Match[] {
  const expanded = expandedSchedule(input);
  const originals = new Map(input.matches.map((m) => [m.id, m]));
  return expanded.matches.map((m) => ({
    ...m,
    slots: originals.get(String(m.metadata.scheduleOrigin))!.slots,
  }));
}
