import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type FormatId,
  type KnockoutDrawConfig,
  type KnockoutFinalTarget,
  type Tournament,
} from "../domain/types";
import { normalizeDrawLabel } from "../domain/draw";
import { knockoutDrawSchema } from "../domain/knockout-draw";
import { validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import {
  applyPatch,
  createPatch,
  decodeCode,
  decodeRecipe,
  encodeCode,
  encodeRecipe,
  exportArchive,
  importArchive,
  publicProjection,
  sealDocument,
} from "../sharing";
import {
  generateStage,
  getChampion,
  KNOCKOUT_DRAW_ALGORITHM,
  KNOCKOUT_FINALS_ALGORITHM,
  KNOCKOUT_PATHS_ALGORITHM,
  KNOCKOUT_SEPARATION_ALGORITHM,
  knockoutDrawIssueText,
  previewKnockoutDraw,
  recordResult,
  seedPositions,
  simulate,
} from "./index";
import { singleElimination } from "./elimination";
import { canMeetInThirdPlace } from "./finals-separation";
import { solveKnockoutPaths, type KnockoutPathsInput } from "./knockout-paths";

function cup(count = 8, format: FormatId = "single-elimination") {
  const tournament = createTournament(
    "جام رده‌بندی",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      region: `منطقه ${index + 1}`,
      organization: `Club ${index + 1}`,
    })),
    format,
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.seed = "final-paths-fixture";
  tournament.stages[0].config.thirdPlace = true;
  tournament.stages[0].config.grandFinalReset = true;
  tournament.rules.tieBreakers.push("seed");
  return tournament;
}

function configure(
  tournament: Tournament,
  targets: KnockoutFinalTarget[] = ["third-place"],
) {
  const draw: Extract<KnockoutDrawConfig, { version: 4 }> = {
    version: 4,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [{ field: "region", targets }],
  };
  tournament.stages[0].config.knockoutDraw = draw;
  return draw;
}

/** Inspect actual bracket outcomes independently of the draw constraints. */
function observedPairs(slots: (string | null)[], double: boolean) {
  const ids = slots.filter((id): id is string => id !== null);
  const stage = cup(
    ids.length,
    double ? "double-elimination" : "single-elimination",
  ).stages[0];
  const matches = singleElimination(
    stage,
    ids,
    double,
    slots.flatMap((participantId, index) =>
      participantId ? [{ participantId, slot: index + 1 }] : [],
    ),
  );
  const values = new Map<string, { winner?: string; loser?: string }>();
  const seen: Record<KnockoutFinalTarget, Set<string>> = {
    "grand-final": new Set(),
    reset: new Set(),
    "third-place": new Set(),
  };
  const visit = (index: number) => {
    if (index === matches.length) return;
    const match = matches[index];
    if (match.metadata.conditionalReset) {
      const grandFinal = matches.find(
        (item) => item.id === match.metadata.conditionalReset,
      )!;
      const unbeaten = values.get(grandFinal.slots[0].source!.matchId)!.winner;
      if (values.get(grandFinal.id)!.winner === unbeaten) return;
    }
    const entrants = match.slots
      .map((slot) =>
        slot.source
          ? values.get(slot.source.matchId)?.[
              slot.source.result as "winner" | "loser"
            ]
          : slot.participantId,
      )
      .filter((id): id is string => !!id);
    if (entrants.length < 2) {
      values.set(match.id, { winner: entrants[0] });
      visit(index + 1);
      return;
    }
    const target =
      match.bracket === "final"
        ? "grand-final"
        : match.bracket === "reset"
          ? "reset"
          : match.bracket === "placement"
            ? "third-place"
            : null;
    if (target) seen[target].add([...entrants].sort().join("|"));
    for (let winner = 0; winner < 2; winner++) {
      values.set(match.id, {
        winner: entrants[winner],
        loser: entrants[1 - winner],
      });
      visit(index + 1);
    }
  };
  visit(0);
  return seen;
}

