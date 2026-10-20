import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type FormatId,
  type KnockoutDrawConfig,
  type Tournament,
} from "../domain/types";
import { knockoutDrawSchema } from "../domain/knockout-draw";
import { validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import {
  applyPatch,
  createPatch,
  decodeCode,
  decodePatch,
  decodeRecipe,
  encodeCode,
  encodePatch,
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
  knockoutDrawIssueText,
  previewKnockoutDraw,
  recordResult,
  seedPositions,
  shuffle,
  simulate,
  validateGraph,
} from "./index";

function cup(count = 8, format: FormatId = "single-elimination"): Tournament {
  const tournament = createTournament(
    "جام حذفی دانشگاه",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      region: `Region ${index % 2}`,
      organization: `Club ${index % 2}`,
    })),
    format,
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.seed = "fixture";
  tournament.rules.tieBreakers.push("seed");
  return tournament;
}

function rules(tournament: Tournament, withPots = true): KnockoutDrawConfig {
  const ids = tournament.stages[0].participantIds;
  const half = 2 ** Math.ceil(Math.log2(ids.length)) / 2;
  return {
    version: 1,
    pots: withPots
      ? [ids.slice(0, half), ids.slice(half)].map((participantIds, index) => ({
          id: `pot-${index}`,
          name: `سید ${index + 1}`,
          participantIds,
        }))
      : [],
    restrictions: [],
    protectedSeeds: 0,
  };
}

function slots(tournament: Tournament, stageId = "main") {
  return tournament.matches
    .filter(
      (match) =>
        match.stageId === stageId &&
        match.round === 1 &&
        match.bracket === "winners",
    )
    .flatMap((match) => match.slots.map((slot) => slot.participantId ?? null));
}

function verify(tournament: Tournament): void {
  const preview = previewKnockoutDraw(tournament, "main");
  expect(preview.issues).toEqual([]);
  const size = 2 ** Math.ceil(Math.log2(preview.participantIds.length));
  expect(preview.slots).toHaveLength(size);
  expect(preview.slots.filter(Boolean).sort()).toEqual(
    [...preview.participantIds].sort(),
  );
  expect(new Set(preview.slots.filter(Boolean)).size).toBe(
    preview.participantIds.length,
  );
  expect(preview.byeIds).toEqual(
    preview.participantIds.slice(0, size - preview.participantIds.length),
  );
  const draw = tournament.stages[0].config.knockoutDraw!;
  const entrants = new Map(
    tournament.participants.map((item) => [item.id, item]),
  );
  const actualByes: string[] = [];
  for (let index = 0; index < size; index += 2) {
    const a = preview.slots[index];
    const b = preview.slots[index + 1];
    expect(a || b).toBeTruthy();
    if (!a || !b) {
      actualByes.push((a || b)!);
      continue;
    }
    for (const pot of draw.pots)
      expect(
        pot.participantIds.includes(a) && pot.participantIds.includes(b),
      ).toBe(false);
    for (const field of draw.restrictions)
      expect(entrants.get(a)![field]).not.toBe(entrants.get(b)![field]);
  }
  expect(actualByes.sort()).toEqual([...preview.byeIds].sort());
  for (const fixed of preview.fixedSlots)
    expect(preview.slots[fixed.slot - 1]).toBe(fixed.participantId);
  expect(slots(generateStage(tournament, "main"))).toEqual(preview.slots);
}

function withSource(
  count: number,
  bracketSlots: number[],
  format: FormatId = "single-elimination",
): Tournament {
  const tournament = simulate(cup(count, "round-robin"));
  tournament.stages[0].id = "source";
  for (const match of tournament.matches) match.stageId = "source";
  tournament.stages.push({
    id: "main",
    name: "Playoffs",
    format,
    formatVersion: 1,
    order: 1,
    status: "draft",
    participantIds: [],
    config: {
      ...DEFAULT_CONFIG,
      knockoutDraw: {
        version: 1,
        pots: [],
        restrictions: [],
        protectedSeeds: 0,
      },
    },
    sources: [
      {
        stageId: "source",
        count,
        perGroup: false,
        bracketSlots,
      },
    ],
    metadata: {},
  });
  return tournament;
}

