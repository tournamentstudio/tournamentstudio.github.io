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
import { normalizeDrawLabel } from "../domain/draw";
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
  KNOCKOUT_DRAW_NODE_LIMIT,
  KNOCKOUT_DRAW_WORK_LIMIT,
  KNOCKOUT_SEPARATION_ALGORITHM,
  knockoutDrawIssueText,
  previewKnockoutDraw,
  recordResult,
  seedPositions,
  simulate,
} from "./index";
import { solveKnockoutSeparation } from "./knockout-separation";

function cup(count = 8, format: FormatId = "single-elimination"): Tournament {
  const tournament = createTournament(
    "جام منطقه‌ای دانشگاه",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    format,
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.seed = "separation-fixture";
  tournament.rules.tieBreakers.push("seed");
  return tournament;
}

function configure(tournament: Tournament, protectedSeeds = 0) {
  const stage = tournament.stages[0];
  const size = 2 ** Math.ceil(Math.log2(stage.participantIds.length));
  const positions = seedPositions(size);
  const regionRound = Math.min(2, Math.log2(size));
  const organizationRound = Math.min(3, Math.log2(size));
  tournament.participants.forEach((participant, index) => {
    const slot = positions.indexOf(index + 1);
    participant.region = `منطقه ${slot % 2 ** regionRound}`;
    participant.organization = `Club ${slot % 2 ** organizationRound}`;
  });
  const draw: KnockoutDrawConfig = {
    version: 2,
    pots: [
      stage.participantIds.slice(0, size / 2),
      stage.participantIds.slice(size / 2),
    ]
      .filter((ids) => ids.length)
      .map((participantIds, index) => ({
        id: `pot-${index}`,
        name: `سید ${index + 1}`,
        participantIds,
      })),
    restrictions: ["region", "organization"],
    protectedSeeds,
    separation: [
      { field: "region", throughRound: regionRound },
      { field: "organization", throughRound: organizationRound },
    ],
  };
  stage.config.knockoutDraw = draw;
  return draw;
}

function verifyPaths(tournament: Tournament, stageId = "main"): void {
  const stage = tournament.stages.find((item) => item.id === stageId)!;
  const draw = stage.config.knockoutDraw!;
  if (draw.version !== 2) throw new Error("V2 fixture required");
  const preview = previewKnockoutDraw(tournament, stageId);
  expect(preview.issues).toEqual([]);
  const generated = generateStage(tournament, stageId);
  expect(
    generated.stages.find((item) => item.id === stageId)!.metadata
      .drawAlgorithm,
  ).toBe(KNOCKOUT_SEPARATION_ALGORITHM);
  const matches = generated.matches.filter(
    (match) => match.stageId === stageId,
  );
  const byId = new Map(matches.map((match) => [match.id, match]));
  const entrants = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  );
  const reachable = (matchId: string): string[] =>
    byId
      .get(matchId)!
      .slots.flatMap((slot) =>
        slot.source?.result === "winner"
          ? reachable(slot.source.matchId)
          : slot.participantId
            ? [slot.participantId]
            : [],
      );
  for (const rule of draw.separation)
    for (const match of matches)
      if (match.bracket === "winners" && match.round <= rule.throughRound) {
        const possible = reachable(match.id).map((id) =>
          normalizeDrawLabel(entrants.get(id)![rule.field]!),
        );
        expect(new Set(possible).size).toBe(possible.length);
      }
  expect(
    matches
      .filter((match) => match.bracket === "winners" && match.round === 1)
      .flatMap((match) =>
        match.slots.map((slot) => slot.participantId ?? null),
      ),
  ).toEqual(preview.slots);
  const actualByes: string[] = [];
  for (let index = 0; index < preview.slots.length; index += 2) {
    const pair = preview.slots.slice(index, index + 2);
    expect(pair.some(Boolean)).toBe(true);
    if (pair.includes(null)) actualByes.push(pair.find((id) => id !== null)!);
    else
      for (const pot of draw.pots)
        expect(pair.every((id) => pot.participantIds.includes(id!))).toBe(
          false,
        );
  }
  expect(actualByes.sort()).toEqual([...preview.byeIds].sort());
  expect(preview.slots.filter(Boolean).sort()).toEqual(
    [...preview.participantIds].sort(),
  );
  for (const fixed of preview.fixedSlots)
    expect(preview.slots[fixed.slot - 1]).toBe(fixed.participantId);
}

