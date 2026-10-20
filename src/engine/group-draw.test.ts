import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type GroupDrawConfig,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { groupDrawSchema } from "../domain/draw";
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
  GROUP_DRAW_ALGORITHM,
  groupDrawIssueText,
  normalizeDrawLabel,
  previewGroupDraw,
  recordResult,
  simulate,
  validateGraph,
} from "./index";
import { distributeGroups } from "./formats";

function cup(count = 18, groupCount = 4): Tournament {
  const tournament = createTournament(
    "قرعه‌کشی جام دانشگاه",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      region: `Region ${index % groupCount}`,
      organization: `Club ${index % groupCount}`,
    })),
    "groups",
  );
  const stage = tournament.stages[0];
  stage.id = "groups";
  stage.config.groupCount = groupCount;
  stage.config.seed = "fixture";
  return tournament;
}

function pots(tournament: Tournament): GroupDrawConfig {
  const stage = tournament.stages[0];
  const count =
    stage.format === "gsl"
      ? stage.participantIds.length / 4
      : stage.config.groupCount;
  return {
    version: 1,
    pots: Array.from(
      { length: Math.ceil(stage.participantIds.length / count) },
      (_, index) => ({
        id: `pot-${index}`,
        name: `سید ${index + 1}`,
        participantIds: stage.participantIds.slice(
          index * count,
          (index + 1) * count,
        ),
      }),
    ),
    restrictions: [],
  };
}

function expectPotIntegrity(tournament: Tournament): void {
  const stage = tournament.stages[0];
  const preview = previewGroupDraw(tournament, stage.id);
  expect(preview.issues).toEqual([]);
  expect(preview.ready).toBe(true);
  expect(preview.groups.flat().sort()).toEqual(
    [...stage.participantIds].sort(),
  );
  expect(new Set(preview.groups.flat()).size).toBe(stage.participantIds.length);
  const sizes = preview.groups.map((group) => group.length);
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  for (const group of preview.groups)
    for (const pot of stage.config.draw!.pots)
      expect(
        group.filter((id) => pot.participantIds.includes(id)).length,
      ).toBeLessThanOrEqual(1);
}

