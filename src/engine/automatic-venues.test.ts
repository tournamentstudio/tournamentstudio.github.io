import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type KnockoutVenueTarget,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import {
  automaticVenueIssueText,
  previewAutomaticKnockoutVenues,
  type AutomaticVenuePreview,
  type AutomaticVenueRequest,
} from "./automatic-venues";
import { generateStage, previewKnockoutDraw, simulate } from "./index";
import {
  getKnockoutVenueTargets,
  validateKnockoutVenueDistances,
} from "./venue-distance";

function cup(count = 8, format: FormatId = "single-elimination") {
  const doc = createTournament(
    "جام محل",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      location: { latitude: 0, longitude: index < count / 2 ? 0 : 100 },
      region: `Region ${index % 2}`,
    })),
    format,
  );
  doc.stages[0].id = "main";
  doc.stages[0].config.seed = "automatic-venue-fixture";
  doc.schedule.resources = [
    { id: "west", name: "West hall", location: { latitude: 0, longitude: 0 } },
    {
      id: "east",
      name: "East hall",
      location: { latitude: 0, longitude: 100 },
    },
    {
      id: "center",
      name: "Central hall",
      location: { latitude: 0, longitude: 50 },
    },
  ];
  return doc;
}

const target = (
  bracket: KnockoutVenueTarget["bracket"] = "winners",
  round = 1,
  index = 0,
): KnockoutVenueTarget => ({ bracket, round, index });
const request = (
  targets = [target()],
  options: Partial<AutomaticVenueRequest> = {},
): AutomaticVenueRequest => ({
  resourceIds: ["west", "east"],
  targets,
  maxKm: 0,
  ...options,
});

function verify(doc: Tournament, plan: AutomaticVenuePreview) {
  expect(plan.ready, JSON.stringify(plan.issueDetails)).toBe(true);
  const next = structuredClone(doc);
  next.stages.find((stage) => stage.id === "main")!.config.knockoutDraw =
    plan.draw;
  expect(previewKnockoutDraw(next, "main").slots).toEqual(plan.preview!.slots);
  const generated = generateStage(next, "main");
  expect(
    validateKnockoutVenueDistances(
      generated,
      generated.stages.find((stage) => stage.id === "main")!,
    ),
  ).toEqual([]);
  expect(validateTournament(generated)).toEqual(generated);
  return generated;
}