function verifyDraw(tournament: Tournament) {
  const before = canonicalize(tournament);
  const preview = previewKnockoutDraw(tournament, "main");
  expect(preview.issues).toEqual([]);
  expect(preview.algorithm).toBe(KNOCKOUT_FINALS_ALGORITHM);
  expect(preview).toEqual(previewKnockoutDraw(tournament, "main"));
  const generated = generateStage(tournament, "main");
  expect(generated.stages[0].metadata.drawAlgorithm).toBe(
    KNOCKOUT_FINALS_ALGORITHM,
  );
  const slots = generated.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .flatMap((match) => match.slots.map((slot) => slot.participantId ?? null));
  expect(slots).toEqual(preview.slots);
  expect(slots.filter(Boolean).sort()).toEqual(
    [...preview.participantIds].sort(),
  );
  expect(
    slots
      .filter((id, index) => id !== null && slots[index ^ 1] === null)
      .sort(),
  ).toEqual([...preview.byeIds].sort());
  for (const fixed of preview.fixedSlots)
    expect(slots[fixed.slot - 1]).toBe(fixed.participantId);
  expect(canonicalize(tournament)).toBe(before);
  return generated;
}

describe("final and third-place encounter policy", () => {
  it.each([2, 4, 8])(
    "agrees with every actual outcome and BYE placement at size %i",
    (size) => {
      for (let mask = 0; mask < 2 ** size; mask++) {
        const slots = Array.from({ length: size }, (_, index) =>
          mask & (1 << index) ? `p${index}` : null,
        );
        const ids = slots.filter((id): id is string => id !== null);
        if (ids.length <= size / 2 || ids.length < 2) continue;
        if (
          slots.some((id, index) => index % 2 === 0 && !id && !slots[index + 1])
        )
          continue;
        const byes = new Set(
          slots.filter(
            (id, index): id is string => id !== null && !slots[index ^ 1],
          ),
        );
        for (const double of [false, true]) {
          const observed = observedPairs(slots, double);
          for (let a = 0; a < size; a++)
            for (let b = a + 1; b < size; b++) {
              if (!slots[a] || !slots[b]) continue;
              const key = [slots[a], slots[b]].sort().join("|");
              expect(observed["grand-final"].has(key)).toBe(double);
              expect(observed.reset.has(key)).toBe(double);
              expect(observed["third-place"].has(key)).toBe(
                !double &&
                  canMeetInThirdPlace(
                    size,
                    byes,
                    slots[a]!,
                    Math.floor(a / 2),
                    slots[b]!,
                    Math.floor(b / 2),
                  ),
              );
            }
        }
      }
    },
  );
});

