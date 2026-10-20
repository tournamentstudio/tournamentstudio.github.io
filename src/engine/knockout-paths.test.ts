import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
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
  KNOCKOUT_PATHS_ALGORITHM,
  KNOCKOUT_SEPARATION_ALGORITHM,
  knockoutDrawIssueText,
  previewKnockoutDraw,
  recordResult,
  seedPositions,
  simulate,
} from "./index";
import { singleElimination } from "./elimination";
import { losersEncounterRounds } from "./losers-encounters";
import { solveKnockoutPaths, type KnockoutPathsInput } from "./knockout-paths";

function cup(count = 8): Tournament {
  const tournament = createTournament(
    "جام مسیر بازندگان",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      id: `p${index + 1}`,
      region: `منطقه ${index + 1}`,
      organization: `Club ${index + 1}`,
    })),
    "double-elimination",
  );
  tournament.stages[0].id = "main";
  tournament.stages[0].config.seed = "lower-paths-fixture";
  tournament.rules.tieBreakers.push("seed");
  return tournament;
}

function configure(tournament: Tournament) {
  const draw: Extract<KnockoutDrawConfig, { version: 3 }> = {
    version: 3,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [{ field: "region", throughRound: 1 }],
  };
  tournament.stages[0].config.knockoutDraw = draw;
  return draw;
}

const observedCache = new Map<string, Uint8Array>();

/** Enumerate actual match outcomes, with no reachability or first-loss rules. */
function observedEncounters(size: number, byeMask: number): Uint8Array {
  const key = `${size}:${byeMask}`;
  const cached = observedCache.get(key);
  if (cached) return cached;
  const ids = Array.from(
    { length: size },
    (_, index) => `slot-${index}`,
  ).filter((_, slot) => !(slot % 2 && byeMask & (1 << Math.floor(slot / 2))));
  const stage = cup(ids.length).stages[0];
  const matches = singleElimination(
    stage,
    ids,
    true,
    ids.map((participantId) => ({
      participantId,
      slot: Number(participantId.slice(5)) + 1,
    })),
  ).filter((match) => ["winners", "losers"].includes(match.bracket!));
  const values = new Map<string, { winner?: string; loser?: string }>();
  const observed = new Uint8Array(size * size);
  const visit = (index: number) => {
    if (index === matches.length) return;
    const match = matches[index];
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
    if (match.bracket === "losers") {
      const a = Number(entrants[0].slice(5));
      const b = Number(entrants[1].slice(5));
      const previous = observed[a * size + b];
      if (!previous || previous > match.round) {
        observed[a * size + b] = match.round;
        observed[b * size + a] = match.round;
      }
    }
    for (let winner = 0; winner < 2; winner++) {
      values.set(match.id, {
        winner: entrants[winner],
        loser: entrants[1 - winner],
      });
      visit(index + 1);
    }
  };
  visit(0);
  observedCache.set(key, observed);
  return observed;
}

