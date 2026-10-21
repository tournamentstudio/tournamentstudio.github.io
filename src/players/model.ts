import { z } from "zod";
import {
  uid,
  type JsonValue,
  type Match,
  type Tournament,
} from "../domain/types";

const id = z.string().min(1).max(160);
const label = z.string().trim().min(1).max(160);
export const playerMetricSchema = z
  .object({
    id,
    label,
    fa: z.string().max(160).optional(),
    unit: z.string().max(40),
    type: z.enum(["integer", "decimal"]),
    aggregation: z.enum(["sum", "average", "min", "max"]),
    min: z.number().finite().min(-1e9).max(1e9),
    max: z.number().finite().min(-1e9).max(1e9),
    archived: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.min <= value.max,
    "The metric minimum cannot exceed its maximum.",
  );
const eventDataSchema = z
  .object({
    matchId: id,
    teamId: id,
    playerId: id,
    metricId: id,
    value: z.number().finite().min(-1e9).max(1e9),
    elapsedSeconds: z.number().finite().min(0).max(604800).optional(),
    period: z.string().max(80),
    notes: z.string().max(2000),
    entrantIds: z.array(id).min(1).max(512),
    playerName: z.string().min(1).max(240),
    teamName: z.string().min(1).max(240),
    matchLabel: z.string().max(240),
  })
  .strict();
export const playerEventSchema = eventDataSchema
  .extend({
    id,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(["active", "deleted", "quarantined"]),
    reason: z.string().max(300),
    history: z
      .array(
        z
          .object({
            at: z.string().datetime(),
            action: z.enum(["corrected", "deleted", "restored", "quarantined"]),
            reason: z.string().min(1).max(300),
            before: eventDataSchema,
            status: z.enum(["active", "deleted", "quarantined"]),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const playerStatisticsSchema = z
  .object({
    version: z.literal(1),
    metrics: z.array(playerMetricSchema).max(50),
    events: z.array(playerEventSchema).max(5000),
  })
  .strict();
export type PlayerMetric = z.infer<typeof playerMetricSchema>;
export type PlayerEvent = z.infer<typeof playerEventSchema>;
export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;
export type PlayerEventInput = Pick<
  PlayerEvent,
  | "matchId"
  | "teamId"
  | "playerId"
  | "metricId"
  | "value"
  | "elapsedSeconds"
  | "period"
  | "notes"
>;

export function readPlayerStatistics(doc: Tournament): PlayerStatistics {
  if (doc.metadata.playerStatistics === undefined)
    return { version: 1, metrics: [], events: [] };
  const result = playerStatisticsSchema.safeParse(
    doc.metadata.playerStatistics,
  );
  if (!result.success)
    throw new Error(
      "The player statistics package is invalid or uses an unsupported version.",
    );
  const data = result.data;
  if (
    new Set(data.metrics.map((m) => m.id)).size !== data.metrics.length ||
    new Set(data.events.map((e) => e.id)).size !== data.events.length
  )
    throw new Error("Player statistics contain duplicate identifiers.");
  return data;
}
export function rosterPlayers(doc: Tournament, teamId: string) {
  const team = doc.participants.find((p) => p.id === teamId);
  if (!team) return [];
  return team.kind === "individual"
    ? [{ id: team.id, name: team.name }]
    : team.roster.filter((p) => p.role !== "coach");
}
function entrants(match: Match): string[] {
  return match.slots
    .flatMap((s) => (s.participantId ? [s.participantId] : []))
    .sort();
}
export function playerEventIssue(
  doc: Tournament,
  event: PlayerEvent,
): string | undefined {
  const match = doc.matches.find((m) => m.id === event.matchId);
  if (!match) return "The event match was removed.";
  if (
    match.status === "bye" ||
    match.status === "canceled" ||
    match.slots.some((slot) => !slot.participantId) ||
    JSON.stringify(entrants(match)) !==
      JSON.stringify([...event.entrantIds].sort())
  )
    return "The event match participants changed or the match is unavailable.";
  if (!match.slots.some((s) => s.participantId === event.teamId))
    return "The event team is not in this match.";
  if (!rosterPlayers(doc, event.teamId).some((p) => p.id === event.playerId))
    return "The event player is no longer in this team roster.";
  if (
    rosterPlayers(doc, event.teamId).filter((p) => p.id === event.playerId)
      .length !== 1
  )
    return "Roster player identifiers must be unique within each team.";
  return undefined;
}
function validValue(metric: PlayerMetric, value: number) {
  if (
    !Number.isFinite(value) ||
    value < metric.min ||
    value > metric.max ||
    (metric.type === "integer" && !Number.isInteger(value))
  )
    throw new Error(
      "The player event value does not match the metric type or limits.",
    );
}
export function validatePlayerStatistics(doc: Tournament): void {
  const stats = readPlayerStatistics(doc);
  for (const event of stats.events) {
    if (
      new Set(event.entrantIds).size !== event.entrantIds.length ||
      !event.entrantIds.includes(event.teamId)
    )
      throw new Error("The player event entrant snapshot is invalid.");
    const metric = stats.metrics.find((m) => m.id === event.metricId);
    if (!metric)
      throw new Error("A player event references an unknown metric.");
    validValue(metric, event.value);
    if (event.status === "active") {
      const issue = playerEventIssue(doc, event);
      if (issue) throw new Error(issue);
    }
    for (const item of event.history) {
      const oldMetric = stats.metrics.find(
        (m) => m.id === item.before.metricId,
      );
      if (!oldMetric)
        throw new Error("A player event audit references an unknown metric.");
      validValue(oldMetric, item.before.value);
      if (
        new Set(item.before.entrantIds).size !==
          item.before.entrantIds.length ||
        !item.before.entrantIds.includes(item.before.teamId)
      )
        throw new Error("The player event audit entrant snapshot is invalid.");
    }
  }
}
export function withPlayerStatistics(
  doc: Tournament,
  data: PlayerStatistics,
): Tournament {
  const next = {
    ...doc,
    metadata: {
      ...doc.metadata,
      playerStatistics: JSON.parse(
        JSON.stringify(playerStatisticsSchema.parse(data)),
      ) as JsonValue,
    },
  };
  validatePlayerStatistics(next);
  return next;
}
export function savePlayerMetric(
  doc: Tournament,
  input: PlayerMetric,
): Tournament {
  const metric = playerMetricSchema.parse(input),
    data = readPlayerStatistics(doc);
  const old = data.metrics.find((m) => m.id === metric.id);
  if (
    old &&
    data.events.some(
      (e) =>
        e.metricId === metric.id ||
        e.history.some((h) => h.before.metricId === metric.id),
    ) &&
    (old.type !== metric.type ||
      old.aggregation !== metric.aggregation ||
      old.unit !== metric.unit)
  )
    throw new Error(
      "A metric with recorded events cannot change its type, unit, or aggregation. Create another metric instead.",
    );
  data.metrics = old
    ? data.metrics.map((m) => (m.id === metric.id ? metric : m))
    : [...data.metrics, metric];
  return withPlayerStatistics(doc, data);
}
function beforeData(event: PlayerEvent) {
  return eventDataSchema.parse(
    Object.fromEntries(
      Object.keys(eventDataSchema.shape)
        .map((key) => [key, event[key as keyof PlayerEvent]])
        .filter(([, value]) => value !== undefined),
    ),
  );
}
function revise(
  event: PlayerEvent,
  action: PlayerEvent["history"][number]["action"],
  reason: string,
): PlayerEvent {
  if (!reason.trim() || reason.length > 300)
    throw new Error("Enter a reason for changing the player event.");
  const at = new Date().toISOString();
  return {
    ...event,
    updatedAt: at,
    reason: reason.trim(),
    history: [
      ...event.history,
      {
        at,
        action,
        reason: reason.trim(),
        before: beforeData(event),
        status: event.status,
      },
    ].slice(-30),
  };
}
export function savePlayerEvent(
  doc: Tournament,
  input: PlayerEventInput,
  eventId?: string,
  reason = "",
): Tournament {
  const data = readPlayerStatistics(doc),
    metric = data.metrics.find((m) => m.id === input.metricId);
  if (!metric || metric.archived)
    throw new Error("Choose an active player metric.");
  validValue(metric, input.value);
  const match = doc.matches.find((m) => m.id === input.matchId),
    team = doc.participants.find((p) => p.id === input.teamId),
    player = rosterPlayers(doc, input.teamId).find(
      (p) => p.id === input.playerId,
    );
  if (
    !match ||
    !team ||
    !player ||
    !["ready", "live", "completed", "contested"].includes(match.status)
  )
    throw new Error("Choose an available match, team, and roster player.");
  const existing = eventId
    ? data.events.find((e) => e.id === eventId)
    : undefined;
  if (eventId && !existing)
    throw new Error("The player event no longer exists.");
  const at = new Date().toISOString();
  const event = playerEventSchema.parse({
    ...(existing
      ? revise(
          existing,
          existing.status === "active" ? "corrected" : "restored",
          reason,
        )
      : { id: uid(), createdAt: at, updatedAt: at, history: [], reason: "" }),
    ...input,
    entrantIds: entrants(match),
    teamName: team.name,
    playerName: player.name,
    matchLabel: match.label,
    status: "active",
  });
  const issue = playerEventIssue(doc, event);
  if (issue) throw new Error(issue);
  data.events = existing
    ? data.events.map((e) => (e.id === event.id ? event : e))
    : [...data.events, event];
  return withPlayerStatistics(doc, data);
}
export function deletePlayerEvent(
  doc: Tournament,
  eventId: string,
  reason: string,
): Tournament {
  const data = readPlayerStatistics(doc),
    event = data.events.find((e) => e.id === eventId);
  if (!event || event.status === "deleted")
    throw new Error("The player event no longer exists.");
  data.events = data.events.map((e) =>
    e.id === eventId
      ? { ...revise(e, "deleted", reason), status: "deleted" }
      : e,
  );
  return withPlayerStatistics(doc, data);
}
export function reconcilePlayerStatistics(
  before: Tournament,
  next: Tournament,
  invalidatedMatchIds: readonly string[] = [],
): Tournament {
  if (next.metadata.playerStatistics === undefined) return next;
  const data = readPlayerStatistics(next);
  if (!data.events.some((event) => event.status === "active")) return next;
  const priorIds = new Set(
      readPlayerStatistics(before).events.map((event) => event.id),
    ),
    invalid = new Set(invalidatedMatchIds),
    nextMatches = new Map(next.matches.map((match) => [match.id, match])),
    eventMatches = new Set(
      data.events
        .filter((event) => event.status === "active")
        .map((event) => event.matchId),
    );
  for (const match of before.matches) {
    if (!eventMatches.has(match.id)) continue;
    const current = nextMatches.get(match.id);
    if (
      (match.result && !current?.result) ||
      (match.status === "live" &&
        current?.status !== "live" &&
        current?.status !== "completed") ||
      (match.result &&
        current?.result &&
        JSON.stringify(match.result) !== JSON.stringify(current.result))
    )
      invalid.add(match.id);
  }
  let changed = false;
  data.events = data.events.map((event) => {
    if (event.status !== "active") return event;
    const existed = priorIds.has(event.id);
    const issue =
      playerEventIssue(next, event) ??
      (existed && invalid.has(event.matchId)
        ? "The match result changed. Review its player events before including them again."
        : undefined);
    if (!issue) return event;
    changed = true;
    return { ...revise(event, "quarantined", issue), status: "quarantined" };
  });
  return changed
    ? {
        ...next,
        metadata: {
          ...next.metadata,
          playerStatistics: data as unknown as JsonValue,
        },
      }
    : next;
}
export function stripPlayerStatistics(doc: Tournament): void {
  delete doc.metadata.playerStatistics;
}
export function playerEventMatchIds(doc: Tournament): string[] {
  return [
    ...new Set(
      readPlayerStatistics(doc).events.flatMap((e) => [
        e.matchId,
        ...e.history.map((h) => h.before.matchId),
      ]),
    ),
  ];
}
export function countedPlayerEvents(doc: Tournament): PlayerEvent[] {
  return readPlayerStatistics(doc).events.filter(
    (e) => e.status === "active" && !playerEventIssue(doc, e),
  );
}
export interface PlayerTotal {
  teamId: string;
  playerId: string;
  teamName: string;
  playerName: string;
  metricId: string;
  value: number;
  eventCount: number;
  matchCount: number;
}
export function playerTotals(
  doc: Tournament,
  filter: { playerId?: string; teamId?: string; matchId?: string } = {},
): PlayerTotal[] {
  const data = readPlayerStatistics(doc),
    groups = new Map<string, PlayerEvent[]>();
  for (const event of countedPlayerEvents(doc)) {
    if (
      (filter.playerId && filter.playerId !== event.playerId) ||
      (filter.teamId && filter.teamId !== event.teamId) ||
      (filter.matchId && filter.matchId !== event.matchId)
    )
      continue;
    const key = JSON.stringify([event.teamId, event.playerId, event.metricId]);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.values()].map((events) => {
    const first = events[0],
      metric = data.metrics.find((m) => m.id === first.metricId)!;
    const values = events.map((e) => e.value),
      sum = values.reduce((a, b) => a + b, 0);
    const value =
      metric.aggregation === "average"
        ? sum / values.length
        : metric.aggregation === "min"
          ? Math.min(...values)
          : metric.aggregation === "max"
            ? Math.max(...values)
            : sum;
    return {
      teamId: first.teamId,
      playerId: first.playerId,
      teamName:
        doc.participants.find((p) => p.id === first.teamId)?.name ??
        first.teamName,
      playerName:
        rosterPlayers(doc, first.teamId).find((p) => p.id === first.playerId)
          ?.name ?? first.playerName,
      metricId: first.metricId,
      value,
      eventCount: events.length,
      matchCount: new Set(events.map((e) => e.matchId)).size,
    };
  });
}