describe("finals and third-place restricted draws", () => {
  it.each([2, 13, 512])(
    "supports grand-final and reset protection at count %i",
    (count) => {
      const tournament = cup(count, "double-elimination");
      const draw = configure(tournament, ["grand-final", "reset"]);
      draw.protectedSeeds = Math.min(4, count);
      draw.finalsSeparation.push({
        field: "organization",
        targets: ["grand-final", "reset"],
      });
      verifyDraw(tournament);
      tournament.participants[0].region = tournament.participants[1].region;
      const rejected = previewKnockoutDraw(tournament, "main");
      expect(rejected.slots).toEqual([]);
      expect(rejected.exploredNodes).toBe(0);
      expect(rejected.issueDetails).toEqual([
        {
          code: "finalsCapacity",
          values: [tournament.participants[1].region!, "2"],
        },
      ]);
    },
  );
  it.each([3, 5, 7, 8, 13, 17, 31, 64, 127, 128, 256, 512])(
    "preserves seeds, pots, and exact BYEs at count %i",
    (count) => {
      const tournament = cup(count);
      const draw = configure(tournament);
      draw.protectedSeeds = Math.min(4, count);
      draw.restrictions = ["region"];
      draw.separation = [{ field: "region", throughRound: 2 }];
      draw.finalsSeparation.push({
        field: "organization",
        targets: ["third-place"],
      });
      const half = 2 ** Math.ceil(Math.log2(count)) / 2;
      draw.pots = [
        tournament.stages[0].participantIds.slice(0, half),
        tournament.stages[0].participantIds.slice(half),
      ].map((participantIds, index) => ({
        id: `pot-${index}`,
        name: `Pot ${index + 1}`,
        participantIds,
      }));
      verifyDraw(tournament);
    },
  );

  it("jointly places repeated labels in the same half and different opening matches", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.restrictions = ["region"];
    tournament.participants[0].region = " كرج ";
    tournament.participants[1].region = "کرج";
    verifyDraw(tournament);
    const slots = previewKnockoutDraw(tournament, "main").slots;
    expect(Math.floor(slots.indexOf("p1") / 4)).toBe(
      Math.floor(slots.indexOf("p2") / 4),
    );
    expect(Math.floor(slots.indexOf("p1") / 2)).not.toBe(
      Math.floor(slots.indexOf("p2") / 2),
    );
    draw.separation = [{ field: "region", throughRound: 2 }];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "finalsInfeasible", values: [] },
    ]);
  });

  it("does not invent a semifinal loser for a three-entrant BYE recipient", () => {
    let tournament = cup(3);
    const draw = configure(tournament);
    draw.protectedSeeds = 3;
    tournament.participants.forEach((participant) => {
      participant.region = "Shared";
    });
    tournament = verifyDraw(tournament);
    const semifinal = tournament.matches.find(
      (match) => match.status === "ready",
    )!;
    tournament = recordResult(tournament, semifinal.id, {
      scores: [1, 0],
      winnerIds: [semifinal.slots[0].participantId!],
      outcome: "played",
      recordedAt: tournament.updatedAt,
    });
    const thirdPlace = tournament.matches.find(
      (match) => match.bracket === "placement",
    )!;
    expect(thirdPlace.status).toBe("bye");
    expect(thirdPlace.slots.filter((slot) => slot.participantId)).toHaveLength(
      1,
    );
    expect(thirdPlace.slots.some((slot) => slot.participantId === "p1")).toBe(
      false,
    );
  });

  it("rejects conflicting fixed halves without changing protected positions", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.protectedSeeds = 8;
    tournament.participants[0].region = tournament.participants[1].region;
    const before = canonicalize(tournament);
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "thirdPlaceFixed", values: ["region"] },
    ]);
    expect(() => generateStage(tournament, "main")).toThrow("Fixed positions");
    expect(canonicalize(tournament)).toBe(before);
  });

  it("retains explicit source slots and rejects conflicting qualified halves", () => {
    let tournament = cup(4, "round-robin");
    tournament = simulate(tournament);
    tournament.stages[0].id = "source";
    tournament.matches.forEach((match) => {
      match.stageId = "source";
    });
    const draw = configure(cup(4));
    tournament.stages.push({
      id: "main",
      name: "Finals",
      format: "single-elimination",
      formatVersion: 1,
      order: 1,
      status: "draft",
      participantIds: [],
      sources: [
        {
          stageId: "source",
          count: 4,
          perGroup: false,
          bracketSlots: [1, 2, 3, 4],
        },
      ],
      config: { ...DEFAULT_CONFIG, thirdPlace: true, knockoutDraw: draw },
      metadata: {},
    });
    tournament.participants[0].region = tournament.participants[1].region;
    expect(previewKnockoutDraw(tournament, "main").slots).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    tournament.stages[1].sources[0].bracketSlots = [1, 3, 2, 4];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "thirdPlaceFixed", values: ["region"] },
    ]);
  });

  it.each(["grand-final", "reset"] as const)(
    "requires unique labels for %s even with BYEs and optional opening restrictions",
    (target) => {
      const tournament = cup(5, "double-elimination");
      const draw = configure(tournament, [target]);
      tournament.participants[0].region = "Shared";
      tournament.participants[1].region = "Shared";
      expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
        { code: "finalsCapacity", values: ["Shared", "2"] },
      ]);
      expect(() => generateStage(tournament, "main")).toThrow(
        "Seeding cannot prevent",
      );
      tournament.participants[1].status = "withdrawn";
      draw.protectedSeeds = 4;
      verifyDraw(tournament);
    },
  );

  it("preserves upper, lower, final, and reset rules together and completes a true reset", () => {
    let tournament = cup(8, "double-elimination");
    const draw = configure(tournament, ["grand-final", "reset"]);
    draw.restrictions = ["region"];
    draw.separation = [{ field: "region", throughRound: 2 }];
    draw.losersSeparation = [{ field: "organization", throughRound: 3 }];
    draw.finalsSeparation.push({ field: "organization", targets: ["reset"] });
    tournament = verifyDraw(tournament);
    const losses = new Map<string, number>();
    for (let index = 0; index < 20; index++) {
      const match = tournament.matches.find((item) => item.status === "ready");
      if (!match) break;
      const winner = match.bracket === "final" ? 1 : 0;
      const loser = match.slots[1 - winner].participantId!;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
      tournament = recordResult(tournament, match.id, {
        scores: winner ? [0, 1] : [1, 0],
        winnerIds: [match.slots[winner].participantId!],
        outcome: "played",
        recordedAt: tournament.updatedAt,
      });
    }
    expect(
      tournament.matches.find((match) => match.bracket === "reset")?.status,
    ).toBe("completed");
    expect(tournament.stages[0].status).toBe("completed");
    for (const participant of tournament.participants)
      expect(losses.get(participant.id)).toBe(
        participant.id === getChampion(tournament)!.id ? 1 : 2,
      );
    expect(() => generateStage(tournament, "main")).toThrow("played or live");
  });

  it("keeps an untriggered reset canceled and allows a two-entrant grand final", () => {
    let tournament = cup(2, "double-elimination");
    configure(tournament, ["grand-final", "reset"]);
    tournament = verifyDraw(tournament);
    for (let index = 0; index < 2; index++) {
      const match = tournament.matches.find((item) => item.status === "ready")!;
      tournament = recordResult(tournament, match.id, {
        scores: [1, 0],
        winnerIds: [match.slots[0].participantId!],
        outcome: "played",
        recordedAt: tournament.updatedAt,
      });
    }
    expect(
      tournament.matches.find((match) => match.bracket === "reset")?.status,
    ).toBe("canceled");
    expect(getChampion(tournament)?.id).toBe("p1");
  });

  it("distinguishes search exhaustion from impossible third-place assignments", () => {
    const ids = cup(8).stages[0].participantIds;
    const input: KnockoutPathsInput = {
      slots: Array(8).fill(null),
      participantIds: ids,
      byes: new Set(),
      keysById: new Map(ids.map((id) => [id, []])),
      preferredSlot: new Map(ids.map((id, index) => [id, index])),
      separation: [],
      losersSeparation: [],
      encounters: new Uint8Array(0),
      thirdPlaceSeparation: [{ labels: new Map(ids.map((id) => [id, id])) }],
      seed: "test-budget",
      nodeLimit: 1,
      workLimit: 100000,
    };
    expect(solveKnockoutPaths(input)).toMatchObject({
      slots: null,
      exhausted: true,
      exploredNodes: 1,
    });
    expect(
      solveKnockoutPaths({ ...input, nodeLimit: 100000, workLimit: 1 }),
    ).toMatchObject({ slots: null, exhausted: true, exploredNodes: 0 });
    input.thirdPlaceSeparation![0].labels = new Map(
      ids.map((id) => [id, "Shared"]),
    );
    expect(solveKnockoutPaths({ ...input, nodeLimit: 100000 })).toMatchObject({
      slots: null,
      exhausted: false,
    });
  });

  it("replays seeded draws and checks all selected third-place outcomes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.string({ maxLength: 20 }),
        (count, seed) => {
          const tournament = cup(count);
          configure(tournament);
          tournament.stages[0].config.seed = seed;
          tournament.stages[0].config.seeding = "random";
          tournament.participants[0].region = tournament.participants[1].region;
          verifyDraw(tournament);
          const observed = observedPairs(
            previewKnockoutDraw(tournament, "main").slots,
            false,
          );
          expect(observed["third-place"].has("p1|p2")).toBe(false);
        },
      ),
      { numRuns: 50, seed: 719830 },
    );
  });
});