function verifyDraw(tournament: Tournament) {
  const draw = tournament.stages[0].config.knockoutDraw!;
  if (draw.version !== 3) throw new Error("V3 fixture required");
  const preview = previewKnockoutDraw(tournament, "main");
  expect(preview.issues).toEqual([]);
  const generated = generateStage(tournament, "main");
  expect(generated.stages[0].metadata.drawAlgorithm).toBe(
    KNOCKOUT_PATHS_ALGORITHM,
  );
  const slots = generated.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .flatMap((match) => match.slots.map((slot) => slot.participantId ?? null));
  expect(slots).toEqual(preview.slots);
  expect(slots.filter(Boolean).sort()).toEqual(
    [...preview.participantIds].sort(),
  );
  expect(
    slots.filter((id, slot) => id !== null && slots[slot ^ 1] === null).sort(),
  ).toEqual([...preview.byeIds].sort());
  for (const fixed of preview.fixedSlots)
    expect(slots[fixed.slot - 1]).toBe(fixed.participantId);
  const entrants = new Map(
    tournament.participants.map((item) => [item.id, item]),
  );
  const encounters = losersEncounterRounds(tournament.stages[0], slots.length);
  for (let a = 0; a < slots.length; a++) {
    if (!slots[a]) continue;
    expect(slots[a] || slots[a ^ 1]).toBeTruthy();
    for (let b = a + 1; b < slots.length; b++) {
      if (!slots[b]) continue;
      const first = entrants.get(slots[a]!)!;
      const second = entrants.get(slots[b]!)!;
      if (Math.floor(a / 2) === Math.floor(b / 2)) {
        for (const field of draw.restrictions)
          expect(normalizeDrawLabel(first[field]!)).not.toBe(
            normalizeDrawLabel(second[field]!),
          );
        for (const pot of draw.pots)
          expect(
            pot.participantIds.includes(first.id) &&
              pot.participantIds.includes(second.id),
          ).toBe(false);
      }
      for (const rule of draw.separation)
        if (
          Math.floor(a / 2 ** rule.throughRound) ===
          Math.floor(b / 2 ** rule.throughRound)
        )
          expect(normalizeDrawLabel(first[rule.field]!)).not.toBe(
            normalizeDrawLabel(second[rule.field]!),
          );
      const round =
        encounters[
          (2 * Math.floor(a / 2) + Number(slots[a ^ 1] === null)) *
            slots.length +
            2 * Math.floor(b / 2) +
            Number(slots[b ^ 1] === null)
        ];
      for (const rule of draw.losersSeparation)
        if (round && round <= rule.throughRound)
          expect(normalizeDrawLabel(first[rule.field]!)).not.toBe(
            normalizeDrawLabel(second[rule.field]!),
          );
    }
  }
  return generated;
}

/** Exhaust physical placements and check the independently observed outcomes. */
function hasValidPlacement(tournament: Tournament): boolean {
  const draw = tournament.stages[0].config.knockoutDraw!;
  if (draw.version !== 3) throw new Error("V3 fixture required");
  const participants = tournament.participants;
  const size = 2 ** Math.ceil(Math.log2(participants.length));
  const byeCount = size - participants.length;
  const positions = seedPositions(size);
  const slots = Array<number>(size).fill(-1);
  const labels = participants.map((participant) => ({
    region: normalizeDrawLabel(participant.region!),
    organization: normalizeDrawLabel(participant.organization!),
  }));
  const pots = participants.map((participant) =>
    draw.pots.findIndex((pot) => pot.participantIds.includes(participant.id)),
  );
  const visit = (entrant: number): boolean => {
    if (entrant === participants.length) {
      let mask = 0;
      for (let match = 0; match < size / 2; match++)
        if (slots[match * 2] < 0 || slots[match * 2 + 1] < 0)
          mask |= 1 << match;
      const observed = observedEncounters(size, mask);
      for (let first = 0; first < size; first++) {
        if (slots[first] < 0) continue;
        for (let second = first + 1; second < size; second++) {
          if (slots[second] < 0) continue;
          // Oracle BYEs use the first physical slot of their opening match.
          const a =
            mask & (1 << Math.floor(first / 2)) ? first - (first % 2) : first;
          const b =
            mask & (1 << Math.floor(second / 2))
              ? second - (second % 2)
              : second;
          const round = observed[a * size + b];
          if (
            draw.losersSeparation.some(
              (rule) =>
                round > 0 &&
                round <= rule.throughRound &&
                labels[slots[first]][rule.field] ===
                  labels[slots[second]][rule.field],
            )
          )
            return false;
        }
      }
      return true;
    }
    const candidates =
      entrant < draw.protectedSeeds
        ? [positions.indexOf(entrant + 1)]
        : Array.from({ length: size }, (_, slot) => slot);
    for (const slot of candidates) {
      if (slots[slot] !== -1) continue;
      const opponent = slots[slot ^ 1];
      if (opponent === -2 || (entrant < byeCount && opponent !== -1)) continue;
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
      if (visit(entrant + 1)) return true;
      slots[slot] = -1;
      if (entrant < byeCount) slots[slot ^ 1] = -1;
    }
    return false;
  };
  return visit(0);
}