/** A small independent slot-permutation oracle, without domain pruning. */
function hasValidPermutation(tournament: Tournament): boolean {
  const stage = tournament.stages[0];
  const draw = stage.config.knockoutDraw!;
  if (draw.version !== 2) throw new Error("V2 fixture required");
  const count = stage.participantIds.length;
  const size = 2 ** Math.ceil(Math.log2(count));
  const byeCount = size - count;
  const positions = seedPositions(size);
  const slots = Array<number>(size).fill(-1);
  const entrants = stage.participantIds.map((id) =>
    tournament.participants.find((participant) => participant.id === id)!,
  );
  const labels = entrants.map((participant) => ({
    region: normalizeDrawLabel(participant.region ?? ""),
    organization: normalizeDrawLabel(participant.organization ?? ""),
  }));
  const pots = entrants.map((participant) =>
    draw.pots.findIndex((pot) => pot.participantIds.includes(participant.id)),
  );
  const search = (entrant: number): boolean => {
    if (entrant === count)
      return slots.every((value, slot) => value !== -1 || slots[slot ^ 1] >= 0);
    const candidates =
      entrant < draw.protectedSeeds
        ? [positions.indexOf(entrant + 1)]
        : Array.from({ length: size }, (_, slot) => slot);
    for (const slot of candidates) {
      if (slots[slot] !== -1) continue;
      const opponent = slots[slot ^ 1];
      if (entrant < byeCount && opponent !== -1) continue;
      if (opponent === -2) continue;
      if (
        opponent >= 0 &&
        ((pots[entrant] >= 0 && pots[entrant] === pots[opponent]) ||
          draw.restrictions.some(
            (field) => labels[entrant][field] === labels[opponent][field],
          ))
      )
        continue;
      if (
        draw.separation.some((rule) => {
          const width = 2 ** rule.throughRound;
          const start = Math.floor(slot / width) * width;
          return slots
            .slice(start, start + width)
            .some(
              (other) =>
                other >= 0 &&
                labels[entrant][rule.field] === labels[other][rule.field],
            );
        })
      )
        continue;
      slots[slot] = entrant;
      if (entrant < byeCount) slots[slot ^ 1] = -2;
      if (search(entrant + 1)) return true;
      slots[slot] = -1;
      if (entrant < byeCount) slots[slot ^ 1] = -1;
    }
    return false;
  };
  return search(0);
}

