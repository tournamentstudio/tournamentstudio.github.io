import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import {
  networkItinerary,
  readRouteNetwork,
  reconcileRouteNetwork,
  shortestNetworkRoute,
  validateRouteNetwork,
  withRouteNetwork,
  type RouteNetwork,
} from "./route-network";
import { itineraryCsv } from "./route-network-export";
function network(): RouteNetwork {
  return {
    version: 1,
    nodes: ["home", "a", "b", "isolated"].map((id) => ({ id, name: id })),
    edges: [
      {
        id: "home-a",
        from: "home",
        to: "a",
        km: 10,
        minutes: 30,
        bidirectional: true,
      },
      {
        id: "home-b",
        from: "home",
        to: "b",
        km: 30,
        minutes: 10,
        bidirectional: false,
      },
      {
        id: "a-b",
        from: "a",
        to: "b",
        km: 5,
        minutes: 20,
        bidirectional: true,
      },
    ],
    homes: [],
    venues: [],
  };
}
function fixture() {
  let doc = createTournament("Road network", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  doc = generateStage(doc, doc.stages[0].id);
  doc.schedule.resources = [
    { id: "venue-a", name: "Venue A" },
    { id: "venue-b", name: "Venue B" },
  ];
  doc.schedule.matchMinutes = 60;
  doc.schedule.restMinutes = 10;
  doc.matches[0].legSchedule = [
    { leg: 1, scheduledAt: "2026-10-22T10:00:00Z", resourceId: "venue-a" },
    { leg: 2, scheduledAt: "2026-10-22T11:25:00Z", resourceId: "venue-b" },
  ];
  const graph = network();
  graph.homes = [{ participantId: doc.participants[0].id, nodeId: "home" }];
  graph.venues = [
    { resourceId: "venue-a", nodeId: "a" },
    { resourceId: "venue-b", nodeId: "b" },
  ];
  doc = withRouteNetwork(doc, graph);
  return {
    doc,
    options: {
      participantId: doc.participants[0].id,
      departAt: "2026-10-22T09:00:00Z",
      optimize: "duration" as const,
      costPerKm: 2,
      returnHome: true,
    },
  };
}
describe("offline route network", () => {
  it("matches exhaustive simple-path costs on generated directed networks", () => {
    for (let seed = 0; seed < 32; seed++) {
      const graph: RouteNetwork = {
        version: 1,
        nodes: Array.from({ length: 5 }, (_, index) => ({
          id: String(index),
          name: String(index),
        })),
        edges: [],
        homes: [],
        venues: [],
      };
      for (let from = 0; from < 5; from++)
        for (let to = 0; to < 5; to++) {
          if (from !== to && (seed * 7 + from * 17 + to * 31) % 4 !== 0)
            graph.edges.push({
              id: `${from}-${to}`,
              from: String(from),
              to: String(to),
              km: (seed + from * 3 + to * 7) % 9,
              minutes: (seed * 3 + from + to * 5) % 11,
              bidirectional: false,
            });
        }
      for (const objective of ["distance", "duration"] as const) {
        const candidates: { km: number; minutes: number }[] = [];
        function visit(
          node: string,
          seen: string[],
          km: number,
          minutes: number,
        ) {
          if (node === "4") {
            candidates.push({ km, minutes });
            return;
          }
          for (const edge of graph.edges.filter(
            (entry) => entry.from === node && !seen.includes(entry.to),
          ))
            visit(
              edge.to,
              [...seen, edge.to],
              km + edge.km,
              minutes + edge.minutes,
            );
        }
        visit("0", ["0"], 0, 0);
        const expected = candidates.sort((a, b) =>
          objective === "distance"
            ? a.km - b.km || a.minutes - b.minutes
            : a.minutes - b.minutes || a.km - b.km,
        )[0];
        const actual = shortestNetworkRoute(graph, "0", "4", objective);
        expect(actual && { km: actual.km, minutes: actual.minutes }).toEqual(
          expected,
        );
      }
    }
  });
  it("finds shortest directed distance or duration and reports disconnected nodes", () => {
    const graph = network();
    expect(
      shortestNetworkRoute(graph, "home", "b", "distance")?.nodeIds,
    ).toEqual(["home", "a", "b"]);
    expect(
      shortestNetworkRoute(graph, "home", "b", "duration")?.nodeIds,
    ).toEqual(["home", "b"]);
    expect(
      shortestNetworkRoute(graph, "b", "home", "duration")?.nodeIds,
    ).toEqual(["b", "a", "home"]);
    expect(shortestNetworkRoute(graph, "a", "isolated")).toBeUndefined();
    expect(shortestNetworkRoute(graph, "a", "a")).toEqual({
      nodeIds: ["a"],
      edgeIds: [],
      km: 0,
      minutes: 0,
    });
  });
  it("breaks equal paths deterministically regardless of imported ordering", () => {
    const graph = network();
    graph.edges = [
      {
        id: "z",
        from: "home",
        to: "b",
        km: 15,
        minutes: 50,
        bidirectional: true,
      },
      ...graph.edges.filter((edge) => edge.id !== "home-b"),
      {
        id: "a",
        from: "home",
        to: "b",
        km: 15,
        minutes: 50,
        bidirectional: true,
      },
    ];
    expect(
      shortestNetworkRoute(graph, "home", "b", "distance")?.edgeIds,
    ).toEqual(["a"]);
    const reversed = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    };
    expect(shortestNetworkRoute(graph, "home", "b")).toEqual(
      shortestNetworkRoute(reversed, "home", "b"),
    );
  });
  it("rejects duplicate identities, invalid references, self links, and limits", () => {
    const graph = network();
    expect(() =>
      validateRouteNetwork({
        ...graph,
        nodes: [...graph.nodes, graph.nodes[0]],
      }),
    ).toThrow("duplicate");
    expect(() =>
      validateRouteNetwork({
        ...graph,
        edges: [{ ...graph.edges[0], to: "missing" }],
      }),
    ).toThrow("existing node");
    expect(() =>
      validateRouteNetwork({
        ...graph,
        edges: [{ ...graph.edges[0], to: "home" }],
      }),
    ).toThrow("existing node");
    expect(() =>
      validateRouteNetwork({
        ...graph,
        edges: [{ ...graph.edges[0], km: -1 }],
      }),
    ).toThrow();
    expect(() =>
      validateRouteNetwork({
        ...graph,
        nodes: Array.from({ length: 129 }, (_, index) => ({
          id: String(index),
          name: String(index),
        })),
      }),
    ).toThrow();
    const { doc } = fixture();
    expect(() =>
      withRouteNetwork(doc, {
        ...graph,
        homes: [{ participantId: "missing", nodeId: "home" }],
      }),
    ).toThrow("unknown entrant");
  });
  it("includes aggregate legs, travel, rest, return home and propagated late arrival", () => {
    const { doc, options } = fixture();
    const result = networkItinerary(doc, options);
    expect(result.stops).toHaveLength(3);
    expect(result.stops[0].label).toContain("Leg 1");
    expect(result.stops[0].arriveAt).toBe("2026-10-22T09:30:00.000Z");
    expect(result.stops[1].departAt).toBe("2026-10-22T11:10:00.000Z");
    expect(result.stops[1].arriveAt).toBe("2026-10-22T11:30:00.000Z");
    expect(result.stops[1].issues).toContain("late-arrival");
    expect(result.stops[2].departAt).toBe("2026-10-22T12:30:00.000Z");
    expect(result.totalKm).toBe(30);
    expect(result.totalCost).toBe(60);
    expect(result.incomplete).toBe(false);
  });
  it("flags overlapping matches and never fabricates arrival after a missing route", () => {
    const { doc, options } = fixture();
    doc.matches[0].legSchedule![1].scheduledAt = "2026-10-22T10:30:00Z";
    expect(networkItinerary(doc, options).stops[1].issues).toContain("overlap");
    const graph = readRouteNetwork(doc);
    graph.homes[0].nodeId = "isolated";
    const result = networkItinerary(withRouteNetwork(doc, graph), options);
    expect(result.stops[0].issues).toContain("disconnected");
    expect(result.stops.every((stop) => stop.arriveAt === undefined)).toBe(
      true,
    );
    expect(result.incomplete).toBe(true);
  });
  it("excludes unresolved matches and BYEs, counts unbooked aggregate legs", () => {
    const { doc, options } = fixture();
    doc.matches[0].legSchedule!.pop();
    expect(networkItinerary(doc, options).unscheduled).toBe(1);
    doc.matches[0].status = "canceled";
    expect(networkItinerary(doc, options).stops).toHaveLength(0);
    doc.matches[0].status = "pending";
    delete doc.matches[0].slots[1].participantId;
    expect(networkItinerary(doc, options).stops).toHaveLength(0);
  });
  it("cleans only mappings for explicitly deleted entities and preserves routes", () => {
    const { doc } = fixture(),
      next = structuredClone(doc);
    next.participants.shift();
    next.schedule.resources.pop();
    const result = readRouteNetwork(reconcileRouteNetwork(doc, next));
    expect(result.homes).toEqual([]);
    expect(result.venues).toHaveLength(1);
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
  });
  it("exports formula-safe CSV and rejects malformed planning options", () => {
    const { doc, options } = fixture(),
      graph = readRouteNetwork(doc);
    graph.nodes[0].name = "=unsafe()";
    expect(itineraryCsv(withRouteNetwork(doc, graph), options)).toContain(
      "'=unsafe()",
    );
    expect(() =>
      networkItinerary(doc, { ...options, departAt: "invalid" }),
    ).toThrow("departure");
    expect(() => networkItinerary(doc, { ...options, costPerKm: -1 })).toThrow(
      "cost",
    );
  });
});