describe("losers-bracket encounter graph", () => {
  it.each([4, 8])(
    "matches all actual outcomes and BYE masks at size %i",
    (size) => {
      const matrix = losersEncounterRounds(cup(size).stages[0], size);
      for (let mask = 0; mask < 2 ** (size / 2) - 1; mask++) {
        const observed = observedEncounters(size, mask);
        for (let a = 0; a < size; a++) {
          if (a % 2 && mask & (1 << Math.floor(a / 2))) continue;
          for (let b = a + 1; b < size; b++) {
            if (b % 2 && mask & (1 << Math.floor(b / 2))) continue;
            const first =
              2 * Math.floor(a / 2) +
              Number(!!(mask & (1 << Math.floor(a / 2))));
            const second =
              2 * Math.floor(b / 2) +
              Number(!!(mask & (1 << Math.floor(b / 2))));
            expect(matrix[first * size + second]).toBe(observed[a * size + b]);
          }
        }
      }
    },
  );

  it("keeps same-opening rematches and treats BYE recipients separately", () => {
    const matrix = losersEncounterRounds(cup(8).stages[0], 8);
    expect(matrix[0]).toBe(3);
    expect(matrix[0 * 8 + 2]).toBe(1);
    expect(matrix[1 * 8 + 3]).toBe(4);
    expect(matrix[0 * 8 + 3]).toBe(3);
    expect(losersEncounterRounds(cup(2).stages[0], 2)).toEqual(
      new Uint8Array(4),
    );
  });
});

