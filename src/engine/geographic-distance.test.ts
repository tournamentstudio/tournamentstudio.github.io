import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type KnockoutDistanceRule,
  type KnockoutDrawConfig,
  type Tournament,
} from "../domain/types";
import {
  knockoutDistanceSchema,
  knockoutDrawSchema,
} from "../domain/knockout-draw";
import { participantSchema, validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import { EARTH_RADIUS_KM, greatCircleDistanceKm } from "./geographic-distance";
import { singleElimination } from "./elimination";
import {
  generateStage,
  KNOCKOUT_DISTANCE_ALGORITHM,
  previewKnockoutDraw,
  seedPositions,
  simulate,
} from "./index";

function cup(count = 8, format: FormatId = "single-elimination") {
  const tournament = createTournament(
    "جام فاصله",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      location: { latitude: 0, longitude: ((index * 13) % 360) - 180 },
      region: `Region ${index % 2}`,
    })),
    format,
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.thirdPlace = true;
  tournament.stages[0].config.seed = "distance-fixture";
  return tournament;
}

function configure(
  tournament: Tournament,
  distance: Partial<KnockoutDistanceRule> = {},
) {
  const draw: Extract<KnockoutDrawConfig, { version: 5 }> = {
    version: 5,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    distance: {
      minKm: 0,
      winnersThroughRound: 1,
      losersThroughRound: 0,
      finals: [],
      ...distance,
    },
  };
  tournament.stages[0].config.knockoutDraw = draw;
  return draw;
}

/** Enumerate real outcomes to observe selected meetings without the draw predicates. */
function possiblePairs(
  tournament: Tournament,
  slots: (string | null)[],
  rule: KnockoutDistanceRule,
) {
  const stage = tournament.stages[0];
  const matches = singleElimination(
    stage,
    stage.participantIds,
    stage.format === "double-elimination",
    slots.flatMap((id, index) =>
      id ? [{ participantId: id, slot: index + 1 }] : [],
    ),
  );
  const outcomes = new Map<string, { winner?: string; loser?: string }>();
  const pairs = new Set<string>();
  const visit = (index: number) => {
    if (index === matches.length) return;
    const match = matches[index];
    if (match.metadata.conditionalReset) {
      const final = matches.find(
        (item) => item.id === match.metadata.conditionalReset,
      )!;
      if (
        outcomes.get(final.id)!.winner ===
        outcomes.get(final.slots[0].source!.matchId)!.winner
      )
        return;
    }
    const entrants = match.slots
      .map((slot) =>
        slot.source
          ? outcomes.get(slot.source.matchId)?.[slot.source.result]
          : slot.participantId,
      )
      .filter((id): id is string => !!id);
    if (entrants.length < 2) {
      outcomes.set(match.id, { winner: entrants[0] });
      visit(index + 1);
      return;
    }
    if (
      (match.bracket === "winners" &&
        match.round <= rule.winnersThroughRound) ||
      (match.bracket === "losers" && match.round <= rule.losersThroughRound) ||
      (match.bracket === "final" && rule.finals.includes("grand-final")) ||
      (match.bracket === "reset" && rule.finals.includes("reset")) ||
      (match.bracket === "placement" && rule.finals.includes("third-place"))
    )
      pairs.add([...entrants].sort().join("|"));
    for (let winner = 0; winner < 2; winner++) {
      outcomes.set(match.id, {
        winner: entrants[winner],
        loser: entrants[1 - winner],
      });
      visit(index + 1);
    }
  };
  visit(0);
  return pairs;
}

function distancesValid(
  tournament: Tournament,
  slots: (string | null)[],
  rule: KnockoutDistanceRule,
) {
  return [...possiblePairs(tournament, slots, rule)].every((key) => {
    const [a, b] = key
      .split("|")
      .map((id) => tournament.participants.find((p) => p.id === id)!.location!);
    const km = greatCircleDistanceKm(a, b);
    return (
      (rule.minKm === undefined || km >= rule.minKm) &&
      (rule.maxKm === undefined || km <= rule.maxKm)
    );
  });
}

function permutations<T>(items: T[]): T[][] {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, other) => index !== other)).map((tail) => [
      item,
      ...tail,
    ]),
  );
}