describe("finals policy validation and portability", () => {
  it.each([
    { version: 5 },
    { finalsSeparation: [] },
    { finalsSeparation: undefined },
    { finalsSeparation: [{ field: "name", targets: ["third-place"] }] },
    { finalsSeparation: [{ field: "region", targets: [] }] },
    { finalsSeparation: [{ field: "region", targets: ["placement"] }] },
    {
      finalsSeparation: [
        { field: "region", targets: ["third-place"], extra: true },
      ],
    },
    { losersSeparation: undefined },
    { separation: undefined },
  ])("rejects invalid final policy %j", (fields) => {
    const tournament = cup();
    const draw = { ...configure(tournament), ...fields };
    expect(knockoutDrawSchema.safeParse(draw).success).toBe(false);
    const raw = JSON.parse(JSON.stringify(tournament));
    raw.stages[0].config.knockoutDraw = draw;
    expect(() => validateTournament(raw)).toThrow();
  });

  it("rejects duplicate fields and targets, missing labels, and unavailable targets", () => {
    const tournament = cup();
    const draw = configure(tournament);
    draw.finalsSeparation[0].targets.push("third-place");
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "duplicateFinalsSeparation", values: [] },
    ]);
    draw.finalsSeparation[0].targets.pop();
    draw.finalsSeparation.push({ field: "region", targets: ["third-place"] });
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "duplicateFinalsSeparation", values: [] },
    ]);
    draw.finalsSeparation.pop();
    delete tournament.participants[0].region;
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "missingRegion", values: [] },
    ]);
    tournament.participants[0].region = "R1";
    tournament.stages[0].config.thirdPlace = false;
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "thirdPlaceUnavailable", values: [] },
    ]);
    tournament.stages[0].config.thirdPlace = true;
    draw.finalsSeparation[0].targets = ["grand-final"];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "finalsFormat", values: [] },
    ]);
    tournament.stages[0].format = "double-elimination";
    draw.finalsSeparation[0].targets = ["reset"];
    tournament.stages[0].config.grandFinalReset = false;
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "resetUnavailable", values: [] },
    ]);
    draw.finalsSeparation[0].targets = ["third-place"];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "thirdPlaceUnavailable", values: [] },
    ]);
  });

  it("rejects a third-place target after withdrawals remove the semifinal round", () => {
    const tournament = cup(3);
    configure(tournament);
    tournament.participants[2].status = "withdrawn";
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "thirdPlaceUnavailable", values: [] },
    ]);
  });

  it("keeps versions 1, 2, and 3 byte-compatible without new fields", () => {
    const tournament = cup(8, "double-elimination");
    const base = {
      pots: [],
      restrictions: ["region"] as ("region" | "organization")[],
      protectedSeeds: 0,
    };
    const draws: KnockoutDrawConfig[] = [
      { version: 1, ...base },
      {
        version: 2,
        ...base,
        separation: [{ field: "region", throughRound: 2 }],
      },
      {
        version: 3,
        ...base,
        separation: [],
        losersSeparation: [{ field: "region", throughRound: 2 }],
      },
    ];
    for (const [index, draw] of draws.entries()) {
      tournament.stages[0].config.knockoutDraw = draw;
      const before = canonicalize(tournament);
      expect(canonicalize(validateTournament(tournament))).toBe(before);
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.slots).toEqual(seedPositions(8).map((seed) => `p${seed}`));
      expect(preview.algorithm).toBe(
        [
          KNOCKOUT_DRAW_ALGORITHM,
          KNOCKOUT_SEPARATION_ALGORITHM,
          KNOCKOUT_PATHS_ALGORITHM,
        ][index],
      );
      expect(
        "finalsSeparation" in
          validateTournament(tournament).stages[0].config.knockoutDraw!,
      ).toBe(false);
    }
  });

  it("round-trips public codes, private archives, recipes, and revision updates", async () => {
    const tournament = cup(13);
    const draw = configure(tournament);
    tournament.stages[0].config.privateNote = "Referee-only sample";
    const generated = generateStage(tournament, "main");
    expect(
      publicProjection(generated).stages[0].config.privateNote,
    ).toBeUndefined();
    const protectedArchive = await exportArchive(
      generated,
      "test-only-finals-secret",
    );
    await expect(
      importArchive(protectedArchive, "test-only-wrong-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(generated)),
      await importArchive(await exportArchive(generated)),
      await importArchive(protectedArchive, "test-only-finals-secret"),
    ]) {
      expect(restored.stages[0].config.knockoutDraw).toEqual(draw);
      expect(previewKnockoutDraw(restored, "main").slots).toEqual(
        previewKnockoutDraw(generated, "main").slots,
      );
    }
    const recipe = await decodeRecipe(await encodeRecipe(tournament));
    expect(recipe.stages[0].config.knockoutDraw).toEqual(draw);
    expect(
      previewKnockoutDraw(recipe, recipe.stages[0].id).issueDetails,
    ).toEqual([{ code: "missingRegion", values: [] }]);
    const base = await sealDocument(cup(13));
    const edited = structuredClone(base);
    configure(edited);
    edited.revision++;
    const target = await sealDocument(generateStage(edited, "main"));
    const patch = await createPatch(base, target);
    expect(await applyPatch(base, patch)).toEqual(target);
    await expect(applyPatch(target, patch)).rejects.toThrow("already applied");
    await expect(
      applyPatch(
        await sealDocument({ ...base, title: "Local edition" }),
        patch,
      ),
    ).rejects.toThrow();
    expect(
      knockoutDrawIssueText(
        { code: "thirdPlaceFixed", values: ["region"] },
        "fa",
      ),
    ).toContain("منطقه");
    expect(
      knockoutDrawIssueText(
        { code: "finalsCapacity", values: ["Shared", "2"] },
        "fa",
      ),
    ).toContain("۲");
    expect(normalizeDrawLabel(" كرج ")).toBe(normalizeDrawLabel("کرج"));
  });
});
