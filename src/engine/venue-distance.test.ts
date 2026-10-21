import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type KnockoutDrawConfig,
  type KnockoutVenueRule,
  type KnockoutVenueTarget,
  type Tournament,
} from "../domain/types";
import {
  knockoutDrawSchema,
  knockoutDrawIssueText,
} from "../domain/knockout-draw";
import { knockoutVenueRuleSchema } from "../domain/knockout-venue";
import { validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import {
  generateStage,
  KNOCKOUT_VENUE_ALGORITHM,
  previewKnockoutDraw,
  simulate,
} from "./index";
import { greatCircleDistanceKm } from "./geographic-distance";
import {
  assignedKnockoutVenue,
  getKnockoutVenueTargets,
  knockoutVenueReachability,
  knockoutVenueTargetKey,
  reachableKnockoutEntrants,
  validateKnockoutVenueDistances,
} from "./venue-distance";

function cup(count = 8, format: FormatId = "single-elimination") {
  const tournament = createTournament(
    "جام محل",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      location: { latitude: 0, longitude: index < count / 2 ? 0 : 100 },
      region: `Region ${index % 2}`,
    })),
    format,
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.seed = "venue-fixture";
  tournament.schedule.resources = [
    { id: "west", name: "West hall", location: { latitude: 0, longitude: 0 } },
    {
      id: "east",
      name: "East hall",
      location: { latitude: 0, longitude: 100 },
    },
  ];
  return tournament;
}

const target = (
  bracket: KnockoutVenueTarget["bracket"] = "winners",
  round = 1,
  index = 0,
): KnockoutVenueTarget => ({ bracket, round, index });
function configure(
  tournament: Tournament,
  venueRules: KnockoutVenueRule[] = [
    { resourceId: "west", minKm: 0, targets: [target()] },
  ],
) {
  const draw: Extract<KnockoutDrawConfig, { version: 6 }> = {
    version: 6,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    venueRules,
  };
  tournament.stages[0].config.knockoutDraw = draw;
  return draw;
}

