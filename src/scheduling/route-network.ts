import { z } from "zod";
import type { JsonValue, Tournament } from "../domain/types";
import { scheduleOccurrences } from "./legs";
import { generatedMatchLabel } from "../i18n/match-labels";

const id = z.string().min(1).max(160);
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function iso(at: number): string {
  if (!Number.isFinite(at) || Math.abs(at) > 8640000000000000)
    throw new Error("The itinerary exceeds the supported date range.");
  return new Date(at).toISOString();
}
export const routeNetworkSchema = z
  .object({
    version: z.literal(1),
    nodes: z
      .array(z.object({ id, name: z.string().trim().min(1).max(180) }).strict())
      .max(128),
    edges: z
      .array(
        z
          .object({
            id,
            from: id,
            to: id,
            km: z.number().finite().min(0).max(1000000),
            minutes: z.number().finite().min(0).max(1000000),
            bidirectional: z.boolean(),
          })
          .strict(),
      )
      .max(512),
    homes: z
      .array(z.object({ participantId: id, nodeId: id }).strict())
      .max(512),
    venues: z.array(z.object({ resourceId: id, nodeId: id }).strict()).max(128),
  })
  .strict();
export type RouteNetwork = z.infer<typeof routeNetworkSchema>;
export function validateRouteNetwork(
  input: unknown,
  tournament?: Tournament,
): RouteNetwork {
  const data = routeNetworkSchema.parse(input),
    nodes = new Set(data.nodes.map((node) => node.id));
  if (
    nodes.size !== data.nodes.length ||
    new Set(data.edges.map((edge) => edge.id)).size !== data.edges.length ||
    new Set(data.homes.map((entry) => entry.participantId)).size !==
      data.homes.length ||
    new Set(data.venues.map((entry) => entry.resourceId)).size !==
      data.venues.length
  )
    throw new Error(
      "The route network contains duplicate identifiers or mappings.",
    );
  if (
    data.edges.some(
      (edge) =>
        edge.from === edge.to || !nodes.has(edge.from) || !nodes.has(edge.to),
    ) ||
    [...data.homes, ...data.venues].some((entry) => !nodes.has(entry.nodeId))
  )
    throw new Error(
      "Every route edge and mapping must reference an existing node.",
    );
  if (
    tournament &&
    (data.homes.some(
      (entry) =>
        !tournament.participants.some(
          (participant) => participant.id === entry.participantId,
        ),
    ) ||
      data.venues.some(
        (entry) =>
          !tournament.schedule.resources.some(
            (resource) => resource.id === entry.resourceId,
          ),
      ))
  )
    throw new Error(
      "The route network references an unknown entrant or venue.",
    );
  return data;
}
export function readRouteNetwork(tournament: Tournament): RouteNetwork {
  return validateRouteNetwork(
    tournament.metadata.travelNetwork ?? {
      version: 1,
      nodes: [],
      edges: [],
      homes: [],
      venues: [],
    },
    tournament,
  );
}
export function withRouteNetwork(
  tournament: Tournament,
  input: unknown,
): Tournament {
  return {
    ...tournament,
    metadata: {
      ...tournament.metadata,
      travelNetwork: validateRouteNetwork(
        input,
        tournament,
      ) as unknown as JsonValue,
    },
  };
}
/** Retain route geometry while removing mappings for explicitly deleted entities. */
export function reconcileRouteNetwork(
  previous: Tournament,
  next: Tournament,
): Tournament {
  if (
    next.metadata.travelNetwork === undefined ||
    previous.metadata.travelNetwork === undefined
  )
    return next;
  const network = validateRouteNetwork(next.metadata.travelNetwork);
  const deletedEntrants = new Set(
    previous.participants
      .filter(
        (entry) =>
          !next.participants.some((candidate) => candidate.id === entry.id),
      )
      .map((entry) => entry.id),
  );
  const deletedVenues = new Set(
    previous.schedule.resources
      .filter(
        (entry) =>
          !next.schedule.resources.some(
            (candidate) => candidate.id === entry.id,
          ),
      )
      .map((entry) => entry.id),
  );
  if (
    !network.homes.some((entry) => deletedEntrants.has(entry.participantId)) &&
    !network.venues.some((entry) => deletedVenues.has(entry.resourceId))
  )
    return next;
  return withRouteNetwork(next, {
    ...network,
    homes: network.homes.filter(
      (entry) => !deletedEntrants.has(entry.participantId),
    ),
    venues: network.venues.filter(
      (entry) => !deletedVenues.has(entry.resourceId),
    ),
  });
}
export interface NetworkRoute {
  nodeIds: string[];
  edgeIds: string[];
  km: number;
  minutes: number;
}
export function shortestNetworkRoute(
  network: RouteNetwork,
  from: string,
  to: string,
  optimize: "distance" | "duration" = "duration",
): NetworkRoute | undefined {
  validateRouteNetwork(network);
  if (
    !network.nodes.some((node) => node.id === from) ||
    !network.nodes.some((node) => node.id === to)
  )
    throw new Error("Choose existing start and destination nodes.");
  const compare = (a: NetworkRoute, b: NetworkRoute) =>
    (optimize === "distance"
      ? a.km - b.km || a.minutes - b.minutes
      : a.minutes - b.minutes || a.km - b.km) ||
    a.edgeIds.length - b.edgeIds.length ||
    compareText(JSON.stringify(a.nodeIds), JSON.stringify(b.nodeIds)) ||
    compareText(JSON.stringify(a.edgeIds), JSON.stringify(b.edgeIds));
  const routes = new Map<string, NetworkRoute>([
      [from, { nodeIds: [from], edgeIds: [], km: 0, minutes: 0 }],
    ]),
    visited = new Set<string>();
  const adjacency = new Map<
    string,
    { to: string; edge: RouteNetwork["edges"][number] }[]
  >();
  for (const edge of network.edges) {
    adjacency.set(edge.from, [
      ...(adjacency.get(edge.from) ?? []),
      { to: edge.to, edge },
    ]);
    if (edge.bidirectional)
      adjacency.set(edge.to, [
        ...(adjacency.get(edge.to) ?? []),
        { to: edge.from, edge },
      ]);
  }
  while (visited.size < network.nodes.length) {
    const next = [...routes]
      .filter(([key]) => !visited.has(key))
      .sort((a, b) => compare(a[1], b[1]) || compareText(a[0], b[0]))[0];
    if (!next) return undefined;
    const [node, route] = next;
    if (node === to) return route;
    visited.add(node);
    for (const target of adjacency.get(node) ?? []) {
      if (visited.has(target.to)) continue;
      const candidate = {
        nodeIds: [...route.nodeIds, target.to],
        edgeIds: [...route.edgeIds, target.edge.id],
        km: route.km + target.edge.km,
        minutes: route.minutes + target.edge.minutes,
      };
      const existing = routes.get(target.to);
      if (!existing || compare(candidate, existing) < 0)
        routes.set(target.to, candidate);
    }
  }
  return undefined;
}
export type ItineraryIssue =
  | "missing-home"
  | "missing-venue"
  | "disconnected"
  | "late-arrival"
  | "overlap"
  | "unknown-arrival";