describe("spherical distance policy", () => {
  it("measures quarter and half circles using the declared Earth radius", () => {
    expect(
      greatCircleDistanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 90 },
      ),
    ).toBeCloseTo((Math.PI * EARTH_RADIUS_KM) / 2, 8);
    expect(
      greatCircleDistanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ),
    ).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 8);
    expect(
      greatCircleDistanceKm(
        { latitude: 90, longitude: 0 },
        { latitude: -90, longitude: 50 },
      ),
    ).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 8);
  });

  it("normalizes equivalent poles and dateline locations for zero bounds", () => {
    for (const [a, b] of [
      [
        { latitude: 90, longitude: -170 },
        { latitude: 90, longitude: 130 },
      ],
      [
        { latitude: -90, longitude: -170 },
        { latitude: -90, longitude: 130 },
      ],
      [
        { latitude: 37, longitude: -180 },
        { latitude: 37, longitude: 180 },
      ],
    ])
      expect(greatCircleDistanceKm(a, b)).toBe(0);
    expect(
      greatCircleDistanceKm(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ),
    ).toBeCloseTo((EARTH_RADIUS_KM * Math.PI) / 90, 8);
  });

  it("matches an independent vector-angle calculation across the globe", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
        ),
        fc.tuple(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
        ),
        (a, b) => {
          const vector = ([lat, lon]: number[]) => {
            const r = Math.PI / 180;
            return [
              Math.cos(lat * r) * Math.cos(lon * r),
              Math.cos(lat * r) * Math.sin(lon * r),
              Math.sin(lat * r),
            ];
          };
          const u = vector(a),
            v = vector(b);
          const cross = Math.hypot(
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          );
          const dot = u.reduce((sum, x, index) => sum + x * v[index], 0);
          const actual = greatCircleDistanceKm(
            { latitude: a[0], longitude: a[1] },
            { latitude: b[0], longitude: b[1] },
          );
          expect(
            Math.abs(actual - EARTH_RADIUS_KM * Math.atan2(cross, dot)),
          ).toBeLessThan(0.001);
          expect(actual).toBeGreaterThanOrEqual(0);
          expect(actual).toBeLessThanOrEqual(Math.PI * EARTH_RADIUS_KM);
        },
      ),
      { numRuns: 250, seed: 902731 },
    );
  });

  it("uses inclusive minimum and maximum bounds without treating zero as absent", () => {
    const tournament = cup(2);
    const distance = greatCircleDistanceKm(
      tournament.participants[0].location!,
      tournament.participants[1].location!,
    );
    const draw = configure(tournament, { minKm: distance, maxKm: distance });
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
    draw.distance.minKm = distance + 0.000001;
    delete draw.distance.maxKm;
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
    draw.distance.minKm = 0;
    draw.distance.maxKm = 0;
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
    tournament.participants[1].location = {
      ...tournament.participants[0].location!,
    };
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
  });
});