describe("venue configuration validation", () => {
  it("preserves absent locations and older canonical documents", () => {
    const tournament = cup();
    tournament.participants.forEach(
      (participant) => delete participant.location,
    );
    tournament.schedule.resources.forEach(
      (resource) => delete resource.location,
    );
    expect(canonicalize(validateTournament(tournament))).toBe(
      canonicalize(tournament),
    );
    expect(
      Object.hasOwn(
        validateTournament(tournament).schedule.resources[0],
        "location",
      ),
    ).toBe(false);
  });

  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 },
    { latitude: 0 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
    { latitude: 0, longitude: 0, note: "extra" },
  ])("rejects invalid resource coordinates %j", (location) => {
    const tournament = cup();
    Object.assign(tournament.schedule.resources[0], { location });
    expect(() => validateTournament(tournament)).toThrow();
  });

  it.each([
    {},
    { minKm: -1 },
    { maxKm: 20017 },
    { minKm: 10, maxKm: 9 },
    { minKm: Infinity },
    { maxKm: NaN },
    { maxKm: "20" },
  ])("rejects invalid venue range %j", (range) => {
    expect(
      knockoutVenueRuleSchema.safeParse({
        resourceId: "west",
        targets: [target()],
        ...range,
      }).success,
    ).toBe(false);
  });

  it("rejects empty rules, duplicate and overlapping targets, unsupported fields and oversized lists", () => {
    const draw = configure(cup());
    expect(knockoutDrawSchema.safeParse(draw).success).toBe(true);
    expect(
      knockoutDrawSchema.safeParse({ ...draw, venueRules: [] }).success,
    ).toBe(false);
    expect(
      knockoutDrawSchema.safeParse({
        ...draw,
        venueRules: [...draw.venueRules, ...draw.venueRules],
      }).success,
    ).toBe(false);
    expect(
      knockoutVenueRuleSchema.safeParse({ ...draw.venueRules[0], targets: [] })
        .success,
    ).toBe(false);
    expect(
      knockoutVenueRuleSchema.safeParse({ ...draw.venueRules[0], html: "test" })
        .success,
    ).toBe(false);
    expect(
      knockoutDrawSchema.safeParse({
        ...draw,
        venueRules: Array.from({ length: 65 }, (_, index) => ({
          resourceId: "west",
          minKm: 0,
          targets: [target("winners", 1, index)],
        })),
      }).success,
    ).toBe(false);
  });

  it.each([
    target("winners", 4),
    target("winners", 1, 4),
    target("losers", 1),
    target("final", 6),
    target("reset", 7),
    target("placement", 3),
  ])("rejects unavailable target %j on import and preview", (matchTarget) => {
    const tournament = cup();
    configure(tournament, [
      { resourceId: "west", minKm: 0, targets: [matchTarget] },
    ]);
    expect(() => validateTournament(tournament)).toThrow(
      /match does not exist/,
    );
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.some(
        (issue) => issue.code === "venueTarget",
      ),
    ).toBe(true);
  });

  it("rejects an unknown venue but permits importing omitted private coordinates", () => {
    const tournament = cup();
    const draw = configure(tournament);
    draw.venueRules[0].resourceId = "missing";
    expect(() => validateTournament(tournament)).toThrow(/missing venue/);
    draw.venueRules[0].resourceId = "west";
    delete tournament.schedule.resources[0].location;
    tournament.participants.forEach(
      (participant) => delete participant.location,
    );
    expect(() => validateTournament(tournament)).not.toThrow();
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(false);
    expect(
      preview.issueDetails.filter((issue) => issue.code === "missingLocation"),
    ).toHaveLength(8);
    expect(
      preview.issueDetails.some((issue) => issue.code === "venueLocation"),
    ).toBe(true);
  });

  it("requires coordinates for BYE recipients and excludes withdrawn entrants", () => {
    const tournament = cup(7);
    configure(tournament);
    delete tournament.participants[0].location;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "missingLocation",
    );
    tournament.participants[0].status = "withdrawn";
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
  });

  it("returns actionable Persian messages", () => {
    const tournament = cup(2);
    configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target()] },
    ]);
    const issue = previewKnockoutDraw(tournament, "main").issueDetails[0];
    expect(issue.code).toBe("venueNoPosition");
    expect(knockoutDrawIssueText(issue, "fa")).toContain("محل");
    expect(knockoutDrawIssueText(issue, "fa")).toContain("Team 2");
  });
});

