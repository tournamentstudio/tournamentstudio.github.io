import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Advancement,
  type Stage,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { canonicalize } from "../security/codec";
import {
  applyPatch,
  createPatch,
  decodeCode,
  decodePatch,
  encodeCode,
  encodePatch,
  exportArchive,
  hashDocument,
  importArchive,
  publicProjection,
  sealDocument,
} from "../sharing";
import {
  CorrectionRequiredError,
  generateStage,
  getChampion,
  getCorrectionImpact,
  getStandings,
  previewAdvancement,
  recordResult,
  simulate,
  validateGraph,
} from "./index";

function groups(sizes = [5, 5, 4, 4]): Tournament {
  const count = sizes.reduce((sum, size) => sum + size, 0);
  const tournament = createTournament(
    "Qualification cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    "groups",
  );
  const stage = tournament.stages[0];
  stage.id = "groups";
  stage.config.groupCount = sizes.length;
  let offset = 0;
  stage.config.groups = sizes.map((size) => {
    const ids = stage.participantIds.slice(offset, offset + size);
    offset += size;
    return ids;
  });
  return generateStage(tournament, stage.id);
}

function finishGroups(input: Tournament): Tournament {
  let tournament = input;
  while (tournament.matches.some((match) => match.status === "ready")) {
    const match = tournament.matches.find((item) => item.status === "ready")!;
    const ids = match.slots.map((slot) => slot.participantId!);
    const winner = ids.reduce((a, b) =>
      Number(a.slice(1)) < Number(b.slice(1)) ? a : b,
    );
    tournament = recordResult(tournament, match.id, {
      scores: ids.map((id) => (id === winner ? 2 : 0)),
      winnerIds: [winner],
      outcome: "played",
      recordedAt: tournament.updatedAt,
    });
  }
  return tournament;
}

function destination(
  tournament: Tournament,
  sources: Advancement[],
  format: Stage["format"] = "single-elimination",
): Tournament {
  const next = structuredClone(tournament);
  next.stages.push({
    id: "finals",
    name: "Finals",
    format,
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources,
    status: "draft",
    metadata: {},
  });
  return next;
}

function wildcard(
  comparison: "total" | "per-match" | "discard-bottom" = "total",
  count = 1,
  seed = true,
): Advancement {
  return {
    stageId: "groups",
    count,
    perGroup: false,
    selection: {
      kind: "wildcard",
      rank: 2,
      comparison,
      tieBreakers: seed
        ? ["points", "wins", "differential", "scored", "seed"]
        : ["points"],
    },
  };
}

function exact(
  picks: { group?: string; rank: number }[],
  slots?: number[],
): Advancement {
  return {
    stageId: "groups",
    count: picks.length,
    perGroup: false,
    selection: { kind: "positions", picks },
    ...(slots ? { bracketSlots: slots } : {}),
  };
}