describe("joint winners and losers separation", () => {
  it.each([3, 5, 7, 8, 13, 17, 31, 64, 127, 128, 256, 512])(
    "preserves all entrants, fixed seeds, and exact BYEs at count %i",
    (count) => {
      const tournament = cup(count);
      const draw = configure(tournament);
      const half = 2 ** Math.ceil(Math.log2(count)) / 2;
      draw.pots = [
        tournament.stages[0].participantIds.slice(0, half),
        tournament.stages[0].participantIds.slice(half),
      ].map((participantIds, index) => ({
        id: `pot-${index}`,
        name: `سید ${index + 1}`,
        participantIds,
      }));
      draw.protectedSeeds = Math.min(4, count);
      draw.restrictions = ["region"];
      draw.separation = [{ field: "region", throughRound: 2 }];
      draw.losersSeparation.push({ field: "organization", throughRound: 2 });
      const before = canonicalize(tournament);
      verifyDraw(tournament);
      expect(canonicalize(tournament)).toBe(before);
    },
  );

  it("replays deterministic paths with seed changes and irregular counts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 32 }),
        fc.string({ maxLength: 20 }),
        (count, seed) => {
          const tournament = cup(count);
          configure(tournament);
          tournament.stages[0].config.seed = seed;
          tournament.stages[0].config.seeding = "random";
          const preview = previewKnockoutDraw(tournament, "main");
          expect(preview).toEqual(previewKnockoutDraw(tournament, "main"));
          verifyDraw(tournament);
        },
      ),
      { numRuns: 40, seed: 628091 },
    );
  });

  it("agrees with exhaustive physical placement across independent lower outcomes", () => {
    let feasible = 0;
    let infeasible = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.array(fc.integer({ min: 0, max: 5 }), {
          minLength: 6,
          maxLength: 6,
        }),
        fc.integer({ min: 0, max: 6 }),
        (count, labels, pins) => {
          const tournament = cup(count);
          const draw = configure(tournament);
          draw.protectedSeeds = Math.min(pins, count);
          draw.losersSeparation[0].throughRound = 1 + (labels[0] % 2);
          if (labels[1] % 2) draw.restrictions = ["organization"];
          if (labels[2] % 2) {
            draw.restrictions.push("region");
            draw.separation = [{ field: "region", throughRound: 2 }];
          }
          if (labels[3] % 2)
            draw.losersSeparation.push({
              field: "organization",
              throughRound: 1,
            });
          tournament.participants.forEach((participant, index) => {
            participant.region = `R${labels[index]}`;
            participant.organization = `O${(index + labels[(index + 1) % 6]) % 4}`;
          });
          const expected = hasValidPlacement(tournament);
          if (expected) feasible++;
          else infeasible++;
          const preview = previewKnockoutDraw(tournament, "main");
          expect(
            preview.issueDetails.some((issue) => issue.code === "exhausted"),
          ).toBe(false);
          expect(preview.ready).toBe(expected);
        },
      ),
      { numRuns: 100, seed: 483017 },
    );
    expect(feasible).toBeGreaterThan(0);
    expect(infeasible).toBeGreaterThan(0);
  });

  it("allows same-region opening opponents when their lower rematch is later", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.losersSeparation[0].throughRound = 2;
    tournament.participants[0].region = " كرج ";
    tournament.participants[1].region = "کرج";
    verifyDraw(tournament);
    const slots = previewKnockoutDraw(tournament, "main").slots;
    expect(Math.floor(slots.indexOf("p1") / 2)).toBe(
      Math.floor(slots.indexOf("p2") / 2),
    );
    draw.restrictions = ["region"];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "losersInfeasible", values: [] },
    ]);
  });

  it("allows BYE recipients to share a region until their actual lower meeting", () => {
    const tournament = cup(5);
    const draw = configure(tournament);
    draw.protectedSeeds = 5;
    draw.losersSeparation[0].throughRound = 3;
    // The second and third seeds have BYEs in one winners half.
    tournament.participants[1].region = "Shared";
    tournament.participants[2].region = "Shared";
    verifyDraw(tournament);
    draw.losersSeparation[0].throughRound = 4;
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toContainEqual(
      {
        code: "losersCapacity",
        values: ["Shared", "2"],
      },
    );
  });

  it("reports fixed lower-path collisions without moving protected seeds", () => {
    const tournament = cup(8);
    const draw = configure(tournament);
    draw.protectedSeeds = 8;
    tournament.participants[0].region = "Shared";
    tournament.participants[3].region = "Shared";
    const before = canonicalize(tournament);
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "losersFixed", values: ["region", "1"] },
    ]);
    expect(() => generateStage(tournament, "main")).toThrow("Fixed positions");
    expect(canonicalize(tournament)).toBe(before);
  });

  it("preserves explicit qualification slots and reports conflicting source pins", () => {
    let tournament = cup(8);
    tournament.stages[0].format = "round-robin";
    tournament = simulate(tournament);
    tournament.stages[0].id = "source";
    tournament.matches.forEach((match) => {
      match.stageId = "source";
    });
    tournament.participants[0].region = "Shared";
    tournament.participants[1].region = "Shared";
    tournament.stages.push({
      id: "main",
      name: "Finals",
      format: "double-elimination",
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
          version: 3,
          pots: [],
          restrictions: [],
          protectedSeeds: 0,
          separation: [],
          losersSeparation: [{ field: "region", throughRound: 2 }],
        },
      },
      metadata: {},
    });
    expect(previewKnockoutDraw(tournament, "main").slots).toEqual(
      tournament.participants.map((item) => item.id),
    );
    tournament.stages[1].sources[0].bracketSlots = [1, 3, 2, 4, 5, 6, 7, 8];
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "losersFixed", values: ["region", "2"] },
    ]);
  });

  it("keeps two-loss elimination and the grand-final reset unchanged", () => {
    let tournament = cup(8);
    const draw = configure(tournament);
    draw.losersSeparation[0].throughRound = 2;
    tournament.participants[0].region = tournament.participants[1].region;
    tournament = generateStage(tournament, "main");
    const losses = new Map<string, number>();
    for (let index = 0; index < 24; index++) {
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
    expect(tournament.stages[0].status).toBe("completed");
    expect(
      tournament.matches.find((match) => match.bracket === "reset")?.status,
    ).toBe("completed");
    for (const participant of tournament.participants)
      expect(losses.get(participant.id)).toBe(
        participant.id === getChampion(tournament)!.id ? 1 : 2,
      );
    expect(() => generateStage(tournament, "main")).toThrow("played or live");
  });

  it("distinguishes node and work exhaustion from a completed infeasibility proof", () => {
    const tournament = cup(8);
    const ids = tournament.stages[0].participantIds;
    const input: KnockoutPathsInput = {
      slots: Array.from({ length: 8 }, () => null),
      participantIds: ids,
      byes: new Set(),
      keysById: new Map(ids.map((id) => [id, []])),
      preferredSlot: new Map(ids.map((id, index) => [id, index])),
      separation: [],
      losersSeparation: [
        {
          field: "region",
          throughRound: 2,
          labels: new Map(ids.map((id) => [id, id])),
        },
      ],
      encounters: losersEncounterRounds(tournament.stages[0], 8),
      seed: "test-budget",
      nodeLimit: 1,
      workLimit: 100000,
    };
    expect(solveKnockoutPaths(input)).toEqual({
      slots: null,
      exploredNodes: 1,
      exhausted: true,
    });
    expect(
      solveKnockoutPaths({ ...input, nodeLimit: 100000, workLimit: 1 }),
    ).toEqual({
      slots: null,
      exploredNodes: 0,
      exhausted: true,
    });
    input.losersSeparation[0].labels = new Map(ids.map((id) => [id, "Shared"]));
    expect(solveKnockoutPaths({ ...input, nodeLimit: 100000 })).toMatchObject({
      slots: null,
      exhausted: false,
    });
  });

  it("stops a difficult 512-entrant draw at the production budget without partial slots", () => {
    const tournament = cup(512);
    const draw = configure(tournament);
    draw.losersSeparation[0].throughRound = 2;
    tournament.participants.forEach((participant) => {
      participant.region = "Shared";
    });
    const preview = previewKnockoutDraw(tournament, "main");
    expect(preview.ready).toBe(false);
    expect(preview.slots).toEqual([]);
    expect(preview.issueDetails).toEqual([{ code: "exhausted", values: [] }]);
    expect(preview.exploredNodes).toBeGreaterThan(1);
    expect(preview.exploredNodes).toBeLessThanOrEqual(KNOCKOUT_DRAW_NODE_LIMIT);
  });
});