describe("venue draw generation", () => {
  it("routes regional entrants into separate venue halves", () => {
    const tournament = cup();
    configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target("winners", 2, 0)] },
      { resourceId: "east", maxKm: 0, targets: [target("winners", 2, 1)] },
    ]);
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.algorithm).toBe(KNOCKOUT_VENUE_ALGORITHM);
    expect(preview.slots.slice(0, 4).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(preview.slots.slice(4).sort()).toEqual(["p5", "p6", "p7", "p8"]);
    expect(previewKnockoutDraw(tournament, "main")).toEqual(preview);
    const generated = generateStage(tournament, "main");
    expect(
      validateKnockoutVenueDistances(generated, generated.stages[0]),
    ).toEqual([]);
    expect(
      generated.matches
        .filter((match) => match.resourceId)
        .map((match) => match.resourceId),
    ).toEqual(["west", "east"]);
  });

  it("uses inclusive bounds, including zero and dateline coordinates", () => {
    const tournament = cup(2);
    tournament.participants.forEach(
      (participant) => (participant.location = { latitude: 0, longitude: 1 }),
    );
    const km = greatCircleDistanceKm(
      tournament.participants[0].location!,
      tournament.schedule.resources[0].location!,
    );
    const draw = configure(tournament, [
      { resourceId: "west", minKm: km, maxKm: km, targets: [target()] },
    ]);
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
    draw.venueRules[0].minKm = km + 1e-6;
    delete draw.venueRules[0].maxKm;
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
    draw.venueRules[0] = {
      resourceId: "west",
      minKm: 0,
      maxKm: 0,
      targets: [target()],
    };
    tournament.schedule.resources[0].location = {
      latitude: 30,
      longitude: -180,
    };
    tournament.participants.forEach(
      (participant) =>
        (participant.location = { latitude: 30, longitude: 180 }),
    );
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
  });

  it("combines venue limits, opponent distances, pots, affiliations and protected seeds", () => {
    const tournament = cup();
    const draw = configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target("winners", 2, 0)] },
    ]);
    draw.protectedSeeds = 1;
    draw.restrictions = ["region"];
    draw.pots = [
      { id: "a", name: "A", participantIds: ["p1", "p3", "p5", "p7"] },
      { id: "b", name: "B", participantIds: ["p2", "p4", "p6", "p8"] },
    ];
    draw.distance = {
      maxKm: 0,
      winnersThroughRound: 1,
      losersThroughRound: 0,
      finals: [],
    };
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.slots[0]).toBe("p1");
    for (let index = 0; index < 8; index += 2) {
      const pair = preview.slots.slice(index, index + 2);
      expect(
        pair.filter((id) => draw.pots[0].participantIds.includes(id!)),
      ).toHaveLength(1);
      const entrants = pair.map((id) =>
        tournament.participants.find((participant) => participant.id === id)!,
      );
      expect(entrants[0].region).not.toBe(entrants[1].region);
      expect(entrants[0].location).toEqual(entrants[1].location);
    }
  });

  it("reports a protected seed that cannot use its fixed venue path", () => {
    const tournament = cup();
    const draw = configure(tournament, [
      { resourceId: "east", maxKm: 0, targets: [target()] },
    ]);
    draw.protectedSeeds = 1;
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.some(
        (issue) => issue.code === "venueFixed",
      ),
    ).toBe(true);
  });

  it("preserves explicit qualification positions across venue assignments", () => {
    const source = simulate(cup(8, "round-robin"));
    source.stages[0].id = "qualifier";
    source.matches.forEach((match) => (match.stageId = "qualifier"));
    const final = cup();
    configure(final, [
      { resourceId: "west", maxKm: 0, targets: [target("winners", 2, 0)] },
      { resourceId: "east", maxKm: 0, targets: [target("winners", 2, 1)] },
    ]);
    source.stages.push({
      ...final.stages[0],
      participantIds: [],
      order: 1,
      sources: [
        {
          stageId: "qualifier",
          count: 8,
          perGroup: false,
          bracketSlots: [1, 2, 3, 4, 5, 6, 7, 8],
        },
      ],
    });
    expect(previewKnockoutDraw(source, "main").slots).toEqual(
      source.participants.map((participant) => participant.id),
    );
    source.stages[1].sources[0].bracketSlots = [1, 2, 3, 5, 4, 6, 7, 8];
    expect(
      previewKnockoutDraw(source, "main").issueDetails.filter(
        (issue) => issue.code === "venueFixed",
      ),
    ).toHaveLength(2);
  });

  it.each([0, 1, 2, 3, 8])(
    "keeps %i protected seeds while assigning available venue positions",
    (protectedSeeds) => {
      const tournament = cup();
      const draw = configure(tournament);
      draw.protectedSeeds = protectedSeeds;
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.ready).toBe(true);
      for (const fixed of preview.fixedSlots)
        expect(preview.slots[fixed.slot - 1]).toBe(fixed.participantId);
      expect(new Set(preview.slots)).toHaveLength(8);
    },
  );

  it.each([128, 256, 512])(
    "pairs dense opponent restrictions at distinct venues for %i entrants",
    (count) => {
      const tournament = cup(count);
      tournament.participants.forEach(
        (participant, index) =>
          (participant.location = {
            latitude: 0,
            longitude: (index * 360) / count - 180,
          }),
      );
      tournament.schedule.resources[0].location!.longitude = -90;
      tournament.schedule.resources[1].location!.longitude = 90;
      const draw = configure(
        tournament,
        ["west", "east"].map((resourceId, side) => ({
          resourceId,
          maxKm: 10008,
          targets: Array.from({ length: count / 4 }, (_, index) =>
            target("winners", 1, index + (side * count) / 4),
          ),
        })),
      );
      draw.distance = {
        maxKm: 12000,
        winnersThroughRound: 1,
        losersThroughRound: 0,
        finals: [],
      };
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.ready).toBe(true);
      expect(preview.exploredNodes).toBeLessThan(1000);
      const generated = generateStage(tournament, "main");
      expect(
        validateKnockoutVenueDistances(generated, generated.stages[0]),
      ).toEqual([]);
      const participants = new Map(
        generated.participants.map((participant) => [
          participant.id,
          participant,
        ]),
      );
      for (let index = 0; index < preview.slots.length; index += 2)
        expect(
          greatCircleDistanceKm(
            participants.get(preview.slots[index]!)!.location!,
            participants.get(preview.slots[index + 1]!)!.location!,
          ),
        ).toBeLessThanOrEqual(12000);
    },
  );

  it("reports exact infeasibility when too few entrants qualify for an opening venue", () => {
    const tournament = cup(4);
    tournament.participants[1].location = { latitude: 0, longitude: 100 };
    configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target()] },
    ]);
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(false);
    expect(preview.slots).toEqual([]);
    expect(preview.issueDetails.map((issue) => issue.code)).toEqual([
      "venueInfeasible",
    ]);
  });

  it("protects the actual crossover into the losers bracket", () => {
    const tournament = cup(8, "double-elimination");
    const draw = configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target("losers", 1, 0)] },
    ]);
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.slots.slice(0, 4).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    draw.venueRules[0].targets = [target("losers", 2, 0)];
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.some(
        (issue) => issue.code === "venueNoPosition",
      ),
    ).toBe(true);
  });

  it.each([target("winners", 3), target("final", 6), target("reset", 7)])(
    "requires every possible finalist to reach venue %j",
    (matchTarget) => {
      const tournament = cup(8, "double-elimination");
      configure(tournament, [
        { resourceId: "west", maxKm: 0, targets: [matchTarget] },
      ]);
      expect(
        previewKnockoutDraw(tournament, "main").issueDetails.filter(
          (issue) => issue.code === "venueNoPosition",
        ),
      ).toHaveLength(4);
    },
  );

  it("excludes an opening BYE from the third-place loser path but protects its automatic appearance", () => {
    const tournament = cup(3);
    tournament.stages[0].config.thirdPlace = true;
    tournament.participants[0].location = { latitude: 0, longitude: 100 };
    tournament.participants[1].location = tournament.participants[2].location =
      { latitude: 0, longitude: 0 };
    const draw = configure(tournament, [
      { resourceId: "west", maxKm: 0, targets: [target("placement", 2)] },
    ]);
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(true);
    const generated = generateStage(tournament, "main");
    const place = generated.matches.find(
      (match) => match.bracket === "placement",
    )!;
    expect(place.resourceId).toBe("west");
    expect(
      reachableKnockoutEntrants(generated.matches).get(
        knockoutVenueTargetKey(place),
      ),
    ).toEqual(new Set(["p2", "p3"]));
    expect(
      validateKnockoutVenueDistances(generated, generated.stages[0]),
    ).toEqual([]);
    draw.venueRules[0].targets = [
      target("winners", 1, 0),
      target("winners", 1, 1),
    ];
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
  });

  it("assigns a venue to a forced opening walkover", () => {
    const tournament = cup(3);
    const draw = configure(tournament);
    draw.protectedSeeds = 1;
    const generated = generateStage(tournament, "main");
    const match = generated.matches.find(
      (item) =>
        item.bracket === "winners" && item.round === 1 && item.index === 0,
    )!;
    expect(match.status).toBe("bye");
    expect(match.result?.outcome).toBe("walkover");
    expect(match.resourceId).toBe("west");
  });

  it.each([2, 3, 5, 7, 13, 17, 31, 127, 256, 512])(
    "supports all match targets and exact BYEs for %i entrants",
    (count) => {
      const tournament = cup(count, "double-elimination");
      const targets = getKnockoutVenueTargets(tournament.stages[0], count);
      configure(tournament, [
        { resourceId: "west", minKm: 0, maxKm: 20016, targets },
      ]);
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.ready).toBe(true);
      expect(preview.byeIds).toHaveLength(
        2 ** Math.ceil(Math.log2(count)) - count,
      );
      expect(preview.slots.filter(Boolean)).toHaveLength(count);
      const generated = generateStage(tournament, "main");
      expect(
        generated.matches.every((match) => match.resourceId === "west"),
      ).toBe(true);
      expect(
        validateKnockoutVenueDistances(generated, generated.stages[0]),
      ).toEqual([]);
      expect(() => validateTournament(generated)).not.toThrow();
    },
  );
});