describe("knockout draws", () => {
  it.each([3, 5, 7, 8, 13, 17, 31, 127, 256, 512])(
    "pairs %i entrants with exact BYEs and pot separation",
    (count) => {
      const tournament = cup(count);
      tournament.stages[0].config.knockoutDraw = rules(tournament);
      verify(tournament);
      expect(
        previewKnockoutDraw(tournament, "main").exploredNodes,
      ).toBeLessThanOrEqual(count);
    },
  );

  it("preserves replayability, pot integrity, and protected seeds for arbitrary sizes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 64 }),
        fc.string({ maxLength: 25 }),
        (count, seed) => {
          const tournament = cup(count);
          const draw = rules(tournament);
          draw.protectedSeeds = Math.ceil(count / 2);
          tournament.stages[0].config.knockoutDraw = draw;
          tournament.stages[0].config.seed = seed;
          const before = canonicalize(tournament);
          verify(tournament);
          expect(previewKnockoutDraw(tournament, "main")).toEqual(
            previewKnockoutDraw(tournament, "main"),
          );
          expect(canonicalize(tournament)).toBe(before);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("combines pots with normalized region and organization separation", () => {
    const tournament = cup(16);
    tournament.participants[0].region = "  كرج ";
    tournament.participants[1].region = "کرج";
    const draw = rules(tournament);
    draw.restrictions = ["region", "organization"];
    draw.protectedSeeds = 4;
    tournament.stages[0].config.knockoutDraw = draw;
    verify(tournament);
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.slots.indexOf("p1") >> 1).not.toBe(
      preview.slots.indexOf("p2") >> 1,
    );
    expect(
      generateStage(tournament, "main").stages[0].metadata.drawAlgorithm,
    ).toBe(KNOCKOUT_DRAW_ALGORITHM);
  });

  it("keeps standard layouts and absent-field serialization unchanged", () => {
    for (const count of [3, 8, 13, 127]) {
      const tournament = cup(count);
      const old = canonicalize(tournament);
      expect(canonicalize(validateTournament(tournament))).toBe(old);
      expect(
        Object.hasOwn(
          validateTournament(tournament).stages[0].config,
          "knockoutDraw",
        ),
      ).toBe(false);
      const standard = slots(generateStage(tournament, "main"));
      expect(previewKnockoutDraw(tournament, "main").slots).toEqual(standard);
      tournament.stages[0].config.knockoutDraw = rules(tournament, false);
      expect(previewKnockoutDraw(tournament, "main").slots).toEqual(standard);
    }
  });

  it.each(["ranked", "snake", "random", "manual"] as const)(
    "assigns BYEs and protected seeds in %s draw order",
    (seeding) => {
      const tournament = cup(13);
      const stage = tournament.stages[0];
      stage.participantIds.reverse();
      stage.config.seeding = seeding;
      stage.config.knockoutDraw = {
        ...rules(tournament, false),
        protectedSeeds: 4,
      };
      const preview = previewKnockoutDraw(tournament, "main");
      const order =
        seeding === "random"
          ? shuffle(stage.participantIds, stage.config.seed)
          : seeding === "manual"
            ? stage.participantIds
            : tournament.participants.map((item) => item.id);
      expect(preview.participantIds).toEqual(order);
      expect(preview.byeIds).toEqual(order.slice(0, 3));
      for (let index = 0; index < 4; index++)
        expect(preview.slots[seedPositions(16).indexOf(index + 1)]).toBe(
          order[index],
        );
      expect(
        generateStage(tournament, "main").stages[0].metadata.drawOrder,
      ).toEqual(order);
    },
  );

  it("keeps tied seed ordering and metadata independent of locale comparisons", () => {
    const tournament = cup(3);
    tournament.participants.forEach((participant, index) => {
      participant.seed = 1;
      participant.id = ["é", "Z", "a"][index];
    });
    tournament.stages[0].participantIds = tournament.participants.map(
      (item) => item.id,
    );
    tournament.stages[0].config.knockoutDraw = rules(tournament, false);
    expect(previewKnockoutDraw(tournament, "main").participantIds).toEqual([
      "Z",
      "a",
      "é",
    ]);
    expect(
      generateStage(tournament, "main").stages[0].metadata.drawOrder,
    ).toEqual(["Z", "a", "é"]);
  });

  it("honors source slots while moving BYEs to their fixed recipients", () => {
    const tournament = withSource(5, [8, 2, 4, 5, 6]);
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(true);
    expect(preview.slots).toEqual([
      null,
      "p2",
      null,
      "p3",
      "p4",
      "p5",
      null,
      "p1",
    ]);
    expect(slots(generateStage(tournament, "main"))).toEqual(preview.slots);
    expect(preview.fixedSlots).toHaveLength(5);
    tournament.stages[0].status = "active";
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "source",
    );
  });

  it("blocks source conflicts without moving BYEs or protected entrants", () => {
    const tournament = withSource(5, [1, 2, 3, 5, 6]);
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "byeConflict",
    );
    expect(() => generateStage(tournament, "main")).toThrow("BYE recipient");
    tournament.stages[1].sources[0].bracketSlots = [8, 2, 4, 5, 6];
    tournament.stages[1].config.knockoutDraw!.protectedSeeds = 1;
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "protectedConflict",
    );
  });

  it("blocks incompatible fixed pairings and preserves all existing input", () => {
    const tournament = withSource(4, [1, 3, 2, 4]);
    tournament.stages[1].config.knockoutDraw!.restrictions = ["region"];
    const before = canonicalize(tournament);
    expect(previewKnockoutDraw(tournament, "main").issueDetails[0].code).toBe(
      "fixedConflict",
    );
    expect(() => generateStage(tournament, "main")).toThrow(
      "Fixed first-round",
    );
    expect(canonicalize(tournament)).toBe(before);
  });

  it("reports insufficient opponent capacity under the exact BYE policy", () => {
    const tournament = cup(5);
    tournament.stages[0].config.knockoutDraw = rules(tournament, false);
    tournament.stages[0].config.knockoutDraw!.restrictions = ["region"];
    tournament.participants[3].region = tournament.participants[4].region;
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.byeIds).toEqual(["p1", "p2", "p3"]);
    expect(preview.issueDetails[0].code).toBe("capacity");
    expect(preview.slots).toEqual([]);
  });

  it("detects jointly infeasible rules that pass individual capacity checks", () => {
    const tournament = cup(4);
    const draw = rules(tournament, false);
    draw.restrictions = ["region", "organization"];
    draw.pots = [
      { id: "a", name: "A", participantIds: ["p1", "p4"] },
      { id: "b", name: "B", participantIds: ["p2", "p3"] },
    ];
    tournament.participants.forEach((participant, index) => {
      participant.region = String(index < 2);
      participant.organization = String(index % 2);
    });
    tournament.stages[0].config.knockoutDraw = draw;
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toEqual(["infeasible"]);
  });

  it("distinguishes bounded search from proof of infeasibility", () => {
    const tournament = cup(47);
    const draw = rules(tournament, false);
    draw.restrictions = ["region", "organization"];
    draw.pots = Array.from({ length: 3 }, (_, index) => ({
      id: `pot-${index}`,
      name: `Pot ${index}`,
      participantIds: [],
    }));
    tournament.participants.forEach((participant, index) => {
      if (index < 17) {
        participant.region = `BYE-${index}`;
        participant.organization = `BYE-${index}`;
        draw.pots.push({
          id: `bye-${index}`,
          name: `BYE ${index}`,
          participantIds: [participant.id],
        });
        return;
      }
      const group = Math.floor((index - 17) / 5);
      const label = group % 3;
      const component = Math.floor(group / 3);
      draw.pots[label].participantIds.push(participant.id);
      participant.region = `Region ${(label + component) % 3}`;
      participant.organization = `Club ${(label + component * 2) % 3}`;
    });
    tournament.stages[0].config.knockoutDraw = draw;
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.issueDetails.map((issue) => issue.code)).toEqual([
      "exhausted",
    ]);
    expect(preview.slots).toEqual([]);
    expect(preview.issues[0]).toContain("Feasibility is unknown");
  });

  it.each([3, 5, 8, 13, 17])(
    "completes constrained double elimination with %i entrants and a reset",
    (count) => {
      let tournament = cup(count, "double-elimination");
      tournament.stages[0].config.knockoutDraw = rules(tournament);
      tournament = generateStage(tournament, "main");
      const losses = new Map<string, number>();
      for (let iteration = 0; iteration < count * 3; iteration++) {
        const match = tournament.matches.find(
          (item) => item.status === "ready",
        );
        if (!match) break;
        const winnerIndex = match.bracket === "final" ? 1 : 0;
        const loser = match.slots[1 - winnerIndex].participantId!;
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        tournament = recordResult(tournament, match.id, {
          scores: winnerIndex ? [0, 1] : [1, 0],
          winnerIds: [match.slots[winnerIndex].participantId!],
          outcome: "played",
          recordedAt: tournament.updatedAt,
        });
      }
      expect(tournament.stages[0].status).toBe("completed");
      const champion = getChampion(tournament)!;
      expect(champion).toBeDefined();
      expect(
        tournament.matches.find((match) => match.bracket === "reset")?.status,
      ).toBe("completed");
      for (const participant of tournament.participants)
        expect(losses.get(participant.id) ?? 0).toBe(
          participant.id === champion.id ? 1 : 2,
        );
    },
  );
});