describe("automatic venue proposals", () => {
  it("redraws entrants jointly with venue choices and leaves the input unchanged", () => {
    const doc = cup();
    const before = canonicalize(doc);
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target("winners", 2, 0), target("winners", 2, 1)]),
    );
    verify(doc, plan);
    expect(new Set(plan.assignments.map((item) => item.resourceId))).toEqual(
      new Set(["west", "east"]),
    );
    expect(
      plan.assignments.every(
        (item) => item.maxDistanceKm === 0 && item.entrantCount === 4,
      ),
    ).toBe(true);
    expect(canonicalize(doc)).toBe(before);
  });

  it("makes input ordering irrelevant and uses stable resource identifiers to break ties", () => {
    const doc = cup(4);
    doc.participants.forEach(
      (participant) => (participant.location!.longitude = 50),
    );
    doc.schedule.resources[0].location!.longitude = 50;
    doc.schedule.resources[1].location!.longitude = 50;
    const targets = [target(), target("winners", 1, 1)];
    const first = previewAutomaticKnockoutVenues(doc, "main", request(targets));
    const second = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([...targets].reverse(), { resourceIds: ["east", "west"] }),
    );
    expect(first).toEqual(second);
    verify(doc, first);
    expect(first.assignments.every((item) => item.resourceId === "east")).toBe(
      true,
    );
  });

  it("prefers the venue with the smaller worst-case distance when both fit", () => {
    const doc = cup(2);
    doc.participants.forEach(
      (participant) => (participant.location!.longitude = 40),
    );
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target()], {
        resourceIds: ["west", "center", "east"],
        minKm: 0,
        maxKm: 20016,
      }),
    );
    verify(doc, plan);
    expect(plan.assignments[0].resourceId).toBe("center");
    expect(plan.assignments[0].maxDistanceKm).toBeGreaterThan(1000);
    expect(plan.assignments[0].minDistanceKm).toBe(
      plan.assignments[0].maxDistanceKm,
    );
  });

  it("preserves fixed rules and combines matching venue ranges without spending another rule", () => {
    const doc = cup();
    doc.stages[0].config.knockoutDraw = {
      version: 6,
      pots: [],
      restrictions: [],
      protectedSeeds: 0,
      separation: [],
      losersSeparation: [],
      finalsSeparation: [],
      venueRules: [{ resourceId: "west", maxKm: 0, targets: [target()] }],
    };
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target("winners", 1, 1)], { resourceIds: ["west"] }),
    );
    verify(doc, plan);
    expect(plan.draw!.venueRules).toEqual([
      {
        resourceId: "west",
        maxKm: 0,
        targets: [target(), target("winners", 1, 1)],
      },
    ]);
    expect(doc.stages[0].config.knockoutDraw.venueRules[0].targets).toEqual([
      target(),
    ]);
    expect(
      previewAutomaticKnockoutVenues(doc, "main", request()).issueDetails[0]
        .code,
    ).toBe("autoVenueAssigned");
  });

  it("keeps pots, protected seeds, BYEs, affiliations and opponent distance limits", () => {
    const doc = cup(7);
    doc.stages[0].config.knockoutDraw = {
      version: 5,
      pots: [
        {
          id: "first",
          name: "First",
          participantIds: ["p1", "p2", "p3", "p4"],
        },
        { id: "second", name: "Second", participantIds: ["p5", "p6", "p7"] },
      ],
      restrictions: ["region"],
      protectedSeeds: 2,
      separation: [],
      losersSeparation: [],
      finalsSeparation: [],
      distance: {
        minKm: 100,
        winnersThroughRound: 1,
        losersThroughRound: 0,
        finals: [],
      },
    };
    const before = previewKnockoutDraw(doc, "main");
    expect(before.ready).toBe(true);
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target()], { maxKm: 20016 }),
    );
    verify(doc, plan);
    expect(plan.preview!.byeIds).toEqual(before.byeIds);
    expect(plan.preview!.fixedSlots).toEqual(before.fixedSlots);
    expect(plan.draw).toMatchObject({
      ...doc.stages[0].config.knockoutDraw,
      version: 6,
    });
  });

  it("respects explicit qualification slots", () => {
    const source = simulate(cup(4, "round-robin"));
    source.stages[0].id = "qualifier";
    source.matches.forEach((match) => (match.stageId = "qualifier"));
    const final = cup(4).stages[0];
    final.sources = [
      {
        stageId: "qualifier",
        perGroup: false,
        count: 4,
        bracketSlots: [1, 2, 3, 4],
      },
    ];
    source.stages.push(final);
    const plan = previewAutomaticKnockoutVenues(
      source,
      "main",
      request([target()], { maxKm: 20016 }),
    );
    verify(source, plan);
    for (const fixed of plan.preview!.fixedSlots)
      expect(plan.preview!.slots[fixed.slot - 1]).toBe(fixed.participantId);
  });

  it("checks lower brackets, grand finals and resets against every reachable entrant", () => {
    const doc = cup(8, "double-elimination");
    const targets = getKnockoutVenueTargets(doc.stages[0], 8);
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request(targets, { resourceIds: ["center"], maxKm: 6000 }),
    );
    verify(doc, plan);
    expect(
      plan.assignments.some((item) => item.target.bracket === "reset"),
    ).toBe(true);
    expect(
      plan.assignments
        .filter((item) => ["final", "reset"].includes(item.target.bracket))
        .every((item) => item.entrantCount === 8),
    ).toBe(true);
    expect(
      previewAutomaticKnockoutVenues(
        doc,
        "main",
        request(targets, { maxKm: 1 }),
      ).issueDetails[0].code,
    ).toBe("autoVenueInfeasible");
  });

  it("excludes the semifinal BYE entrant from third place while keeping its slot venue", () => {
    const doc = cup(3);
    doc.stages[0].config.thirdPlace = true;
    doc.participants[0].location!.longitude = 100;
    doc.participants[1].location!.longitude = 0;
    doc.participants[2].location!.longitude = 0;
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target("placement", 2)], { resourceIds: ["west"] }),
    );
    verify(doc, plan);
    expect(plan.preview!.byeIds).toEqual(["p1"]);
    expect(plan.assignments[0].entrantCount).toBe(2);
  });

  it.each([2, 3, 7, 13, 31, 127, 256, 512])(
    "supports all target paths for %i entrants",
    (count) => {
      const doc = cup(count, "double-elimination");
      const plan = previewAutomaticKnockoutVenues(
        doc,
        "main",
        request(getKnockoutVenueTargets(doc.stages[0], count), {
          resourceIds: ["center"],
          maxKm: 20016,
        }),
      );
      verify(doc, plan);
      expect(plan.exploredAssignments).toBe(1);
    },
  );
});