describe("pot and restricted group draws", () => {
  it("assigns 18 entrants to capacities 5, 5, 4, 4 with one from each pot", () => {
    const tournament = cup();
    tournament.stages[0].config.draw = pots(tournament);
    const before = canonicalize(tournament);
    expectPotIntegrity(tournament);
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.groups.map((group) => group.length)).toEqual([5, 5, 4, 4]);
    const generated = generateStage(tournament, "groups");
    expect(generated.stages[0].metadata.groups).toEqual(preview.groups);
    expect(generated.stages[0].metadata.drawAlgorithm).toBe(
      GROUP_DRAW_ALGORITHM,
    );
    expect(generated.stages[0].metadata.drawSeed).toBe("fixture");
    expect(generated.matches).toHaveLength(32);
    expect(canonicalize(tournament)).toBe(before);
  });

  it("preserves assignment invariants for arbitrary pot sizes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 80 }),
        fc.integer({ min: 1, max: 12 }),
        (count, candidateGroups) => {
          const tournament = cup(count, Math.min(count, candidateGroups));
          tournament.stages[0].config.draw = pots(tournament);
          expectPotIntegrity(tournament);
          expect(previewGroupDraw(tournament, "groups")).toEqual(
            previewGroupDraw(tournament, "groups"),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it.each([3, 7, 13, 17, 31, 127, 256, 512])(
    "supports %i entrants within the deterministic work budget",
    (count) => {
      const tournament = cup(count, Math.min(128, Math.ceil(count / 4)));
      tournament.stages[0].config.draw = pots(tournament);
      expectPotIntegrity(tournament);
    },
  );

  it("uses the stored seed and varies assignments with a different seed", () => {
    const tournament = cup(16);
    tournament.stages[0].config.draw = pots(tournament);
    const original = previewGroupDraw(tournament, "groups");
    expect(previewGroupDraw(structuredClone(tournament), "groups")).toEqual(
      original,
    );
    tournament.stages[0].config.seed = "another draw";
    expect(previewGroupDraw(tournament, "groups").groups).not.toEqual(
      original.groups,
    );
  });

  it("orders tied seeds without depending on the host collation locale", () => {
    const tournament = cup(4, 2);
    const identifiers = ["é", "e", "ی", "ي"];
    tournament.participants.forEach((participant, index) => {
      participant.id = identifiers[index];
      participant.seed = 1;
    });
    tournament.stages[0].participantIds = identifiers;
    tournament.stages[0].config.draw = {
      version: 1,
      pots: [],
      restrictions: [],
    };
    const compare = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(() => {
        throw new Error(
          "Host collation must not be used for a constrained draw",
        );
      });
    try {
      expect(previewGroupDraw(tournament, "groups").groups).toEqual([
        ["e", "ي"],
        ["é", "ی"],
      ]);
      expect(
        generateStage(tournament, "groups").stages[0].metadata.drawOrder,
      ).toEqual(["e", "é", "ي", "ی"]);
    } finally {
      compare.mockRestore();
    }
  });

  it("handles 512 entrants with pots and both restriction fields", () => {
    const tournament = cup(512, 128);
    tournament.participants.forEach((participant, index) => {
      participant.region = `Region ${index % 128}`;
      participant.organization = `Club ${Math.floor(index / 128)}`;
    });
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 1 },
      { field: "organization", maxPerGroup: 1 },
    ];
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.ready).toBe(true);
    expect(preview.groups).toHaveLength(128);
    expect(preview.groups.flat()).toHaveLength(512);
    expect(preview.exploredNodes).toBe(512);
    for (const group of preview.groups) {
      for (const field of ["region", "organization"] as const)
        expect(
          new Set(
            group.map(
              (id) => tournament.participants.find((p) => p.id === id)![field],
            ),
          ).size,
        ).toBe(4);
    }
  });

  it("distinguishes search exhaustion from proven infeasibility", () => {
    const tournament = cup(64, 8);
    tournament.participants.forEach((participant, index) => {
      participant.region = `Column ${index % 8}`;
      participant.organization = `Symbol ${(Math.floor(index / 8) + index) % 8}`;
    });
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 1 },
      { field: "organization", maxPerGroup: 1 },
    ];
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.ready).toBe(false);
    expect(preview.issueDetails.map((issue) => issue.code)).toEqual([
      "exhausted",
    ]);
    expect(preview.groups).toEqual([]);
    expect(preview.issues[0]).toContain("Feasibility is unknown");
  });

  it("keeps the previous default snake draw and absent-field hashes unchanged", () => {
    const tournament = cup();
    const before = canonicalize(tournament);
    const validated = validateTournament(tournament);
    expect(canonicalize(validated)).toBe(before);
    expect(Object.hasOwn(validated.stages[0].config, "draw")).toBe(false);
    expect(previewGroupDraw(tournament, "groups").groups).toEqual(
      distributeGroups(tournament.stages[0].participantIds, 4),
    );
    expect(
      generateStage(tournament, "groups").stages[0].metadata.groups,
    ).toEqual(distributeGroups(tournament.stages[0].participantIds, 4));
  });

  it("preserves manual group configurations when constraints are absent", () => {
    const tournament = cup(7, 2);
    const groups = [
      tournament.stages[0].participantIds.slice(0, 2),
      tournament.stages[0].participantIds.slice(2),
    ];
    tournament.stages[0].config.groups = groups;
    expect(previewGroupDraw(tournament, "groups").groups).toEqual(groups);
    expect(
      generateStage(tournament, "groups").stages[0].metadata.groups,
    ).toEqual(groups);
  });

  it("satisfies simultaneous regional and organizational caps", () => {
    const tournament = cup(16, 4);
    tournament.participants.forEach((participant, index) => {
      participant.region = `Region ${index % 4}`;
      participant.organization = `Club ${Math.floor(index / 4)}`;
    });
    const draw = pots(tournament);
    draw.restrictions = [
      { field: "region", maxPerGroup: 1 },
      { field: "organization", maxPerGroup: 1 },
    ];
    tournament.stages[0].config.draw = draw;
    expectPotIntegrity(tournament);
    const preview = previewGroupDraw(tournament, "groups");
    for (const group of preview.groups) {
      const entrants = tournament.participants.filter((p) =>
        group.includes(p.id),
      );
      expect(new Set(entrants.map((p) => p.region)).size).toBe(4);
      expect(new Set(entrants.map((p) => p.organization)).size).toBe(4);
    }
  });

  it("allows restrictions without pots", () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = {
      version: 1,
      pots: [],
      restrictions: [{ field: "region", maxPerGroup: 2 }],
    };
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.ready).toBe(true);
    for (const group of preview.groups) {
      const regions = group.map(
        (id) => tournament.participants.find((p) => p.id === id)!.region,
      );
      expect(regions.filter((region) => region === "Region 0")).toHaveLength(2);
    }
  });

  it("rejects combined constraints that are individually feasible", () => {
    const tournament = cup(6, 2);
    const [a, b, c, d, e, f] = tournament.participants;
    a.region = "A";
    b.region = "B";
    c.region = "B";
    d.region = "D";
    e.region = "E";
    f.region = "F";
    a.organization = "Same";
    c.organization = "Same";
    b.organization = "B";
    d.organization = "D";
    e.organization = "E";
    f.organization = "F";
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 1 },
      { field: "organization", maxPerGroup: 1 },
    ];
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.ready).toBe(false);
    expect(preview.issueDetails.map((issue) => issue.code)).toEqual([
      "infeasible",
    ]);
    expect(preview.groups).toEqual([]);
    expect(() => generateStage(tournament, "groups")).toThrow(
      "No balanced group assignment",
    );
  });

  it("normalizes Persian letters, spacing, compatibility forms and case", () => {
    expect(normalizeDrawLabel("  استان كيان يزد  ")).toBe(
      normalizeDrawLabel("استان کیان یزد"),
    );
    expect(normalizeDrawLabel("ＣＬＵＢ  North")).toBe(
      normalizeDrawLabel("club north"),
    );
    const tournament = cup(8, 2);
    tournament.participants.slice(0, 3).forEach((participant, index) => {
      participant.region = [" كيان", "کیان ", "كیان"][index];
    });
    tournament.stages[0].config.draw = {
      version: 1,
      pots: [],
      restrictions: [{ field: "region", maxPerGroup: 1 }],
    };
    expect(
      previewGroupDraw(tournament, "groups").issueDetails.some(
        (issue) => issue.code === "regionCapacity",
      ),
    ).toBe(true);
  });

  it.each(["region", "organization"] as const)(
    "requires %s metadata for every active entrant",
    (field) => {
      const tournament = cup(8, 2);
      delete tournament.participants[0][field];
      tournament.stages[0].config.draw = {
        version: 1,
        pots: [],
        restrictions: [{ field, maxPerGroup: 4 }],
      };
      const preview = previewGroupDraw(tournament, "groups");
      expect(preview.ready).toBe(false);
      expect(preview.issues.join(" ")).toMatch(/every active entrant/);
    },
  );

  it("does not require metadata for withdrawn entrants but requires pot assignments to be refreshed", () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    tournament.participants[0].status = "withdrawn";
    delete tournament.participants[0].region;
    tournament.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 4 },
    ];
    expect(
      previewGroupDraw(tournament, "groups").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toEqual(["incompletePots"]);
    tournament.stages[0].config.draw.pots[0].participantIds.shift();
    expect(previewGroupDraw(tournament, "groups").ready).toBe(true);
  });

  it("draws actual four-person GSL groups", () => {
    const tournament = cup(12, 7);
    tournament.stages[0].format = "gsl";
    tournament.stages[0].config.draw = pots(tournament);
    const preview = previewGroupDraw(tournament, "groups");
    expect(preview.groups.map((group) => group.length)).toEqual([4, 4, 4]);
    const generated = generateStage(tournament, "groups");
    expect(generated.matches).toHaveLength(15);
    expect(generated.stages[0].metadata.groups).toEqual(preview.groups);
  });

  it("resolves completed source standings before drawing downstream groups", () => {
    let tournament = cup(8, 2);
    tournament.rules.tieBreakers.push("seed");
    tournament = simulate(tournament);
    tournament.stages.push({
      id: "next",
      name: "Qualified groups",
      format: "groups",
      formatVersion: 1,
      order: 1,
      status: "draft",
      participantIds: [],
      metadata: {},
      sources: [{ stageId: "groups", count: 2, perGroup: true }],
      config: {
        ...DEFAULT_CONFIG,
        groupCount: 2,
        draw: {
          version: 1,
          pots: [],
          restrictions: [{ field: "region", maxPerGroup: 2 }],
        },
      },
    });
    const preview = previewGroupDraw(tournament, "next");
    expect(preview.ready).toBe(true);
    expect(preview.participantIds).toHaveLength(4);
    expect(generateStage(tournament, "next").stages[1].metadata.groups).toEqual(
      preview.groups,
    );
    tournament.stages[0].status = "active";
    expect(
      previewGroupDraw(tournament, "next").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toContain("source");
  });

  it("keeps played-draw and dependent-stage locks", () => {
    let tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    tournament = generateStage(tournament, "groups");
    const match = tournament.matches.find((item) => item.status === "ready")!;
    tournament = recordResult(tournament, match.id, {
      scores: [1, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: tournament.updatedAt,
    });
    const before = canonicalize(tournament);
    expect(() => generateStage(tournament, "groups")).toThrow("played or live");
    expect(canonicalize(tournament)).toBe(before);
  });

  it("estimates exact qualifier positions from constrained group capacities", () => {
    const tournament = cup(14, 4);
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages.push({
      id: "final",
      name: "Final",
      format: "single-elimination",
      formatVersion: 1,
      order: 1,
      status: "draft",
      participantIds: [],
      metadata: {},
      sources: [
        {
          stageId: "groups",
          count: 1,
          perGroup: false,
          selection: { kind: "positions", picks: [{ group: "A", rank: 4 }] },
        },
      ],
      config: { ...DEFAULT_CONFIG },
    });
    expect(validateGraph(tournament)).toEqual([]);
    tournament.stages[1].sources[0].selection = {
      kind: "positions",
      picks: [{ group: "D", rank: 4 }],
    };
    expect(validateGraph(tournament).join(" ")).toMatch(/exceeds the size/);
  });

  it("reports each issue in Persian without changing the algorithm", () => {
    const tournament = cup(8, 2);
    tournament.participants[0].region = "";
    tournament.stages[0].config.draw = {
      version: 1,
      pots: [],
      restrictions: [{ field: "region", maxPerGroup: 4 }],
    };
    const preview = previewGroupDraw(tournament, "groups");
    expect(groupDrawIssueText(preview.issueDetails[0], "fa")).toContain(
      "منطقه",
    );
    expect(
      groupDrawIssueText(
        { code: "regionCapacity", values: ["تهران", "7", "4"] },
        "fa",
      ),
    ).toContain("۷");
  });
});