describe("knockout draw validation and sharing", () => {
  it.each([
    { version: 2, pots: [], restrictions: [], protectedSeeds: 0 },
    { version: 1, pots: [], restrictions: ["name"], protectedSeeds: 0 },
    { version: 1, pots: [], restrictions: [], protectedSeeds: -1 },
    { version: 1, pots: [], restrictions: [], protectedSeeds: 0.5 },
    { version: 1, pots: [], restrictions: [], protectedSeeds: 513 },
    {
      version: 1,
      pots: [],
      restrictions: [],
      protectedSeeds: 0,
      private: "extra",
    },
  ])("rejects malformed rules %j", (draw) => {
    expect(knockoutDrawSchema.safeParse(draw).success).toBe(false);
    const tournament = JSON.parse(JSON.stringify(cup()));
    tournament.stages[0].config.knockoutDraw = draw;
    expect(() => validateTournament(tournament)).toThrow();
    expect(previewKnockoutDraw(tournament, "main").ready).toBe(false);
  });

  it("rejects duplicates, unknown entrants, and wrong formats", () => {
    const tournament = cup();
    const draw = rules(tournament);
    draw.pots[1].id = draw.pots[0].id;
    draw.pots[1].participantIds = ["p1", "unknown"];
    draw.restrictions = ["region", "region"];
    tournament.stages[0].config.knockoutDraw = draw;
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toEqual([
      "duplicatePot",
      "duplicateEntrant",
      "unknownEntrant",
      "duplicateRestriction",
    ]);
    expect(validateGraph(tournament)).toHaveLength(4);
    expect(() => validateTournament(tournament)).toThrow();
    tournament.stages[0].config.knockoutDraw = rules(tournament);
    tournament.stages[0].format = "groups";
    expect(() => validateTournament(tournament)).toThrow(
      "single or double elimination",
    );
  });

  it("retains incomplete drafts but blocks generation and missing restriction labels", () => {
    const tournament = cup();
    const draw = rules(tournament);
    draw.pots[0].participantIds.pop();
    draw.restrictions = ["region", "organization"];
    tournament.participants[0].region = "";
    tournament.participants[1].organization = " ";
    draw.protectedSeeds = 9;
    tournament.stages[0].config.knockoutDraw = draw;
    expect(() => validateTournament(tournament)).not.toThrow();
    expect(
      previewKnockoutDraw(tournament, "main").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toEqual([
      "incompletePots",
      "protectedCount",
      "missingRegion",
      "missingOrganization",
    ]);
    expect(() => generateStage(tournament, "main")).toThrow();
    tournament.participants[7].status = "withdrawn";
    expect(
      previewKnockoutDraw(tournament, "main").participantIds,
    ).not.toContain("p8");
  });

  it("localizes constraints and numeric arguments in Persian", () => {
    expect(
      knockoutDrawIssueText(
        { code: "capacity", values: ["تهران", "7", "4"] },
        "fa",
      ),
    ).toContain("۷");
    expect(
      knockoutDrawIssueText({ code: "protectedConflict", values: ["1"] }, "fa"),
    ).toContain("محافظت");
  });

  it("preserves public and encrypted draws while excluding unrelated private data", async () => {
    const tournament = cup(13);
    tournament.stages[0].config.knockoutDraw = rules(tournament);
    tournament.stages[0].config.privateNote = "private referee detail";
    tournament.participants[0].metadata.secret = "private participant detail";
    const generated = generateStage(tournament, "main");
    const projection = publicProjection(generated);
    expect(projection.stages[0].config.knockoutDraw).toEqual(
      generated.stages[0].config.knockoutDraw,
    );
    expect(projection.stages[0].config.privateNote).toBeUndefined();
    expect(projection.participants[0].metadata.secret).toBeUndefined();
    const archive = await exportArchive(generated, "test-only-knockout-secret");
    await expect(
      importArchive(archive, "test-only-wrong-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(generated)),
      await importArchive(archive, "test-only-knockout-secret"),
    ]) {
      expect(restored.stages[0].config.knockoutDraw).toEqual(
        generated.stages[0].config.knockoutDraw,
      );
      expect(slots(restored)).toEqual(slots(generated));
      expect(previewKnockoutDraw(restored, "main").slots).toEqual(
        slots(generated),
      );
    }
  });

  it("remaps recipe pots and requires recipients to fill restricted labels", async () => {
    const tournament = cup(8);
    tournament.stages[0].config.knockoutDraw = rules(tournament);
    const recipe = await decodeRecipe(await encodeRecipe(tournament));
    expect(
      recipe.stages[0].config.knockoutDraw!.pots.flatMap(
        (pot) => pot.participantIds,
      ),
    ).toEqual(recipe.participants.map((participant) => participant.id));
    expect(previewKnockoutDraw(recipe, recipe.stages[0].id).ready).toBe(true);
    tournament.stages[0].config.knockoutDraw!.restrictions = ["region"];
    const restricted = await decodeRecipe(await encodeRecipe(tournament));
    expect(
      previewKnockoutDraw(restricted, restricted.stages[0].id).issueDetails[0]
        .code,
    ).toBe("missingRegion");
  });

  it("applies draw rules and slots through versioned patches with conflict checks", async () => {
    const base = await sealDocument(cup(8));
    const edited = structuredClone(base);
    edited.stages[0].config.knockoutDraw = rules(edited);
    edited.revision++;
    const target = await sealDocument(generateStage(edited, "main"));
    const packet = await decodePatch(
      await encodePatch(await createPatch(base, target)),
    );
    const restored = await applyPatch(base, packet);
    expect(restored).toEqual(target);
    await expect(applyPatch(restored, packet)).rejects.toThrow(
      "already applied",
    );
    const divergent = structuredClone(base);
    divergent.title = "Local change";
    await expect(applyPatch(divergent, packet)).rejects.toThrow("diverged");
  });

  it("keeps played-draw locks and exact first-round contestants after completion", () => {
    const tournament = cup(13);
    tournament.stages[0].config.knockoutDraw = rules(tournament);
    const completed = simulate(tournament);
    expect(getChampion(completed)?.id).toBe("p1");
    expect(() => generateStage(completed, "main")).toThrow("played or live");
    expect(slots(completed)).toEqual(
      previewKnockoutDraw(tournament, "main").slots,
    );
  });
});