describe("automatic venue cohort packing", () => {
  it.each([128, 256, 512])(
    "packs separate venue cohorts for %i opening entrants",
    (count) => {
      const doc = cup(count);
      const targets = getKnockoutVenueTargets(doc.stages[0], count).filter(
        (item) => item.bracket === "winners" && item.round === 1,
      );
      const plan = previewAutomaticKnockoutVenues(
        doc,
        "main",
        request(targets),
      );
      verify(doc, plan);
      expect(plan.exploredAssignments).toBeLessThan(4);
      expect(
        new Set(plan.assignments.map((item) => item.resourceId)).size,
      ).toBe(2);
    },
  );
});

describe("automatic venue input and search limits", () => {
  it.each([
    { resourceIds: [] },
    { resourceIds: ["west", "west"] },
    { resourceIds: Array.from({ length: 17 }, (_, index) => `venue${index}`) },
    { targets: [] },
    { targets: [target(), target()] },
    { targets: [target("winners", 0)] },
    { targets: [target("winners", 1, -1)] },
    { minKm: 2, maxKm: 1 },
    { maxKm: -1 },
    { maxKm: NaN },
    { minKm: undefined, maxKm: undefined },
    { maxKm: 20017 },
  ])("rejects malformed requests %j", (change) => {
    expect(
      previewAutomaticKnockoutVenues(cup(), "main", request([target()], change))
        .issueDetails[0].code,
    ).toBe("autoVenueRequest");
  });

  it("rejects missing venues, coordinates and unavailable targets", () => {
    const doc = cup();
    expect(
      previewAutomaticKnockoutVenues(
        doc,
        "main",
        request([target()], { resourceIds: ["missing"] }),
      ).issueDetails[0].code,
    ).toBe("venueMissing");
    delete doc.schedule.resources[0].location;
    expect(
      previewAutomaticKnockoutVenues(doc, "main", request()).issueDetails[0]
        .code,
    ).toBe("venueLocation");
    expect(
      previewAutomaticKnockoutVenues(
        cup(),
        "main",
        request([target("reset", 7)]),
      ).issueDetails[0].code,
    ).toBe("venueTarget");
    delete doc.participants[0].location;
    expect(
      previewAutomaticKnockoutVenues(doc, "main", request()).issueDetails[0]
        .code,
    ).toBe("missingLocation");
  });

  it("does not change an existing draw, even before results", () => {
    const doc = generateStage(cup(), "main");
    const before = canonicalize(doc);
    expect(
      previewAutomaticKnockoutVenues(doc, "main", request()).issueDetails[0]
        .code,
    ).toBe("autoVenueLocked");
    expect(canonicalize(doc)).toBe(before);
  });

  it("requires a reset when a generated descendant depends on the stage", () => {
    const doc = cup();
    const next = structuredClone(doc.stages[0]);
    next.id = "next";
    next.sources = [{ stageId: "main", count: 2, perGroup: false }];
    doc.stages.push(next);
    const later = structuredClone(next);
    later.id = "later";
    later.sources = [{ stageId: "next", count: 2, perGroup: false }];
    doc.stages.push(later);
    doc.matches = generateStage(cup(2), "main").matches.map((match) => ({
      ...match,
      stageId: "later",
    }));
    expect(
      previewAutomaticKnockoutVenues(doc, "main", request()).issueDetails[0]
        .code,
    ).toBe("autoVenueLocked");
  });

  it("separates proved infeasibility from an incomplete bounded search", () => {
    const doc = cup(2);
    const impossible = previewAutomaticKnockoutVenues(doc, "main", request());
    expect(impossible.issueDetails[0].code).toBe("autoVenueInfeasible");
    expect(impossible.exhausted).toBe(false);
    const unknown = previewAutomaticKnockoutVenues(doc, "main", request(), {
      previewLimit: 0,
    });
    expect(unknown.issueDetails[0].code).toBe("autoVenueExhausted");
    expect(unknown.exhausted).toBe(true);
    expect(unknown.exploredAssignments).toBe(0);
    const work = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target()], { maxKm: 20016 }),
      { workPerPreview: 0 },
    );
    expect(work.exhausted).toBe(true);
  });

  it("continues after a full proposal fails a separate schedule check", () => {
    const doc = cup(2);
    const seen: string[] = [];
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request([target()], { maxKm: 20016 }),
      {
        accept: (draw) => {
          seen.push(draw.venueRules[0].resourceId);
          return draw.venueRules[0].resourceId === "west";
        },
      },
    );
    verify(doc, plan);
    expect(seen).toEqual(["east", "west"]);
    expect(plan.scheduleRejected).toBe(1);
    expect(plan.assignments[0].resourceId).toBe("west");
  });

  it("does not describe greedy schedule rejections as proof of impossibility", () => {
    const plan = previewAutomaticKnockoutVenues(
      cup(2),
      "main",
      request([target()], { maxKm: 20016 }),
      { accept: () => false },
    );
    expect(plan.issueDetails[0].code).toBe("autoVenueSchedule");
    expect(plan.scheduleRejected).toBe(2);
    expect(plan.exhausted).toBe(false);
    expect(automaticVenueIssueText(plan.issueDetails[0], "en")).toContain(
      "does not prove",
    );
    expect(automaticVenueIssueText(plan.issueDetails[0], "fa")).toContain(
      "زمان‌بندی",
    );
  });

  it("tries complete alternate venues when a large preferred plan fails scheduling", () => {
    const doc = cup(512, "double-elimination");
    const plan = previewAutomaticKnockoutVenues(
      doc,
      "main",
      request(getKnockoutVenueTargets(doc.stages[0], 512), { maxKm: 20016 }),
      {
        accept: (draw) =>
          draw.venueRules.every((rule) => rule.resourceId === "west"),
      },
    );
    verify(doc, plan);
    expect(plan.scheduleRejected).toBe(1);
    expect(plan.exploredAssignments).toBe(2);
    expect(plan.exploredWork).toBeLessThan(20000000);
    expect(plan.assignments.every((item) => item.resourceId === "west")).toBe(
      true,
    );
  });

  it("reports unknown when the schedule search runs out of candidate previews", () => {
    const plan = previewAutomaticKnockoutVenues(
      cup(2),
      "main",
      request([target()], { maxKm: 20016 }),
      { previewLimit: 1, accept: () => false },
    );
    expect(plan.issueDetails[0].code).toBe("autoVenueExhausted");
    expect(plan.scheduleRejected).toBe(1);
  });
});