describe("draw validation and portability", () => {
  it.each([
    { version: 2, pots: [], restrictions: [] },
    {
      version: 1,
      pots: [],
      restrictions: [{ field: "region", maxPerGroup: 0 }],
    },
    {
      version: 1,
      pots: [],
      restrictions: [{ field: "region", maxPerGroup: 1.5 }],
    },
    { version: 1, pots: [], restrictions: [{ field: "name", maxPerGroup: 1 }] },
    {
      version: 1,
      pots: [{ id: "p", name: "Pot", participantIds: [], html: "<script>" }],
      restrictions: [],
    },
  ])("rejects malformed configurations %j", (draw) => {
    expect(groupDrawSchema.safeParse(draw).success).toBe(false);
    const tournament = cup();
    const input = JSON.parse(JSON.stringify(tournament));
    input.stages[0].config.draw = draw;
    expect(() => validateTournament(input)).toThrow();
    expect(previewGroupDraw(input, "groups").ready).toBe(false);
  });

  it("rejects duplicate pots, entrants, restriction fields and unknown IDs", () => {
    const tournament = cup(8, 2);
    const draw = pots(tournament);
    draw.pots[1].id = draw.pots[0].id;
    draw.pots[1].participantIds[0] = draw.pots[0].participantIds[0];
    draw.pots[2].participantIds[0] = "unknown";
    draw.restrictions = [
      { field: "region", maxPerGroup: 1 },
      { field: "region", maxPerGroup: 2 },
    ];
    tournament.stages[0].config.draw = draw;
    const codes = previewGroupDraw(tournament, "groups").issueDetails.map(
      (issue) => issue.code,
    );
    expect(codes).toEqual([
      "duplicatePot",
      "duplicateEntrant",
      "unknownEntrant",
      "duplicateRestriction",
    ]);
    expect(validateGraph(tournament)).toHaveLength(4);
    expect(() => validateTournament(tournament)).toThrow();
  });

  it("rejects incomplete and oversized pots at generation without discarding drafts", () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.draw.pots[0].participantIds.pop();
    expect(() => validateTournament(tournament)).not.toThrow();
    expect(() => generateStage(tournament, "groups")).toThrow(
      "Assign every active stage entrant",
    );
    tournament.stages[0].config.draw.pots[0].participantIds.push("p2", "p3");
    tournament.stages[0].config.draw.pots[1].participantIds.shift();
    expect(
      previewGroupDraw(tournament, "groups").issueDetails.map(
        (issue) => issue.code,
      ),
    ).toContain("potSize");
  });

  it("rejects unsupported formats and manual assignments mixed with draw rules", () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.groups = [tournament.stages[0].participantIds];
    expect(() => validateTournament(tournament)).toThrow("Remove manual group");
    delete tournament.stages[0].config.groups;
    tournament.stages[0].format = "single-elimination";
    expect(() => generateStage(tournament, "groups")).toThrow(
      "require Groups or GSL",
    );
  });

  it("preserves a complete draw in public and encrypted portable packages", async () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    tournament.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 2 },
    ];
    tournament.stages[0].config.secretNote = "private referee detail";
    tournament.participants[0].metadata.secret = "private participant detail";
    const generated = generateStage(tournament, "groups");
    const projection = publicProjection(generated);
    expect(projection.stages[0].config.draw).toEqual(
      generated.stages[0].config.draw,
    );
    expect(projection.stages[0].config.secretNote).toBeUndefined();
    expect(projection.participants[0].metadata.secret).toBeUndefined();
    for (const restored of [
      await decodeCode(await encodeCode(generated)),
      await importArchive(
        await exportArchive(generated, "test-only-draw-secret"),
        "test-only-draw-secret",
      ),
    ]) {
      expect(restored.stages[0].config.draw).toEqual(
        generated.stages[0].config.draw,
      );
      expect(previewGroupDraw(restored, "groups").groups).toEqual(
        previewGroupDraw(generated, "groups").groups,
      );
    }
  });

  it("remaps recipe pot membership to fresh participants", async () => {
    const tournament = cup(8, 2);
    tournament.stages[0].config.draw = pots(tournament);
    const recipe = await decodeRecipe(await encodeRecipe(tournament));
    expect(
      recipe.stages[0].config.draw!.pots.map(
        (pot) => pot.participantIds.length,
      ),
    ).toEqual([2, 2, 2, 2]);
    expect(
      recipe.stages[0].config.draw!.pots.flatMap((pot) => pot.participantIds),
    ).toEqual(recipe.participants.map((p) => p.id));
    expectPotIntegrity(recipe);
  });

  it("applies draw configuration and generated groups through versioned updates", async () => {
    const base = await sealDocument(cup(8, 2));
    const edited = structuredClone(base);
    edited.stages[0].config.draw = pots(edited);
    edited.stages[0].config.draw.restrictions = [
      { field: "region", maxPerGroup: 2 },
    ];
    edited.revision++;
    const target = await sealDocument(generateStage(edited, "groups"));
    const packet = await decodePatch(
      await encodePatch(await createPatch(base, target)),
    );
    const restored = await applyPatch(base, packet);
    expect(restored).toEqual(target);
    expect(previewGroupDraw(restored, "groups")).toEqual(
      previewGroupDraw(target, "groups"),
    );
    expect(base.stages[0].config.draw).toBeUndefined();
    await expect(applyPatch(restored, packet)).rejects.toThrow(
      "already applied",
    );
    const divergent = structuredClone(base);
    divergent.title = "Another local edit";
    await expect(applyPatch(divergent, packet)).rejects.toThrow("diverged");
  });
});