describe("advancement contracts", () => {
  it("keeps legacy documents and hashes unchanged on validation", async () => {
    const tournament = destination(groups(), [
      { stageId: "groups", count: 2, perGroup: true },
    ]);
    const parsed = validateTournament(tournament);
    expect(canonicalize(parsed)).toBe(canonicalize(tournament));
    expect(await hashDocument(parsed)).toBe(await hashDocument(tournament));
    expect(Object.keys(parsed.stages[1].sources[0])).toEqual([
      "stageId",
      "count",
      "perGroup",
    ]);
  });

  it("previews incomplete sources without mutating their state", () => {
    const tournament = destination(groups(), [wildcard()]);
    const before = structuredClone(tournament);
    const preview = previewAdvancement(tournament, "finals");
    expect(preview.ready).toBe(false);
    expect(preview.issues.join(" ")).toMatch(/Complete/);
    expect(preview.sources[0].candidates.length).toBeGreaterThan(0);
    expect(tournament).toEqual(before);
  });

  it("resolves exact group positions into physical A1 versus B2 slots", () => {
    const tournament = destination(finishGroups(groups([4, 4])), [
      exact(
        [
          { group: "A", rank: 1 },
          { group: "B", rank: 2 },
        ],
        [1, 2],
      ),
      exact(
        [
          { group: "B", rank: 1 },
          { group: "A", rank: 2 },
        ],
        [3, 4],
      ),
    ]);
    tournament.stages[1].config.seeding = "random";
    const preview = previewAdvancement(tournament, "finals");
    expect(preview.ready).toBe(true);
    expect(preview.participantIds).toEqual(["p1", "p6", "p5", "p2"]);
    const generated = generateStage(tournament, "finals");
    const opening = generated.matches.filter(
      (match) => match.stageId === "finals" && match.round === 1,
    );
    expect(
      opening.map((match) => match.slots.map((slot) => slot.participantId)),
    ).toEqual([
      ["p1", "p6"],
      ["p5", "p2"],
    ]);
  });

  it.each(["single-elimination", "double-elimination"] as const)(
    "finishes clustered irregular physical slots in %s",
    (format) => {
      const tournament = destination(
        finishGroups(groups([5, 4])),
        [
          exact(
            [1, 2, 3, 4, 5].map((rank) => ({ group: "A", rank })),
            [1, 2, 3, 4, 5],
          ),
        ],
        format,
      );
      const generated = generateStage(tournament, "finals");
      const empty = generated.matches.find(
        (match) =>
          match.stageId === "finals" &&
          match.round === 1 &&
          match.bracket === "winners" &&
          match.index === 3,
      )!;
      expect(empty.status).toBe("bye");
      expect(empty.result?.winnerIds).toEqual([]);
      const finished = simulate(generated);
      expect(getChampion(finished)?.id).toBe("p1");
      expect(finished.stages[1].status).toBe("completed");
      const played = finished.matches.filter(
        (match) => match.stageId === "finals" && match.status === "completed",
      );
      expect(played).toHaveLength(format === "single-elimination" ? 4 : 8);
      expect(validateGraph(finished)).toEqual([]);
    },
  );

  it("fills unmapped slots without replacing explicit occupants", () => {
    const tournament = destination(finishGroups(groups([4, 4])), [
      exact([{ group: "A", rank: 1 }], [4]),
      exact([
        { group: "A", rank: 2 },
        { group: "B", rank: 1 },
      ]),
    ]);
    const generated = generateStage(tournament, "finals");
    const slots = generated.matches
      .filter((match) => match.stageId === "finals" && match.round === 1)
      .flatMap((match) => match.slots);
    expect(slots[3].participantId).toBe("p1");
    expect(slots.filter((slot) => slot.participantId)).toHaveLength(3);
    expect(
      new Set(
        slots.flatMap((slot) =>
          slot.participantId ? [slot.participantId] : [],
        ),
      ).size,
    ).toBe(3);
  });

  it("joins two independent source stages", () => {
    let tournament = groups([4, 4]);
    const first = tournament.stages[0];
    first.participantIds = ["p1", "p2", "p3", "p4"];
    first.config.groups = [first.participantIds];
    first.config.groupCount = 1;
    tournament.matches = [];
    tournament.stages.push({
      ...structuredClone(first),
      id: "second",
      order: 1,
      participantIds: ["p5", "p6", "p7", "p8"],
      config: { ...first.config, groups: [["p5", "p6", "p7", "p8"]] },
    });
    tournament = generateStage(generateStage(tournament, "groups"), "second");
    tournament = destination(finishGroups(tournament), [
      { stageId: "groups", count: 2, perGroup: false },
      { stageId: "second", count: 2, perGroup: false },
    ]);
    expect(previewAdvancement(tournament, "finals").participantIds).toEqual([
      "p1",
      "p2",
      "p5",
      "p6",
    ]);
  });

  it("rejects inactive selected qualifiers instead of shrinking the draw", () => {
    const tournament = destination(finishGroups(groups([4, 4])), [
      exact([{ group: "A", rank: 1 }], [1]),
    ]);
    tournament.participants[0].status = "withdrawn";
    expect(previewAdvancement(tournament, "finals").issues.join(" ")).toMatch(
      /not active/,
    );
    expect(() => generateStage(tournament, "finals")).toThrow(/not active/);
  });

  it("uses generated descendants when correcting a selected source result", () => {
    let tournament = destination(finishGroups(groups([4, 4])), [
      exact(
        [
          { group: "A", rank: 1 },
          { group: "B", rank: 2 },
        ],
        [1, 2],
      ),
    ]);
    tournament = simulate(generateStage(tournament, "finals"));
    const source = tournament.matches.find(
      (match) => match.stageId === "groups",
    )!;
    expect(
      getCorrectionImpact(tournament, source.id).some(
        (match) => match.stageId === "finals",
      ),
    ).toBe(true);
    const changed = {
      ...source.result!,
      scores: [0, 3],
      winnerIds: [source.slots[1].participantId!],
    };
    expect(() => recordResult(tournament, source.id, changed)).toThrow(
      CorrectionRequiredError,
    );
    const corrected = recordResult(tournament, source.id, changed, true);
    expect(corrected.matches.some((match) => match.stageId === "finals")).toBe(
      false,
    );
    expect(corrected.stages[1].status).toBe("draft");
    expect(corrected.metadata.correctionRecovery).toBeTruthy();
  });
});