describe("distance draw paths", () => {
  it("keeps pairwise conflicts nontransitive", () => {
    const tournament = cup(4);
    [0, 1, 2, 10].forEach(
      (longitude, index) =>
        (tournament.participants[index].location = { latitude: 0, longitude }),
    );
    const draw = configure(tournament, { minKm: 170 });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    const pairs = possiblePairs(tournament, preview.slots, draw.distance);
    expect(pairs).toEqual(new Set(["p1|p3", "p2|p4"]));
  });

  it("combines minimum and maximum distance with pots, affiliations, and protected seeds", () => {
    const tournament = cup(8);
    [0, 1, 2, 3, 10, 11, 12, 13].forEach(
      (longitude, index) =>
        (tournament.participants[index].location = { latitude: 0, longitude }),
    );
    const draw = configure(tournament, { minKm: 500, maxKm: 1600 });
    draw.pots = [
      { id: "a", name: "A", participantIds: ["p1", "p2", "p3", "p4"] },
      { id: "b", name: "B", participantIds: ["p5", "p6", "p7", "p8"] },
    ];
    draw.restrictions = ["region"];
    draw.protectedSeeds = 2;
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.slots[0]).toBe("p1");
    expect(preview.slots[4]).toBe("p2");
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    for (let index = 0; index < 8; index += 2) {
      const ids = preview.slots.slice(index, index + 2);
      expect(
        ids.filter((id) => draw.pots[0].participantIds.includes(id!)),
      ).toHaveLength(1);
      expect(
        tournament.participants.find((p) => p.id === ids[0])!.region,
      ).not.toBe(tournament.participants.find((p) => p.id === ids[1])!.region);
    }
  });

  it("protects later winners rounds without constraining distant bracket halves", () => {
    const tournament = cup(8);
    [0, 0, 0, 0, 30, 30, 30, 30].forEach(
      (longitude, index) =>
        (tournament.participants[index].location = { latitude: 0, longitude }),
    );
    const draw = configure(tournament, { maxKm: 0, winnersThroughRound: 2 });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    draw.distance.winnersThroughRound = 3;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "distanceInfeasible",
    );
  });

  it("protects actual lower paths including possible opening-opponent rematches", () => {
    const tournament = cup(8, "double-elimination");
    [0, 0, 30, 60, 90, 120, 150, 180].forEach(
      (longitude, index) =>
        (tournament.participants[index].location = { latitude: 0, longitude }),
    );
    const draw = configure(tournament, {
      minKm: 100,
      winnersThroughRound: 0,
      losersThroughRound: 2,
    });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    draw.distance.losersThroughRound = 4;
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
  });

  it("combines distance pair conflicts with independent lower affiliation paths", () => {
    const tournament = cup(8, "double-elimination");
    tournament.participants.forEach(
      (participant, index) => (participant.region = `R${index}`),
    );
    tournament.participants[1].region = tournament.participants[0].region;
    tournament.participants[1].location = {
      ...tournament.participants[0].location!,
    };
    const draw = configure(tournament, { minKm: 1 });
    draw.losersSeparation = [{ field: "region", throughRound: 1 }];
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    expect(
      possiblePairs(tournament, preview.slots, {
        winnersThroughRound: 0,
        losersThroughRound: 1,
        finals: [],
      }),
    ).not.toContain("p1|p2");
  });

  it("rejects a conflict between upper affiliation and placement distance rules", () => {
    const tournament = cup(8);
    tournament.participants.forEach(
      (participant, index) => (participant.region = `R${index}`),
    );
    tournament.participants[1].region = tournament.participants[0].region;
    tournament.participants[1].location = {
      ...tournament.participants[0].location!,
    };
    const draw = configure(tournament, {
      minKm: 1,
      winnersThroughRound: 0,
      finals: ["third-place"],
    });
    draw.restrictions = ["region"];
    draw.separation = [{ field: "region", throughRound: 2 }];
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(false);
    expect(preview.issueDetails).toEqual([
      { code: "distanceInfeasible", values: [] },
    ]);
    expect(preview.slots).toEqual([]);
    draw.separation = [];
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
  });

  it.each(["grand-final", "reset"] as const)(
    "checks every possible pair for %s",
    (target) => {
      const tournament = cup(5, "double-elimination");
      const draw = configure(tournament, {
        winnersThroughRound: 0,
        minKm: 1,
        finals: [target],
      });
      tournament.participants[1].location = {
        ...tournament.participants[0].location!,
      };
      expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
        "distanceFinals",
      );
      draw.distance.minKm = 0;
      draw.distance.maxKm = 20016;
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.ready).toBe(true);
      expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(
        true,
      );
    },
  );

  it("places incompatible possible third-place entrants in the same semifinal half", () => {
    const tournament = cup(8);
    tournament.participants[1].location = {
      ...tournament.participants[0].location!,
    };
    const draw = configure(tournament, {
      winnersThroughRound: 0,
      minKm: 1,
      finals: ["third-place"],
    });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    expect(Math.floor(preview.slots.indexOf("p1") / 4)).toBe(
      Math.floor(preview.slots.indexOf("p2") / 4),
    );
  });

  it("does not invent a semifinal loser or a first-round opponent for a BYE", () => {
    const tournament = cup(3);
    tournament.participants[0].location = { latitude: 90, longitude: 0 };
    tournament.participants[1].location = { latitude: 0, longitude: 0 };
    tournament.participants[2].location = { latitude: 0, longitude: 0 };
    const draw = configure(tournament, { maxKm: 0, finals: ["third-place"] });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.byeIds).toEqual(["p1"]);
    expect(distancesValid(tournament, preview.slots, draw.distance)).toBe(true);
    expect(
      possiblePairs(tournament, preview.slots, {
        ...draw.distance,
        winnersThroughRound: 0,
      }).size,
    ).toBe(0);
  });

  it("explains fixed-slot conflicts without moving protected entrants", () => {
    const tournament = cup(4);
    tournament.participants[3].location = {
      ...tournament.participants[0].location!,
    };
    const draw = configure(tournament, { minKm: 100 });
    draw.protectedSeeds = 4;
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(false);
    expect(preview.slots).toEqual([]);
    expect(preview.issueDetails[0]).toEqual({
      code: "distanceFixed",
      values: ["Team 1", "Team 4", "0"],
    });
    expect(tournament.matches).toEqual([]);
  });

  it("matches an exhaustive physical-placement oracle for small mixed policies", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 4 }),
        fc.array(fc.integer({ min: 0, max: 6 }), {
          minLength: 4,
          maxLength: 4,
        }),
        fc.integer({ min: 0, max: 4 }),
        fc.boolean(),
        fc.boolean(),
        (count, longitudes, scope, pinned, pots) => {
          const tournament = cup(
            count,
            scope === 2 ? "double-elimination" : "single-elimination",
          );
          longitudes.forEach((longitude, index) => {
            if (index < count)
              tournament.participants[index].location = {
                latitude: 0,
                longitude,
              };
          });
          const draw = configure(tournament, {
            minKm: scope % 2 === 0 ? 150 : 0,
            maxKm: scope % 2 === 1 ? 250 : undefined,
            winnersThroughRound: scope < 2 ? scope + 1 : 0,
            losersThroughRound: scope === 2 ? 1 : 0,
            finals: scope >= 3 ? ["third-place"] : [],
          });
          draw.protectedSeeds = pinned ? 1 : 0;
          if (pots)
            draw.pots = [
              {
                id: "a",
                name: "A",
                participantIds: tournament.participants
                  .slice(0, 2)
                  .map((p) => p.id),
              },
              {
                id: "b",
                name: "B",
                participantIds: tournament.participants
                  .slice(2)
                  .map((p) => p.id),
              },
            ];
          const ids: (string | null)[] = tournament.participants.map(
            (p) => p.id,
          );
          if (count === 3) ids.push(null);
          const feasible = permutations(ids).some((slots) => {
            if (pinned && slots[0] !== "p1") return false;
            if (count === 3 && slots[slots.indexOf("p1") ^ 1] !== null)
              return false;
            if (pots)
              for (let index = 0; index < 4; index += 2)
                if (
                  slots[index] &&
                  slots[index + 1] &&
                  draw.pots.some(
                    (p) =>
                      p.participantIds.includes(slots[index]!) &&
                      p.participantIds.includes(slots[index + 1]!),
                  )
                )
                  return false;
            return distancesValid(tournament, slots, draw.distance);
          });
          const preview = previewKnockoutDraw(tournament, "main");
          expect(preview.ready).toBe(feasible);
          if (preview.ready)
            expect(
              distancesValid(tournament, preview.slots, draw.distance),
            ).toBe(true);
          expect(
            preview.issueDetails.some((issue) => issue.code === "exhausted"),
          ).toBe(false);
        },
      ),
      { numRuns: 100, seed: 152993 },
    );
  });

  it.each([3, 7, 8, 13, 16, 24, 31, 32, 64, 127, 128, 256, 512])(
    "draws %i entrants deterministically with unchanged BYE recipients",
    (count) => {
      const tournament = cup(count, "double-elimination");
      const draw = configure(tournament, {
        minKm: 0,
        maxKm: 20016,
        losersThroughRound: count > 2 ? 1 : 0,
      });
      const first = previewKnockoutDraw(tournament, "main");
      expect(first.ready).toBe(true);
      expect(first.algorithm).toBe(KNOCKOUT_DISTANCE_ALGORITHM);
      expect(previewKnockoutDraw(tournament, "main")).toEqual(first);
      expect(first.slots.filter(Boolean)).toHaveLength(count);
      expect(new Set(first.slots.filter(Boolean)).size).toBe(count);
      expect(first.byeIds).toEqual(
        tournament.participants
          .slice(0, first.slots.length - count)
          .map((p) => p.id),
      );
      expect(first.slots).toEqual(
        seedPositions(first.slots.length).map(
          (seed) => tournament.participants[seed - 1]?.id ?? null,
        ),
      );
      expect(
        validateTournament(tournament).stages[0].config.knockoutDraw,
      ).toEqual(draw);
    },
  );

  it("completes generated matches without rerouting earned advancement", () => {
    const tournament = cup(13, "double-elimination");
    configure(tournament, {
      minKm: 0,
      maxKm: 20016,
      winnersThroughRound: 2,
      losersThroughRound: 2,
      finals: ["grand-final", "reset"],
    });
    const generated = generateStage(tournament, "main");
    const structure = (document: Tournament) =>
      document.matches.map((match) => ({
        id: match.id,
        slots: match.slots.map((slot) =>
          slot.source ? { source: slot.source } : slot,
        ),
      }));
    const before = canonicalize(structure(generated));
    const finished = simulate(generated);
    expect(finished.stages[0].status).toBe("completed");
    expect(canonicalize(structure(finished))).toBe(before);
    expect(finished.stages[0].config.knockoutDraw).toEqual(
      generated.stages[0].config.knockoutDraw,
    );
  });

  it.each([64, 128, 256, 512])(
    "handles a dense opening-round distance graph for %i entrants",
    (count) => {
      const tournament = cup(count);
      tournament.stages[0].config.seed = "distance-performance";
      tournament.participants.forEach(
        (participant, index) =>
          (participant.location = {
            latitude: 0,
            longitude: -180 + (360 * index) / count,
          }),
      );
      configure(tournament, { maxKm: 12000 });
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.ready).toBe(true);
      for (let index = 0; index < preview.slots.length; index += 2) {
        const [a, b] = preview.slots
          .slice(index, index + 2)
          .map(
            (id) => tournament.participants.find((p) => p.id === id)!.location!,
          );
        expect(greatCircleDistanceKm(a, b)).toBeLessThanOrEqual(12000);
      }
      expect(previewKnockoutDraw(tournament, "main")).toEqual(preview);
    },
  );
});