describe("later-round knockout separation", () => {
  it.each([3, 5, 7, 8, 13, 17, 31, 64, 127, 128, 256, 512])(
    "protects all possible winners paths and exact BYEs for %i entrants",
    (count) => {
      const tournament = cup(count);
      configure(tournament, Math.min(4, count));
      verifyPaths(tournament);
    },
  );

  it("replays seeded constrained assignments without mutating the input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 64 }),
        fc.string({ maxLength: 30 }),
        (count, seed) => {
          const tournament = cup(count);
          configure(tournament, Math.min(4, count));
          tournament.stages[0].config.seed = seed;
          const before = canonicalize(tournament);
          verifyPaths(tournament);
          expect(previewKnockoutDraw(tournament, "main")).toEqual(
            previewKnockoutDraw(tournament, "main"),
          );
          expect(canonicalize(tournament)).toBe(before);
        },
      ),
      { numRuns: 75 },
    );
  });

  it("agrees with independent exhaustive placement for small mixed constraints", () => {
    let feasible = 0;
    let infeasible = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.array(fc.integer({ min: 0, max: 7 }), {
          minLength: 8,
          maxLength: 8,
        }),
        fc.integer({ min: 0, max: 8 }),
        (count, choices, protectedCount) => {
          const tournament = cup(count);
          const draw = configure(tournament, Math.min(protectedCount, count));
          draw.pots = choices[0] % 2 ? draw.pots : [];
          draw.separation.forEach((rule) => {
            rule.throughRound = 2;
          });
          tournament.participants.forEach((participant, index) => {
            participant.region = `Region ${choices[index]}`;
            participant.organization = `Club ${(index + choices[(index + 1) % 8]) % 6}`;
          });
          const expected = hasValidPermutation(tournament);
          if (expected) feasible++;
          else infeasible++;
          const preview = previewKnockoutDraw(tournament, "main");
          expect(
            preview.issueDetails.some((issue) => issue.code === "exhausted"),
          ).toBe(false);
          expect(preview.ready).toBe(expected);
        },
      ),
      { numRuns: 150, seed: 142769 },
    );
    expect(feasible).toBeGreaterThan(0);
    expect(infeasible).toBeGreaterThan(0);
  });

  it("backtracks pairing and subtree placement together when an early choice blocks the draw", () => {
    const tournament = cup(7);
    tournament.participants.forEach((participant, index) => {
      participant.id = `p${index}`;
      participant.region = ["R0", "R0", "R1", "R1", "R3", "R2", "R2"][index];
      participant.organization = ["C0", "C0", "C1", "C1", "C2", "C2", "C3"][
        index
      ];
    });
    const stage = tournament.stages[0];
    stage.participantIds = tournament.participants.map(
      (participant) => participant.id,
    );
    stage.config.seed = "tournastudio";
    stage.config.knockoutDraw = {
      version: 2,
      pots: [
        { id: "a", name: "A", participantIds: ["p0", "p2", "p4", "p6"] },
        { id: "b", name: "B", participantIds: ["p1", "p3", "p5"] },
      ],
      restrictions: ["region", "organization"],
      protectedSeeds: 2,
      separation: [
        { field: "region", throughRound: 2 },
        { field: "organization", throughRound: 2 },
      ],
    };
    const preview = previewKnockoutDraw(tournament, "main");
    expect(hasValidPermutation(tournament)).toBe(true);
    expect(preview.ready).toBe(true);
    expect(preview.exploredNodes).toBeGreaterThan(5);
    expect(preview.slots).toEqual([
      "p0",
      null,
      "p2",
      "p5",
      "p1",
      "p6",
      "p3",
      "p4",
    ]);
    verifyPaths(tournament);
  });

  it("proves joint infeasibility when individually valid labels and pins cannot combine", () => {
    const tournament = cup(6);
    tournament.participants.forEach((participant, index) => {
      participant.id = `p${index}`;
      participant.region = ["R0", "R1", "R2", "R0", "R1", "R2"][index];
      participant.organization = ["C0", "C0", "C1", "C1", "C2", "C2"][index];
    });
    const stage = tournament.stages[0];
    stage.participantIds = tournament.participants.map(
      (participant) => participant.id,
    );
    stage.config.seed = "tournastudio";
    stage.config.knockoutDraw = {
      version: 2,
      pots: [
        { id: "a", name: "A", participantIds: ["p0", "p2", "p4"] },
        { id: "b", name: "B", participantIds: ["p1", "p3", "p5"] },
      ],
      restrictions: ["region", "organization"],
      protectedSeeds: 3,
      separation: [
        { field: "region", throughRound: 2 },
        { field: "organization", throughRound: 2 },
      ],
    };
    expect(hasValidPermutation(tournament)).toBe(false);
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "separationInfeasible", values: [] },
    ]);
    expect(previewKnockoutDraw(tournament, "main").slots).toEqual([]);
  });

  it("counts same-region BYE recipients when checking protected block capacity", () => {
    const tournament = cup(5);
    configure(tournament);
    for (const participant of tournament.participants.slice(0, 3))
      participant.region = "  كرج ";
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.byeIds).toEqual(["p1", "p2", "p3"]);
    expect(preview.issueDetails).toContainEqual({
      code: "separationCapacity",
      values: ["كرج", "3", "2", "2"],
    });
    expect(preview.slots).toEqual([]);
    expect(() => generateStage(tournament, "main")).toThrow(
      "including BYE recipients",
    );
  });

  it("normalizes Persian labels and allows a shared region to meet after protection ends", () => {
    let tournament = cup(8);
    const draw = configure(tournament);
    draw.separation = [{ field: "region", throughRound: 2 }];
    draw.restrictions = ["region"];
    draw.pots = [];
    tournament.participants.forEach((participant, index) => {
      participant.region =
        index < 2 ? [" كرج ", "کرج"][index] : `Region ${index}`;
    });
    verifyPaths(tournament);
    tournament = generateStage(tournament, "main");
    while (tournament.stages[0].status !== "completed") {
      const match = tournament.matches.find((item) => item.status === "ready")!;
      const index = match.slots.findIndex((slot) =>
        ["p1", "p2"].includes(slot.participantId!),
      );
      const winner = index < 0 ? 0 : index;
      tournament = recordResult(tournament, match.id, {
        scores: winner ? [0, 1] : [1, 0],
        winnerIds: [match.slots[winner].participantId!],
        outcome: "played",
        recordedAt: tournament.updatedAt,
      });
    }
    const final = tournament.matches.find(
      (match) => match.metadata.championship,
    )!;
    expect(final.slots.map((slot) => slot.participantId).sort()).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("rejects a protection round beyond the actual bracket after withdrawals", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.separation = [{ field: "organization", throughRound: 3 }];
    draw.pots = [];
    tournament.participants.slice(3).forEach((participant) => {
      participant.status = "withdrawn";
    });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.issueDetails).toContainEqual({
      code: "separationRound",
      values: ["3", "2"],
    });
  });

  it("preserves source slots and diagnoses same-region pins within a protected block", () => {
    const tournament = simulate(cup(8, "round-robin"));
    tournament.stages[0].id = "source";
    tournament.matches.forEach((match) => {
      match.stageId = "source";
    });
    tournament.participants.forEach((participant, index) => {
      participant.region = `Region ${index % 4}`;
    });
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
          count: 8,
          perGroup: false,
          bracketSlots: [1, 2, 3, 4, 5, 6, 7, 8],
        },
      ],
      config: {
        ...DEFAULT_CONFIG,
        knockoutDraw: {
          version: 2,
          pots: [],
          restrictions: ["region"],
          protectedSeeds: 0,
          separation: [{ field: "region", throughRound: 2 }],
        },
      },
      metadata: {},
    });
    verifyPaths(tournament);
    tournament.stages[1].sources[0].bracketSlots = [1, 2, 5, 4, 3, 6, 7, 8];
    const before = canonicalize(tournament);
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "separationFixed", values: ["region", "2"] },
    ]);
    expect(() => generateStage(tournament, "main")).toThrow("Fixed positions");
    expect(canonicalize(tournament)).toBe(before);
  });

  it("does not move protected seeds to satisfy a conflicting later-round rule", () => {
    const tournament = cup(8);
    const draw = configure(tournament, 8);
    draw.pots = [];
    draw.restrictions = ["region"];
    draw.separation = [{ field: "region", throughRound: 2 }];
    tournament.participants.forEach((participant, index) => {
      participant.region = [0, 1, 2, 0, 3, 4, 5, 6][index].toString();
    });
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "separationFixed", values: ["region", "2"] },
    ]);
  });

  it.each([3, 5, 8, 13, 17])(
    "preserves real double elimination and reset results with %i entrants",
    (count) => {
      let tournament = cup(count, "double-elimination");
      configure(tournament);
      verifyPaths(tournament);
      tournament = generateStage(tournament, "main");
      const losses = new Map<string, number>();
      for (let iteration = 0; iteration < count * 3; iteration++) {
        const match = tournament.matches.find(
          (item) => item.status === "ready",
        );
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
      expect(tournament.stages[0].status).toBe("completed");
      const champion = getChampion(tournament)!;
      expect(
        tournament.matches.find((match) => match.bracket === "reset")?.status,
      ).toBe("completed");
      for (const participant of tournament.participants)
        expect(losses.get(participant.id) ?? 0).toBe(
          participant.id === champion.id ? 1 : 2,
        );
    },
  );

  it("reports search budget exhaustion separately from infeasibility", () => {
    const result = solveKnockoutSeparation({
      slots: Array.from({ length: 8 }, () => null),
      participantIds: ["a", "b", "c", "d", "e", "f", "g", "h"],
      byes: new Set(),
      keysById: new Map("abcdefgh".split("").map((id) => [id, []])),
      preferredSlot: new Map(
        "abcdefgh".split("").map((id, index) => [id, index]),
      ),
      separation: [
        {
          field: "region",
          throughRound: 2,
          labels: new Map(
            "abcdefgh".split("").map((id, index) => [id, String(index % 4)]),
          ),
        },
      ],
      seed: "budget",
      nodeLimit: 1,
      workLimit: 100000,
    });
    expect(result).toEqual({ slots: null, exploredNodes: 1, exhausted: true });
  });

  it("stops an adversarial 512-slot search at the production work budget", () => {
    const ids = Array.from({ length: 512 }, (_, index) => `p${index}`);
    const keysById = new Map<string, string[]>();
    const labels = new Map<string, string>();
    ids.forEach((id, index) => {
      if (index < 482) {
        keysById.set(id, [
          `pot:P${index}`,
          `region:R${index}`,
          `organization:O${index}`,
        ]);
        labels.set(id, `R${index}`);
      } else {
        const group = Math.floor((index - 482) / 5);
        const label = group % 3;
        const component = Math.floor(group / 3);
        const region = `freeR${(label + component) % 3}`;
        keysById.set(id, [
          `pot:freeP${label}`,
          `region:${region}`,
          `organization:freeO${(label + component * 2) % 3}`,
        ]);
        labels.set(id, region);
      }
    });
    const result = solveKnockoutSeparation({
      slots: ids.map((id, index) => (index < 482 ? id : null)),
      participantIds: ids,
      byes: new Set(),
      keysById,
      preferredSlot: new Map(ids.map((id, index) => [id, index])),
      separation: [{ field: "region", throughRound: 2, labels }],
      seed: "adversarial-review",
      nodeLimit: KNOCKOUT_DRAW_NODE_LIMIT,
      workLimit: KNOCKOUT_DRAW_WORK_LIMIT,
    });
    expect(result.slots).toBeNull();
    expect(result.exhausted).toBe(true);
    expect(result.exploredNodes).toBeGreaterThan(1);
    expect(result.exploredNodes).toBeLessThanOrEqual(KNOCKOUT_DRAW_NODE_LIMIT);
  });
});