describe("wildcard qualification", () => {
  it.each([
    ["total", "scored", "p6"],
    ["per-match", "scored", "p6"],
    ["discard-bottom", "scored", "p6"],
    ["total", "differential", "p2"],
    ["per-match", "differential", "p2"],
    ["discard-bottom", "differential", "p2"],
  ] as const)(
    "uses lower weighted %s %s values for wildcard qualification",
    (comparison, breaker, expected) => {
      let tournament = groups([4, 4]);
      tournament.rules.scoring = "weighted";
      tournament.rules.weightedDirection = "low";
      tournament.rules.metricDefinitions = [{
        id: "elapsed", name: "Elapsed time", unit: "seconds", kind: "number",
        min: 0, max: 1000, aggregate: "sum", weight: 1,
      }];
      for (const match of tournament.matches) {
        const scores = match.slots.map((slot) => {
          const seed = Number(slot.participantId!.slice(1));
          return seed <= 4 ? 100 + seed * 10 : seed - 4;
        });
        tournament = recordResult(tournament, match.id, {
          scores, metrics: { elapsed: scores }, winnerIds: [],
          outcome: "played", recordedAt: tournament.updatedAt,
        });
      }
      const source = wildcard(comparison);
      if (source.selection?.kind === "wildcard")
        source.selection.tieBreakers = [breaker];
      const connected = destination(tournament, [source]);
      expect(getStandings(connected, "groups", "A")[1].participantId).toBe("p2");
      expect(getStandings(connected, "groups", "B")[1].participantId).toBe("p6");
      const preview = previewAdvancement(connected, "finals");
      expect(preview.ready).toBe(true);
      expect(preview.participantIds).toEqual([expected]);
      expect(generateStage(connected, "finals").stages[1].participantIds).toEqual([expected]);
      expect(validateTournament(connected)).toEqual(connected);
    },
  );

  it.each(["low", "time"] as const)(
    "uses lower %s values for per-match wildcard comparison",
    (scoring) => {
      let tournament = groups([4, 4]);
      tournament.rules.scoring = scoring;
      for (const match of tournament.matches) {
        const scores = match.slots.map((slot) => {
          const seed = Number(slot.participantId!.slice(1));
          return seed <= 4 ? 100 + seed : seed - 4;
        });
        tournament = recordResult(tournament, match.id, {
          scores,
          winnerIds: [
            match.slots[scores.indexOf(Math.min(...scores))].participantId!,
          ],
          outcome: "played",
          recordedAt: tournament.updatedAt,
        });
      }
      const source = wildcard("per-match");
      if (source.selection?.kind === "wildcard")
        source.selection.tieBreakers = ["scored"];
      const preview = previewAdvancement(
        destination(tournament, [source]),
        "finals",
      );
      expect(preview.ready).toBe(true);
      expect(preview.participantIds).toEqual(["p6"]);
      expect(
        preview.sources[0].candidates.find((row) => row.participantId === "p2")
          ?.compared.scored,
      ).toBe(102);
      expect(
        preview.sources[0].candidates.find((row) => row.participantId === "p6")
          ?.compared.scored,
      ).toBe(2);
    },
  );

  it("compares 18 entrants in uneven groups using explicit total and per-match metrics", () => {
    const completed = finishGroups(groups());
    const total = previewAdvancement(
      destination(completed, [wildcard()]),
      "finals",
    );
    expect(total.ready).toBe(true);
    expect(total.participantIds).toEqual(["p2"]);
    expect(
      total.sources[0].candidates.find((row) => row.group === "A")?.metrics,
    ).toEqual({ played: 4, points: 9, wins: 3, differential: 4, scored: 6 });
    const rates = previewAdvancement(
      destination(completed, [wildcard("per-match")]),
      "finals",
    );
    expect(
      rates.sources[0].candidates.find((row) => row.group === "A")?.compared,
    ).toEqual({ points: 2.25, wins: 0.75, differential: 1, scored: 1.5 });
    expect(
      rates.sources[0].candidates.find((row) => row.group === "C")?.compared
        .points,
    ).toBe(2);
  });

  it("discards results against bottom places without changing original standings", () => {
    const tournament = destination(finishGroups(groups()), [
      wildcard("discard-bottom"),
    ]);
    const original = getStandings(tournament, "groups", "A");
    const preview = previewAdvancement(tournament, "finals");
    expect(preview.ready).toBe(true);
    const a = preview.sources[0].candidates.find((row) => row.group === "A")!;
    expect(a.metrics.played).toBe(4);
    expect(a.comparisonPlayed).toBe(3);
    expect(a.compared).toEqual({
      points: 6,
      wins: 2,
      differential: 2,
      scored: 4,
    });
    expect(getStandings(tournament, "groups", "A")).toEqual(original);
  });

  it.each(["total", "per-match", "discard-bottom"] as const)(
    "blocks unresolved %s wildcard cutoffs",
    (comparison) => {
      const preview = previewAdvancement(
        destination(finishGroups(groups()), [wildcard(comparison, 1, false)]),
        "finals",
      );
      expect(preview.ready).toBe(false);
      expect(preview.issues.join(" ")).toMatch(/tied at the cutoff/);
      expect(
        preview.sources[0].candidates.some((candidate) => candidate.tied),
      ).toBe(true);
    },
  );

  it("excludes direct qualifiers even when the wildcard connection is listed first", () => {
    const tournament = destination(finishGroups(groups()), [
      wildcard("total", 1),
      exact([{ group: "A", rank: 2 }]),
    ]);
    const preview = previewAdvancement(tournament, "finals");
    expect(preview.ready).toBe(true);
    expect(preview.participantIds).toEqual(["p7", "p2"]);
    expect(
      preview.sources[0].candidates.find((row) => row.participantId === "p2"),
    ).toMatchObject({
      excluded: true,
      selected: false,
      reason: "Already qualified through another connection.",
    });
  });

  it("allows valid manual tie decisions but not lower-ranked replacements", () => {
    const tournament = destination(finishGroups(groups()), [
      wildcard("discard-bottom", 1, false),
    ]);
    tournament.stages[1].config.manualQualifiers = ["p12"];
    expect(previewAdvancement(tournament, "finals").participantIds).toEqual([
      "p12",
    ]);
    expect(previewAdvancement(tournament, "finals").ready).toBe(true);
    tournament.stages[1].config.manualQualifiers = ["p13"];
    expect(previewAdvancement(tournament, "finals").ready).toBe(false);
    const clear = destination(finishGroups(groups()), [
      exact([{ group: "A", rank: 1 }]),
    ]);
    clear.stages[1].config.manualQualifiers = ["p2"];
    expect(previewAdvancement(clear, "finals").ready).toBe(false);
  });

  it("rejects a source position tied or skipped by a tied rank", () => {
    const tournament = groups([3, 3]);
    tournament.rules.allowDraws = true;
    let drawn = tournament;
    for (const match of tournament.matches)
      drawn = recordResult(drawn, match.id, {
        scores: [0, 0],
        winnerIds: [],
        outcome: "draw",
        recordedAt: tournament.updatedAt,
      });
    for (const rank of [1, 2]) {
      const preview = previewAdvancement(
        destination(drawn, [exact([{ group: "A", rank }])]),
        "finals",
      );
      expect(preview.ready).toBe(false);
      expect(preview.issues.join(" ")).toMatch(/tied/);
    }
    expect(
      previewAdvancement(destination(drawn, [wildcard()]), "finals").ready,
    ).toBe(false);
    expect(
      previewAdvancement(
        destination(drawn, [
          {
            stageId: "groups",
            count: 3,
            perGroup: true,
            bracketSlots: [1, 2, 3, 4, 5, 6],
          },
        ]),
        "finals",
      ).issues.join(" "),
    ).toMatch(/ranking ties/);
  });

  it("blocks a tied discard boundary", () => {
    const completed = finishGroups(groups());
    // A targeted points adjustment creates a tie between fourth and fifth place.
    completed.rules.tieBreakers = ["points"];
    completed.participants.find(
      (participant) => participant.id === "p5",
    )!.metadata.pointsAdjustment = 3;
    const preview = previewAdvancement(
      destination(completed, [wildcard("discard-bottom")]),
      "finals",
    );
    expect(preview.ready).toBe(false);
    expect(preview.issues.join(" ")).toMatch(/discard boundary/);
  });

  it("rejects comparison with no played games", () => {
    const tournament = groups([2, 2]);
    tournament.matches.forEach((match) => {
      match.status = "canceled";
    });
    tournament.stages[0].status = "completed";
    tournament.rules.tieBreakers = ["seed"];
    const source = wildcard();
    if (source.selection?.kind === "wildcard") source.selection.rank = 1;
    expect(
      previewAdvancement(
        destination(tournament, [source]),
        "finals",
      ).issues.join(" "),
    ).toMatch(/no played matches/);
  });
});