describe("distance schema and target safety", () => {
  it.each([
    { minKm: undefined, maxKm: undefined },
    { minKm: -1 },
    { maxKm: 20017 },
    { minKm: Infinity },
    { maxKm: NaN },
    { minKm: 2, maxKm: 1 },
    { winnersThroughRound: 0 },
    { winnersThroughRound: 10 },
    { winnersThroughRound: 1.5 },
    { losersThroughRound: 17 },
    { finals: ["reset", "reset"] },
    { finals: ["placement"] },
    { extra: true },
  ])("rejects an invalid distance policy %j", (fields) => {
    const tournament = cup();
    const draw = configure(tournament);
    expect(
      knockoutDistanceSchema.safeParse({ ...draw.distance, ...fields }).success,
    ).toBe(false);
    expect(
      knockoutDrawSchema.safeParse({
        ...draw,
        distance: { ...draw.distance, ...fields },
      }).success,
    ).toBe(false);
  });

  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0 },
    { latitude: 0, longitude: 0, label: "private" },
  ])("rejects malformed coordinates %j", (location) => {
    const participant = cup(2).participants[0];
    expect(
      participantSchema.safeParse({ ...participant, location }).success,
    ).toBe(false);
  });

  it("preserves absent coordinates and requires them only for active stage entrants", () => {
    const tournament = cup(4);
    configure(tournament);
    delete tournament.participants[0].location;
    const validated = validateTournament(tournament);
    expect("location" in validated.participants[0]).toBe(false);
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "missingLocation", values: ["Team 1"] },
    ]);
    tournament.participants[0].status = "withdrawn";
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
  });

  it("rejects unavailable targets and retains out-of-range rules for correction", () => {
    const tournament = cup(3);
    const draw = configure(tournament, { winnersThroughRound: 3 });
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "separationRound",
    );
    expect(
      validateTournament(tournament).stages[0].config.knockoutDraw,
    ).toEqual(draw);
    draw.distance.winnersThroughRound = 0;
    draw.distance.losersThroughRound = 1;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "losersFormat",
    );
    draw.distance.losersThroughRound = 0;
    draw.distance.finals = ["grand-final"];
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "finalsFormat",
    );
    tournament.stages[0].format = "double-elimination";
    draw.distance.finals = ["reset"];
    tournament.stages[0].config.grandFinalReset = false;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "resetUnavailable",
    );
    draw.distance.finals = ["third-place"];
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "thirdPlaceUnavailable",
    );
    tournament.stages[0].format = "single-elimination";
    tournament.participants[2].status = "withdrawn";
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "thirdPlaceUnavailable",
    );
    tournament.stages[0].format = "double-elimination";
    draw.distance.finals = [];
    draw.distance.losersThroughRound = 1;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "losersRound",
    );
  });
});