export interface ItineraryStop {
  matchId?: string;
  label: string;
  venue?: string;
  from?: string;
  to?: string;
  scheduledAt?: string;
  endsAt?: string;
  departAt?: string;
  arriveAt?: string;
  route?: NetworkRoute;
  cost?: number;
  issues: ItineraryIssue[];
}
export interface ItineraryOptions {
  participantId: string;
  departAt: string;
  optimize: "distance" | "duration";
  costPerKm: number;
  returnHome: boolean;
}
export function networkItinerary(
  tournament: Tournament,
  options: ItineraryOptions,
) {
  const network = readRouteNetwork(tournament),
    depart = Date.parse(options.departAt);
  if (
    !tournament.participants.some(
      (entry) => entry.id === options.participantId,
    ) ||
    !Number.isFinite(depart) ||
    !Number.isFinite(options.costPerKm) ||
    options.costPerKm < 0 ||
    options.costPerKm > 10000 ||
    !["distance", "duration"].includes(options.optimize)
  )
    throw new Error(
      "Choose an entrant, a valid departure time, and a cost from 0 to 10000 per kilometre.",
    );
  const matches = scheduleOccurrences(tournament).filter(
    (match) =>
      !["bye", "canceled"].includes(match.status) &&
      match.slots.every((slot) => slot.participantId) &&
      match.slots.some((slot) => slot.participantId === options.participantId),
  );
  const scheduled = matches
    .filter((match) => match.scheduledAt)
    .sort(
      (a, b) =>
        Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!) ||
        compareText(a.id, b.id),
    );
  const home = network.homes.find(
    (entry) => entry.participantId === options.participantId,
  )?.nodeId;
  let origin = home,
    available: number | undefined = depart,
    previousEnd: number | undefined;
  const stops: ItineraryStop[] = [],
    routes = new Map<string, NetworkRoute | undefined>();
  function route(from?: string, to?: string) {
    if (!from || !to) return undefined;
    const key = JSON.stringify([from, to]);
    if (!routes.has(key))
      routes.set(
        key,
        shortestNetworkRoute(network, from, to, options.optimize),
      );
    return routes.get(key);
  }
  for (const match of scheduled) {
    const at = Date.parse(match.scheduledAt!),
      end =
        at +
        (match.durationMinutes ?? tournament.schedule.matchMinutes) * 60000;
    const target = network.venues.find(
      (entry) => entry.resourceId === match.resourceId,
    )?.nodeId;
    const path = route(origin, target),
      issues: ItineraryIssue[] = [];
    if (!home && !stops.length) issues.push("missing-home");
    if (!target) issues.push("missing-venue");
    if (origin && target && !path) issues.push("disconnected");
    const leave: number | undefined =
      available === undefined
        ? undefined
        : available +
          (stops.length ? tournament.schedule.restMinutes * 60000 : 0);
    const arrive: number | undefined =
      leave !== undefined && path ? leave + path.minutes * 60000 : undefined;
    if (arrive === undefined) issues.push("unknown-arrival");
    else if (arrive > at) issues.push("late-arrival");
    if (previousEnd !== undefined && previousEnd > at) issues.push("overlap");
    stops.push({
      matchId: String(match.metadata.scheduleOrigin ?? match.id),
      label: generatedMatchLabel(match, tournament.locale),
      venue: tournament.schedule.resources.find(
        (resource) => resource.id === match.resourceId,
      )?.name,
      from: origin,
      to: target,
      scheduledAt: iso(at),
      endsAt: iso(end),
      ...(leave === undefined ? {} : { departAt: iso(leave) }),
      ...(arrive === undefined ? {} : { arriveAt: iso(arrive) }),
      route: path,
      ...(path ? { cost: path.km * options.costPerKm } : {}),
      issues,
    });
    origin = target;
    available =
      arrive === undefined ? undefined : Math.max(at, arrive) + (end - at);
    previousEnd = end;
  }
  if (options.returnHome && stops.length) {
    const path = route(origin, home),
      arrive =
        available !== undefined && path
          ? available + path.minutes * 60000
          : undefined;
    stops.push({
      label: "Return home",
      from: origin,
      to: home,
      route: path,
      ...(available === undefined ? {} : { departAt: iso(available) }),
      ...(arrive === undefined ? {} : { arriveAt: iso(arrive) }),
      ...(path ? { cost: path.km * options.costPerKm } : {}),
      issues: [
        ...(!home ? ["missing-home" as const] : []),
        ...(origin && home && !path ? ["disconnected" as const] : []),
        ...(arrive === undefined ? ["unknown-arrival" as const] : []),
      ],
    });
  }
  return {
    stops,
    unscheduled: matches.length - scheduled.length,
    totalKm: stops.reduce((sum, stop) => sum + (stop.route?.km ?? 0), 0),
    totalMinutes: stops.reduce(
      (sum, stop) => sum + (stop.route?.minutes ?? 0),
      0,
    ),
    totalCost: stops.reduce((sum, stop) => sum + (stop.cost ?? 0), 0),
    incomplete:
      stops.some((stop) => !stop.route) || matches.length !== scheduled.length,
  };
}