describe("losers separation validation and portability", () => {
  it.each([
    { version: 4 },
    { losersSeparation: [] },
    { losersSeparation: [{ field: "region", throughRound: 0 }] },
    { losersSeparation: [{ field: "region", throughRound: 17 }] },
    { losersSeparation: [{ field: "region", throughRound: 1.5 }] },
    { losersSeparation: [{ field: "name", throughRound: 1 }] },
    { losersSeparation: [{ field: "region", throughRound: 1, extra: true }] },
    { separation: [{ field: "region", throughRound: 1 }] },
    { separation: undefined },
    { version: 2 },
    { version: 1 },
  ])("rejects malformed or future policy %j", (fields) => {
    const tournament = cup();
    const draw = { ...configure(tournament), ...fields };
    expect(knockoutDrawSchema.safeParse(draw).success).toBe(false);
    const raw = JSON.parse(JSON.stringify(tournament));
    raw.stages[0].config.knockoutDraw = draw;
    expect(() => validateTournament(raw)).toThrow();
  });

  it("rejects duplicates, non-double formats, and missing lower labels", () => {
    const tournament = cup();
    const draw = configure(tournament);
    draw.losersSeparation.push({ field: "region", throughRound: 2 });
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toContainEqual(
      {
        code: "duplicateLosersSeparation",
        values: [],
      },
    );
    draw.losersSeparation.pop();
    tournament.stages[0].format = "single-elimination";
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "losersFormat", values: [] },
    ]);
    tournament.stages[0].format = "double-elimination";
    delete tournament.participants[0].region;
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "missingRegion", values: [] },
    ]);
  });

  it("validates the actual lower depth after withdrawals and the two-entrant case", () => {
    const tournament = cup(9);
    const draw = configure(tournament);
    draw.losersSeparation[0].throughRound = 6;
    tournament.participants[8].status = "withdrawn";
    expect(previewKnockoutDraw(tournament, "main").issueDetails).toEqual([
      { code: "losersRound", values: ["6", "4"] },
    ]);
    const pair = cup(2);
    configure(pair);
    expect(previewKnockoutDraw(pair, "main").issueDetails).toEqual([
      { code: "losersRound", values: ["1", "0"] },
    ]);
  });

  it("keeps v1 and v2 canonical data, algorithms, and layouts unchanged", () => {
    const tournament = cup(8);
    for (const draw of [
      { version: 1, pots: [], restrictions: [], protectedSeeds: 0 },
      {
        version: 2,
        pots: [],
        restrictions: ["region"],
        protectedSeeds: 0,
        separation: [{ field: "region", throughRound: 2 }],
      },
    ] as KnockoutDrawConfig[]) {
      tournament.stages[0].config.knockoutDraw = draw;
      const before = canonicalize(tournament);
      expect(canonicalize(validateTournament(tournament))).toBe(before);
      const preview = previewKnockoutDraw(tournament, "main");
      expect(preview.slots).toEqual(seedPositions(8).map((seed) => `p${seed}`));
      expect(preview.algorithm).toBe(
        draw.version === 1
          ? KNOCKOUT_DRAW_ALGORITHM
          : KNOCKOUT_SEPARATION_ALGORITHM,
      );
      expect(
        "losersSeparation" in
          validateTournament(tournament).stages[0].config.knockoutDraw!,
      ).toBe(false);
    }
  });

  it("preserves public, encrypted, archive, recipe, and patch transfers", async () => {
    const tournament = cup(13);
    const draw = configure(tournament);
    draw.pots = [
      tournament.stages[0].participantIds.slice(0, 8),
      tournament.stages[0].participantIds.slice(8),
    ].map((participantIds, index) => ({
      id: `pot-${index}`,
      name: `سید ${index + 1}`,
      participantIds,
    }));
    tournament.stages[0].config.privateNote = "Referee-only sample";
    const generated = generateStage(tournament, "main");
    expect(
      publicProjection(generated).stages[0].config.privateNote,
    ).toBeUndefined();
    const archive = await exportArchive(generated, "test-only-lower-secret");
    await expect(
      importArchive(archive, "test-only-wrong-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(generated)),
      await importArchive(await exportArchive(generated)),
      await importArchive(archive, "test-only-lower-secret"),
    ]) {
      expect(restored.stages[0].config.knockoutDraw).toEqual(
        generated.stages[0].config.knockoutDraw,
      );
      expect(previewKnockoutDraw(restored, "main").slots).toEqual(
        previewKnockoutDraw(generated, "main").slots,
      );
    }
    const recipe = await decodeRecipe(await encodeRecipe(tournament));
    const imported = recipe.stages[0].config.knockoutDraw!;
    expect(imported.version).toBe(3);
    if (imported.version === 3) {
      expect(imported.separation).toEqual(draw.separation);
      expect(imported.losersSeparation).toEqual(draw.losersSeparation);
    }
    expect(imported.pots.flatMap((pot) => pot.participantIds)).toEqual(
      recipe.participants.map((participant) => participant.id),
    );
    expect(
      previewKnockoutDraw(recipe, recipe.stages[0].id).issueDetails,
    ).toEqual([{ code: "missingRegion", values: [] }]);
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
    const divergent = await sealDocument({ ...base, title: "Local edition" });
    await expect(applyPatch(divergent, patch)).rejects.toThrow();
    expect(
      knockoutDrawIssueText(
        { code: "losersFixed", values: ["region", "2"] },
        "fa",
      ),
    ).toContain("منطقه");
    expect(
      knockoutDrawIssueText({ code: "losersRound", values: ["6", "4"] }, "fa"),
    ).toContain("۶");
  });
});