describe("venue path and correction validation", () => {
  it("builds target coordinates from generated formats and disabled finals", () => {
    const tournament = cup(8, "double-elimination");
    const stage = tournament.stages[0];
    const targets = getKnockoutVenueTargets(stage, 8);
    expect(targets).toHaveLength(15);
    expect(targets.at(-1)).toEqual(target("reset", 7));
    stage.config.grandFinalReset = false;
    expect(getKnockoutVenueTargets(stage, 8)).toHaveLength(14);
    expect(getKnockoutVenueTargets(stage, 1)).toEqual([]);
    expect(getKnockoutVenueTargets(stage, 513)).toEqual([]);
    stage.format = "groups";
    expect(getKnockoutVenueTargets(stage, 8)).toEqual([]);
  });

  it("checks original reachable entrants after played results narrow resolved slots", () => {
    const tournament = cup(4);
    configure(tournament, [
      { resourceId: "west", minKm: 0, targets: [target("winners", 2)] },
    ]);
    const completed = simulate(generateStage(tournament, "main"));
    expect(
      validateKnockoutVenueDistances(completed, completed.stages[0]),
    ).toEqual([]);
    const final = completed.matches.find((match) => match.round === 2)!;
    const eliminated = completed.participants.find(
      (participant) =>
        !final.slots.some((slot) => slot.participantId === participant.id),
    )!;
    eliminated.location = { latitude: 0, longitude: 180 };
    const draw = completed.stages[0].config.knockoutDraw as Extract<
      KnockoutDrawConfig,
      { version: 6 }
    >;
    draw.venueRules[0].maxKm = 15000;
    expect(
      validateKnockoutVenueDistances(completed, completed.stages[0]).some(
        (issue) =>
          issue.code === "venueDistance" && issue.values[0] === eliminated.name,
      ),
    ).toBe(true);
  });

  it("reports absent targets and broken source graphs without trusting resolved slots", () => {
    const tournament = cup(4);
    configure(tournament, [
      { resourceId: "west", minKm: 0, targets: [target("winners", 2)] },
    ]);
    const generated = generateStage(tournament, "main");
    const final = generated.matches.find((match) => match.round === 2)!;
    expect(assignedKnockoutVenue(generated.stages[0], final)).toBe("west");
    delete final.resourceId;
    expect(
      validateKnockoutVenueDistances(generated, generated.stages[0]),
    ).toEqual([]);
    final.slots[0].source!.matchId = "missing";
    expect(
      validateKnockoutVenueDistances(generated, generated.stages[0]).map(
        (issue) => issue.code,
      ),
    ).toEqual(["venueTarget"]);
  });

  it("retains results and refuses regenerating a played venue draw", () => {
    const tournament = cup(4);
    configure(tournament);
    const completed = simulate(generateStage(tournament, "main"));
    const before = canonicalize(completed);
    expect(() => generateStage(completed, "main")).toThrow(/played or live/);
    expect(canonicalize(completed)).toBe(before);
  });

  it("matches concrete reachability to opening variants across random legal BYE layouts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 32 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 100000 }),
        (count, double, seed) => {
          const tournament = cup(
            count,
            double ? "double-elimination" : "single-elimination",
          );
          tournament.stages[0].config.thirdPlace = true;
          tournament.stages[0].config.seed = String(seed);
          tournament.stages[0].config.seeding = "random";
          configure(tournament);
          const preview = previewKnockoutDraw(tournament, "main");
          expect(preview.ready).toBe(true);
          const generated = generateStage(tournament, "main");
          const concrete = reachableKnockoutEntrants(generated.matches);
          const abstract = knockoutVenueReachability(
            generated.stages[0],
            count,
          );
          const byes = new Set(preview.byeIds);
          for (const [key, ids] of concrete) {
            const expected = preview.slots.flatMap((id, index) =>
              id &&
              abstract
                .get(key)!
                .has(2 * Math.floor(index / 2) + Number(byes.has(id)))
                ? [id]
                : [],
            );
            expect(ids).toEqual(new Set(expected));
          }
        },
      ),
      { numRuns: 75, seed: 130412 },
    );
  });
});