describe("later-round draw validation and portability", () => {
  it.each([
    { version: 4, separation: [{ field: "region", throughRound: 2 }] },
    { version: 2, separation: [] },
    { version: 2, separation: [{ field: "region", throughRound: 1 }] },
    { version: 2, separation: [{ field: "region", throughRound: 10 }] },
    { version: 2, separation: [{ field: "region", throughRound: 2.5 }] },
    { version: 2, separation: [{ field: "name", throughRound: 2 }] },
    {
      version: 2,
      separation: [{ field: "region", throughRound: 2, extra: true }],
    },
    { version: 1, separation: [{ field: "region", throughRound: 2 }] },
  ])("rejects unsupported versions and malformed separation %j", (fields) => {
    const tournament = cup(8);
    const invalid = {
      pots: [],
      restrictions: ["region"],
      protectedSeeds: 0,
      ...fields,
    };
    expect(knockoutDrawSchema.safeParse(invalid).success).toBe(false);
    const raw = JSON.parse(JSON.stringify(tournament));
    raw.stages[0].config.knockoutDraw = invalid;
    expect(() => validateTournament(raw)).toThrow();
  });

  it("rejects duplicate fields and separation without its first-round restriction", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.separation = [
      { field: "region", throughRound: 2 },
      { field: "region", throughRound: 3 },
    ];
    draw.restrictions = [];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "duplicateSeparation", values: [] },
      { code: "separationField", values: [] },
    ]);
    expect(() => validateTournament(tournament)).toThrow();
  });

  it("preserves public, encrypted, file, and update-packet rules and placements", async () => {
    const tournament = cup(13);
    configure(tournament);
    tournament.stages[0].config.privateNote = "Referee-only sample";
    const generated = generateStage(tournament, "main");
    expect(
      publicProjection(generated).stages[0].config.privateNote,
    ).toBeUndefined();
    const archive = await exportArchive(
      generated,
      "test-only-separation-secret",
    );
    await expect(
      importArchive(archive, "test-only-other-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(generated)),
      await importArchive(await exportArchive(generated)),
      await importArchive(archive, "test-only-separation-secret"),
    ]) {
      expect(restored.stages[0].config.knockoutDraw).toEqual(
        generated.stages[0].config.knockoutDraw,
      );
      expect(previewKnockoutDraw(restored, "main").slots).toEqual(
        previewKnockoutDraw(generated, "main").slots,
      );
    }
    const base = await sealDocument(cup(13));
    const edited = structuredClone(base);
    configure(edited);
    edited.revision++;
    const target = await sealDocument(generateStage(edited, "main"));
    const patch = await decodePatch(
      await encodePatch(await createPatch(base, target)),
    );
    expect(await applyPatch(base, patch)).toEqual(target);
    await expect(applyPatch(target, patch)).rejects.toThrow("already applied");
  });

  it("keeps recipe protection while remapping pots and requiring new labels", async () => {
    const tournament = cup(16);
    const draw = configure(tournament);
    const restored = await decodeRecipe(await encodeRecipe(tournament));
    const imported = restored.stages[0].config.knockoutDraw!;
    expect(imported.version).toBe(2);
    if (imported.version === 2)
      expect(imported.separation).toEqual(draw.separation);
    expect(imported.pots.flatMap((pot) => pot.participantIds)).toEqual(
      restored.participants.map((participant) => participant.id),
    );
    expect(
      previewKnockoutDraw(restored, restored.stages[0].id).issueDetails.map(
        (issue) => issue.code,
      ),
    ).toEqual(["missingRegion", "missingOrganization"]);
    restored.participants.forEach((participant, index) => {
      participant.region = tournament.participants[index].region;
      participant.organization = tournament.participants[index].organization;
    });
    expect(previewKnockoutDraw(restored, restored.stages[0].id).ready).toBe(
      true,
    );
  });

  it("retains exact v1 canonical serialization and deterministic layout", () => {
    const tournament = cup(8);
    tournament.stages[0].config.knockoutDraw = {
      version: 1,
      pots: [],
      restrictions: [],
      protectedSeeds: 0,
    };
    expect(canonicalize(validateTournament(tournament))).toBe(
      canonicalize(tournament),
    );
    expect(previewKnockoutDraw(tournament, "main").slots).toEqual(
      seedPositions(8).map((seed) => `p${seed}`),
    );
    expect(previewKnockoutDraw(tournament, "main").algorithm).toBe(
      KNOCKOUT_DRAW_ALGORITHM,
    );
    expect(
      knockoutDrawIssueText(
        { code: "separationFixed", values: ["region", "2"] },
        "fa",
      ),
    ).toContain("منطقه");
    expect(
      knockoutDrawIssueText(
        { code: "separationCapacity", values: ["تهران", "3", "2", "2"] },
        "fa",
      ),
    ).toContain("۳");
  });
});