describe("advancement validation and portable data", () => {
  it("applies a connection edit packet with the same preview and physical draw", async () => {
    const base = await sealDocument(
      destination(finishGroups(groups([4, 4])), [
        { stageId: "groups", count: 2, perGroup: true },
      ]),
    );
    const edited = structuredClone(base);
    edited.stages[1].sources = [
      exact(
        [
          { group: "A", rank: 1 },
          { group: "B", rank: 2 },
        ],
        [1, 2],
      ),
      exact(
        [
          { group: "B", rank: 1 },
          { group: "A", rank: 2 },
        ],
        [3, 4],
      ),
    ];
    edited.revision++;
    const target = await sealDocument(generateStage(edited, "finals"));
    const patch = await decodePatch(
      await encodePatch(await createPatch(base, target)),
    );
    const restored = await applyPatch(base, patch);
    expect(restored).toEqual(target);
    expect(previewAdvancement(restored, "finals")).toEqual(
      previewAdvancement(target, "finals"),
    );
    expect(base.stages[1].sources[0].selection).toBeUndefined();
  });

  it.each([
    [exact([{ group: "Missing", rank: 1 }]), /no group/],
    [exact([{ group: "C", rank: 5 }]), /exceeds the size/],
    [{ ...exact([{ group: "A", rank: 1 }]), count: 2 }, /position count/],
    [
      exact([
        { group: "A", rank: 1 },
        { group: "A", rank: 1 },
      ]),
      /more than once/,
    ],
    [exact([{ group: "A", rank: 1 }], [3]), /draw size/],
    [{ ...wildcard(), perGroup: true }, /cannot also/],
  ] satisfies [Advancement, RegExp][])(
    "rejects invalid selector %j",
    (source, message) => {
      const tournament = destination(groups(), [source]);
      expect(validateGraph(tournament).join(" ")).toMatch(message);
      expect(() => validateTournament(tournament)).toThrow(message);
    },
  );

  it("rejects overlapping direct picks, duplicate wildcard pools, physical slots and source cycles", () => {
    for (const sources of [
      [
        exact([{ group: "A", rank: 1 }]),
        { stageId: "groups", count: 1, perGroup: true },
      ],
      [wildcard(), wildcard("per-match", 2)],
      [
        exact([{ group: "A", rank: 1 }], [1]),
        exact([{ group: "B", rank: 1 }], [1]),
      ],
    ]) {
      expect(() => validateTournament(destination(groups(), sources))).toThrow(
        /more than once/,
      );
    }
    const cyclic = destination(groups(), [wildcard()]);
    cyclic.stages[0].sources = [
      { stageId: "finals", count: 2, perGroup: false },
    ];
    expect(validateGraph(cyclic).join(" ")).toMatch(/cycle/);
    expect(() => validateTournament(cyclic)).toThrow(/cycle/);
  });

  it("rejects duplicate entrants selected through different overall and group paths", () => {
    const tournament = destination(finishGroups(groups([4, 4])), [
      exact([{ group: "A", rank: 1 }]),
      { stageId: "groups", count: 2, perGroup: false },
    ]);
    tournament.rules.tieBreakers.push("seed");
    expect(previewAdvancement(tournament, "finals").issues.join(" ")).toMatch(
      /qualifies more than once/,
    );
  });

  it("preserves selections, diagrams and score adjustments through public and encrypted transfers", async () => {
    const tournament = destination(finishGroups(groups()), [
      {
        stageId: "groups",
        count: 1,
        perGroup: true,
        bracketSlots: [1, 3, 5, 7],
      },
      { ...wildcard("discard-bottom", 2), bracketSlots: [2, 6] },
    ]);
    tournament.stages[1].metadata.canvasPosition = { x: 350, y: 120 };
    tournament.stages[1].metadata.privateNote = "private stage note";
    tournament.participants[1].metadata = {
      pointsAdjustment: 2,
      privateNote: "private participant note",
    };
    const publicDocument = await decodeCode(await encodeCode(tournament));
    expect(publicDocument.stages[1].sources).toEqual(
      tournament.stages[1].sources,
    );
    expect(publicDocument.stages[1].metadata).toEqual({
      canvasPosition: { x: 350, y: 120 },
    });
    expect(publicDocument.participants[1].metadata).toEqual({
      pointsAdjustment: 2,
    });
    expect(previewAdvancement(publicDocument, "finals")).toEqual(
      previewAdvancement(publicProjection(tournament), "finals"),
    );
    const secret = "test-only-transfer-secret";
    const privateDocument = await importArchive(
      await exportArchive(tournament, secret),
      secret,
    );
    expect(privateDocument.stages[1].sources).toEqual(
      tournament.stages[1].sources,
    );
    expect(previewAdvancement(privateDocument, "finals")).toEqual(
      previewAdvancement(tournament, "finals"),
    );
    const invalid = structuredClone(tournament);
    invalid.stages[1].metadata.canvasPosition = {
      x: 1,
      y: 2,
      hidden: "private",
    };
    expect(() => validateTournament(invalid)).toThrow(/canvas positions/);
  });

  it("preserves a qualification tie created by a public scoring adjustment", async () => {
    const tournament = destination(finishGroups(groups([4, 4])), [
      exact([{ group: "A", rank: 1 }]),
    ]);
    tournament.rules.tieBreakers = ["points"];
    tournament.participants[1].metadata.pointsAdjustment = 3;
    expect(previewAdvancement(tournament, "finals").ready).toBe(false);
    const restored = await decodeCode(await encodeCode(tournament));
    expect(getStandings(restored, "groups", "A")).toEqual(
      getStandings(tournament, "groups", "A"),
    );
    expect(previewAdvancement(restored, "finals").issues).toEqual(
      previewAdvancement(tournament, "finals").issues,
    );
    expect(restored.participants[2].metadata).toEqual({});
  });

  it("keeps exact physical placements for arbitrary distinct slot permutations", () => {
    const completed = finishGroups(groups([5, 4]));
    fc.assert(
      fc.property(
        fc.shuffledSubarray([1, 2, 3, 4, 5, 6, 7, 8], {
          minLength: 5,
          maxLength: 5,
        }),
        (slots) => {
          const tournament = destination(completed, [
            exact(
              [1, 2, 3, 4, 5].map((rank) => ({ group: "A", rank })),
              slots,
            ),
          ]);
          const generated = generateStage(tournament, "finals");
          const opening = generated.matches
            .filter((match) => match.stageId === "finals" && match.round === 1)
            .flatMap((match) => match.slots);
          slots.forEach((slot, index) =>
            expect(opening[slot - 1].participantId).toBe(`p${index + 1}`),
          );
          expect(getChampion(simulate(generated))?.id).toBe("p1");
        },
      ),
      { numRuns: 30, seed: 4041 },
    );
  });
});
