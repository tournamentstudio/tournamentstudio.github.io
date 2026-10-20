import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type FormatId,
  type Match,
  type Stage,
  type Tournament,
} from "../domain/types";
import {
  advanceStage,
  autoSchedule,
  CorrectionRequiredError,
  detectConflicts,
  generateStage,
  getChampion,
  getCorrectionImpact,
  getStandings,
  recordResult,
  seedPositions,
  shuffle,
  simulate,
  validateGraph,
} from "./index";
import { randomSource } from "./random";

function fixture(
  count: number,
  format: FormatId = "single-elimination",
): Tournament {
  const tournament = createTournament(
    "Test tournament",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(
        index === 0 ? "تیم آفتاب" : `Team ${index + 1}`,
        index + 1,
      ),
      id: `p${index + 1}`,
    })),
    format,
  );
  tournament.id = "test";
  tournament.stages[0].id = "main";
  tournament.rules.tieBreakers.push("seed");
  return tournament;
}

function score(
  tournament: Tournament,
  match: Match,
  winningSlot = 0,
): Tournament {
  return recordResult(tournament, match.id, {
    scores: match.slots.map((_, index) => (index === winningSlot ? 2 : 0)),
    winnerIds: [match.slots[winningSlot].participantId!],
    outcome: "played",
    recordedAt: "2026-10-20T12:00:00Z",
  });
}

function finish(
  tournament: Tournament,
  choose: (match: Match) => number = () => 0,
): Tournament {
  let next = tournament;
  for (let iteration = 0; iteration < 4000; iteration++) {
    const match = next.matches.find((item) => item.status === "ready");
    if (match) {
      next = score(next, match, choose(match));
      continue;
    }
    const active = next.stages.find(
      (stage) =>
        stage.status === "active" &&
        ["swiss", "triple-elimination", "ladder"].includes(stage.format),
    );
    if (active) {
      next = advanceStage(next, active.id);
      continue;
    }
    return next;
  }
  throw new Error("Test completion guard reached.");
}

function addPlayoffs(
  tournament: Tournament,
  perGroup = true,
  count = 2,
): Tournament {
  const stage: Stage = {
    id: "playoffs",
    name: "Playoffs",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [{ stageId: "main", count, perGroup }],
    status: "draft",
    metadata: {},
  };
  tournament.stages.push(stage);
  return tournament;
}

describe("single elimination", () => {
  it("keeps an unplayed draw ready and starts on its first result", () => {
    const generated = generateStage(fixture(13), "main");
    expect(generated.status).toBe("ready");
    expect(advanceStage(generated, "main").status).toBe("ready");
    const playing = score(
      generated,
      generated.matches.find((match) => match.status === "ready")!,
    );
    expect(playing.status).toBe("in-progress");
    expect(finish(playing).status).toBe("completed");
  });

  it.each([1, 3, 5, 7, 8, 9, 13, 17, 24, 31, 32, 64, 127, 128, 256, 512])(
    "completes %i entrants with n minus one played matches",
    (count) => {
      const initial = fixture(count);
      const tournament = finish(generateStage(initial, "main"), (match) =>
        Math.max(
          0,
          match.slots.findIndex((slot) => slot.participantId === "p1"),
        ),
      );
      expect(
        tournament.matches.filter((match) => match.status === "completed"),
      ).toHaveLength(count - 1);
      expect(getChampion(tournament)?.id).toBe("p1");
      expect(tournament.status).toBe("completed");
      expect(validateGraph(tournament)).toEqual([]);
      expect(initial.matches).toEqual([]);
    },
  );

  it("keeps top seeds in opposite halves with distributed byes", () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const tournament = generateStage(fixture(13), "main");
    expect(
      tournament.matches.filter(
        (match) => match.round === 1 && match.status === "bye",
      ),
    ).toHaveLength(3);
    expect(
      tournament.matches.find(
        (match) =>
          match.round === 1 &&
          match.slots.some((slot) => slot.participantId === "p1"),
      )?.status,
    ).toBe("bye");
  });

  it("produces deterministic draws and valid slots for random sizes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 128 }),
        fc.string(),
        (count, seed) => {
          const tournament = fixture(count);
          tournament.stages[0].config.seeding = "random";
          tournament.stages[0].config.seed = seed;
          const first = generateStage(tournament, "main");
          expect(generateStage(tournament, "main")).toEqual(first);
          for (const match of first.matches) {
            const ids = match.slots.flatMap((slot) =>
              slot.participantId ? [slot.participantId] : [],
            );
            expect(new Set(ids).size).toBe(ids.length);
          }
        },
      ),
      { numRuns: 40 },
    );
    expect(shuffle(["a", "b", "c", "d"], "seed")).toEqual(
      shuffle(["a", "b", "c", "d"], "seed"),
    );
  });

  it("plays a third-place match without changing the champion", () => {
    const tournament = fixture(8);
    tournament.stages[0].config.thirdPlace = true;
    const final = finish(generateStage(tournament, "main"));
    const third = final.matches.find((match) => match.bracket === "placement")!;
    expect(third.status).toBe("completed");
    expect(getStandings(final, "main")[2].participantId).toBe(
      third.result?.winnerIds[0],
    );
    expect(getChampion(final)?.id).not.toBe(third.result?.winnerIds[0]);
  });
});

describe("double and triple elimination", () => {
  it.each([2, 3, 5, 7, 8, 13, 17, 31])(
    "gives every nonchampion exactly two losses for %i entrants",
    (count) => {
      const final = finish(
        generateStage(fixture(count, "double-elimination"), "main"),
      );
      const champion = getChampion(final)!.id;
      const losses = new Map<string, number>();
      for (const match of final.matches.filter(
        (match) => match.status === "completed",
      )) {
        for (const slot of match.slots) {
          if (!match.result!.winnerIds.includes(slot.participantId!))
            losses.set(
              slot.participantId!,
              (losses.get(slot.participantId!) ?? 0) + 1,
            );
        }
      }
      for (const participant of final.participants)
        expect(losses.get(participant.id) ?? 0).toBe(
          participant.id === champion ? 0 : 2,
        );
      expect(
        final.matches.find((match) => match.bracket === "reset")?.status,
      ).toBe("canceled");
    },
  );

  it("requires a grand-final reset when the losers finalist wins", () => {
    let tournament = generateStage(fixture(8, "double-elimination"), "main");
    while (
      tournament.matches.some(
        (match) => match.status === "ready" && match.bracket !== "final",
      )
    ) {
      tournament = score(
        tournament,
        tournament.matches.find(
          (match) => match.status === "ready" && match.bracket !== "final",
        )!,
      );
    }
    const grandFinal = tournament.matches.find(
      (match) => match.bracket === "final",
    )!;
    const lower = grandFinal.slots[1].participantId;
    tournament = score(tournament, grandFinal, 1);
    expect(tournament.status).toBe("in-progress");
    expect(
      tournament.matches.find((match) => match.bracket === "reset")?.status,
    ).toBe("ready");
    tournament = score(
      tournament,
      tournament.matches.find((match) => match.bracket === "reset")!,
      0,
    );
    expect(getChampion(tournament)?.id).toBe(lower);
    expect(
      tournament.matches.filter((match) => match.status === "completed"),
    ).toHaveLength(15);
  });

  it("supports the explicitly selected single grand-final policy", () => {
    const initial = fixture(8, "double-elimination");
    initial.stages[0].config.grandFinalReset = false;
    const tournament = finish(generateStage(initial, "main"), (match) =>
      match.bracket === "final" ? 1 : 0,
    );
    expect(tournament.matches.some((match) => match.bracket === "reset")).toBe(
      false,
    );
    expect(tournament.status).toBe("completed");
    expect(getChampion(tournament)).toBeDefined();
  });

  it("preserves two-loss elimination under arbitrary match outcomes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 32 }),
        fc.integer(),
        (count, randomSeed) => {
          const random = randomSource(String(randomSeed));
          const final = finish(
            generateStage(fixture(count, "double-elimination"), "main"),
            () => (random() < 0.5 ? 0 : 1),
          );
          const losses = new Map<string, number>();
          for (const match of final.matches.filter(
            (match) => match.status === "completed",
          )) {
            for (const slot of match.slots) {
              expect(losses.get(slot.participantId!) ?? 0).toBeLessThan(2);
              if (!match.result!.winnerIds.includes(slot.participantId!))
                losses.set(
                  slot.participantId!,
                  (losses.get(slot.participantId!) ?? 0) + 1,
                );
            }
          }
          const champion = getChampion(final)!.id;
          for (const participant of final.participants) {
            if (participant.id === champion)
              expect(losses.get(participant.id) ?? 0).toBeLessThan(2);
            else expect(losses.get(participant.id)).toBe(2);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it.each([3, 7, 8, 13])(
    "uses three losses before elimination for %i entrants",
    (count) => {
      const final = finish(
        generateStage(fixture(count, "triple-elimination"), "main"),
      );
      const losses = new Map<string, number>();
      for (const match of final.matches.filter(
        (match) => match.status === "completed",
      )) {
        for (const slot of match.slots) {
          expect(losses.get(slot.participantId!) ?? 0).toBeLessThan(3);
          if (!match.result!.winnerIds.includes(slot.participantId!))
            losses.set(
              slot.participantId!,
              (losses.get(slot.participantId!) ?? 0) + 1,
            );
        }
      }
      const champion = getChampion(final)!.id;
      for (const participant of final.participants) {
        if (participant.id !== champion)
          expect(losses.get(participant.id)).toBe(3);
      }
      expect(final.stages[0].metadata.policy).toBe("progressive-three-loss-v1");
    },
  );
});

describe("round robin, groups and advancement", () => {
  it("has exactly one meeting per pair in odd and even fields", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 32 }),
        fc.integer({ min: 1, max: 3 }),
        (count, meetings) => {
          const initial = fixture(count, "round-robin");
          initial.stages[0].config.meetings = meetings;
          const tournament = generateStage(initial, "main");
          const pairs = new Map<string, number>();
          const occupied = new Set<string>();
          for (const match of tournament.matches) {
            const pair = match.slots
              .map((slot) => slot.participantId!)
              .sort()
              .join(":");
            pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
            for (const slot of match.slots) {
              const key = `${match.round}:${slot.participantId}`;
              expect(occupied.has(key)).toBe(false);
              occupied.add(key);
            }
          }
          expect(pairs.size).toBe((count * (count - 1)) / 2);
          expect([...pairs.values()].every((value) => value === meetings)).toBe(
            true,
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("balances 18 entrants into four uneven groups", () => {
    const tournament = generateStage(fixture(18, "groups"), "main");
    const groups = tournament.stages[0].metadata.groups as string[][];
    expect(groups.map((group) => group.length)).toEqual([5, 5, 4, 4]);
    expect(tournament.matches).toHaveLength(32);
    expect(new Set(groups.flat()).size).toBe(18);
  });

  it("completes four groups then eight-team playoffs", () => {
    let tournament = addPlayoffs(fixture(16, "groups"));
    tournament = finish(generateStage(tournament, "main"));
    expect(tournament.stages[0].status).toBe("completed");
    tournament = generateStage(tournament, "playoffs");
    expect(tournament.stages[1].participantIds).toHaveLength(8);
    const membership = new Map(
      (tournament.stages[0].metadata.groups as string[][]).flatMap(
        (group, index) => group.map((id) => [id, index] as const),
      ),
    );
    for (const match of tournament.matches.filter(
      (match) => match.stageId === "playoffs" && match.round === 1,
    )) {
      expect(membership.get(match.slots[0].participantId!)).not.toBe(
        membership.get(match.slots[1].participantId!),
      );
    }
    for (const group of ["A", "B", "C", "D"]) {
      expect(
        getStandings(tournament, "main", group)
          .slice(0, 2)
          .every((row) =>
            tournament.stages[1].participantIds.includes(row.participantId),
          ),
      ).toBe(true);
    }
    tournament = finish(tournament);
    expect(getChampion(tournament)).toBeDefined();
    expect(tournament.status).toBe("completed");
  });

  it("runs eight Gol Ya Pooch teams through groups and four-team playoffs", () => {
    let tournament = fixture(8, "groups");
    tournament.sport = "gol-ya-pooch";
    tournament.stages[0].config.groupCount = 2;
    tournament.participants.forEach((participant) => {
      participant.roster = Array.from({ length: 3 }, (_, index) => ({
        id: `${participant.id}:${index}`,
        name: `Player ${index + 1}`,
        role: index === 0 ? "captain" : "player",
      }));
    });
    tournament = addPlayoffs(tournament);
    tournament = finish(generateStage(tournament, "main"));
    tournament = finish(generateStage(tournament, "playoffs"));
    expect(tournament.stages[1].participantIds).toHaveLength(4);
    expect(
      tournament.matches.filter(
        (match) => match.stageId === "playoffs" && match.status === "completed",
      ),
    ).toHaveLength(3);
    expect(getChampion(tournament)).toBeDefined();
  });

  it("refuses a tied qualification cutoff until a manual ruling is supplied", () => {
    let tournament = fixture(3, "round-robin");
    tournament.rules.allowDraws = true;
    tournament.rules.tieBreakers = ["points"];
    tournament = addPlayoffs(tournament, false, 2);
    tournament = generateStage(tournament, "main");
    for (const match of tournament.matches)
      tournament = recordResult(tournament, match.id, {
        scores: [0, 0],
        winnerIds: [],
        outcome: "draw",
        recordedAt: tournament.updatedAt,
      });
    expect(() => generateStage(tournament, "playoffs")).toThrow(
      /tied at the cutoff/,
    );
    tournament.stages[1].config.manualQualifiers = ["p1", "p2"];
    expect(
      generateStage(tournament, "playoffs").stages[1].participantIds,
    ).toEqual(["p1", "p2"]);
  });

  it("qualifies the winners of GSL winners and decider matches", () => {
    const tournament = finish(generateStage(fixture(8, "gsl"), "main"));
    expect(tournament.matches).toHaveLength(10);
    for (const group of ["A", "B"]) {
      const qualifiers = tournament.matches
        .filter((match) => match.group === group && match.metadata.qualifier)
        .sort(
          (a, b) => Number(a.metadata.qualifier) - Number(b.metadata.qualifier),
        )
        .map((match) => match.result!.winnerIds[0]);
      expect(
        getStandings(tournament, "main", group)
          .slice(0, 2)
          .map((row) => row.participantId),
      ).toEqual(qualifiers);
    }
  });
});

describe("Swiss and scoring", () => {
  it("excludes byes from wins and played matches while crediting Swiss points", () => {
    const knockout = generateStage(fixture(13), "main");
    expect(
      getStandings(knockout, "main").every(
        (row) => row.wins === 0 && row.played === 0,
      ),
    ).toBe(true);
    const swiss = generateStage(fixture(17, "swiss"), "main");
    const byeId = swiss.matches.find((match) => match.status === "bye")!.result!
      .winnerIds[0];
    const row = getStandings(swiss, "main").find(
      (value) => value.participantId === byeId,
    )!;
    expect(row).toMatchObject({ wins: 0, played: 0, points: 3 });
  });

  it("pairs 17 players for five rounds without rematches or repeated byes", () => {
    const tournament = finish(generateStage(fixture(17, "swiss"), "main"));
    const pairs = new Set<string>();
    const byes: string[] = [];
    for (const match of tournament.matches) {
      if (match.status === "bye") {
        byes.push(match.result!.winnerIds[0]);
        continue;
      }
      const pair = match.slots
        .map((slot) => slot.participantId!)
        .sort()
        .join(":");
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
    }
    expect(pairs.size).toBe(40);
    expect(new Set(byes).size).toBe(5);
    expect(
      getStandings(tournament, "main").some((row) => row.buchholz > 0),
    ).toBe(true);
    expect(tournament.status).toBe("completed");
  });

  it("excludes withdrawn entrants from subsequent Swiss rounds", () => {
    let tournament = generateStage(fixture(8, "swiss"), "main");
    for (const match of tournament.matches.filter(
      (match) => match.status === "ready",
    ))
      tournament = score(tournament, match);
    tournament.participants[0].status = "withdrawn";
    tournament = advanceStage(tournament, "main");
    expect(
      tournament.matches
        .filter((match) => match.round === 2)
        .every((match) =>
          match.slots.every((slot) => slot.participantId !== "p1"),
        ),
    ).toBe(true);
  });

  it("reports impossible pairings rather than inserting a rematch", () => {
    const tournament = fixture(4, "swiss");
    tournament.stages[0].config.rounds = 3;
    tournament.stages[0].config.forbiddenPairs = [
      ["p1", "p2"],
      ["p1", "p3"],
      ["p1", "p4"],
    ];
    expect(() => generateStage(tournament, "main")).toThrow(/No pairing/);
  });

  it("preserves Swiss constraints for varied scores and odd fields", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 9, max: 25 }),
        fc.integer(),
        (count, randomSeed) => {
          const random = randomSource(String(randomSeed));
          const final = finish(
            generateStage(fixture(count, "swiss"), "main"),
            () => (random() < 0.5 ? 0 : 1),
          );
          const pairs = final.matches
            .filter((match) => match.status === "completed")
            .map((match) =>
              match.slots
                .map((slot) => slot.participantId)
                .sort()
                .join(":"),
            );
          expect(new Set(pairs).size).toBe(pairs.length);
          expect(final.stages[0].status).toBe("completed");
        },
      ),
      { numRuns: 20 },
    );
  });

  it("validates sets and rejects extra sets after the match is won", () => {
    let tournament = generateStage(fixture(2), "main");
    tournament.rules.scoring = "sets";
    tournament.rules.bestOf = 3;
    const result = {
      scores: [2, 0],
      winnerIds: ["p1"],
      sets: [
        [11, 3],
        [11, 5],
      ],
      outcome: "played" as const,
      recordedAt: tournament.updatedAt,
    };
    expect(() =>
      recordResult(tournament, tournament.matches[0].id, {
        ...result,
        sets: [[11, 3]],
      }),
    ).toThrow(/needs 2/);
    expect(() =>
      recordResult(tournament, tournament.matches[0].id, {
        ...result,
        sets: [
          [11, 3],
          [11, 5],
          [11, 2],
        ],
      }),
    ).toThrow(/already won/);
    tournament = recordResult(tournament, tournament.matches[0].id, result);
    expect(getChampion(tournament)?.id).toBe("p1");
  });

  it("allows forfeits but rejects a score mismatch and elimination ties", () => {
    const tournament = generateStage(fixture(2), "main");
    const match = tournament.matches[0];
    expect(() =>
      recordResult(tournament, match.id, {
        scores: [0, 2],
        winnerIds: ["p1"],
        outcome: "played",
        recordedAt: tournament.updatedAt,
      }),
    ).toThrow(/does not match/);
    expect(() =>
      recordResult(tournament, match.id, {
        scores: [2, 2],
        winnerIds: [],
        outcome: "draw",
        recordedAt: tournament.updatedAt,
      }),
    ).toThrow(/needs a winner/);
    expect(
      getChampion(
        recordResult(tournament, match.id, {
          scores: [0, 0],
          winnerIds: ["p1"],
          outcome: "forfeit",
          recordedAt: tournament.updatedAt,
        }),
      )?.id,
    ).toBe("p1");
  });

  it("computes placement ties and time results without assuming two entrants", () => {
    let tournament = fixture(4, "free-for-all");
    tournament.stages[0].config.rounds = 1;
    tournament = generateStage(tournament, "main");
    tournament = recordResult(tournament, tournament.matches[0].id, {
      scores: [10, 10, 7, 2],
      placements: [1, 1, 3, 4],
      winnerIds: ["p1", "p2"],
      outcome: "played",
      recordedAt: tournament.updatedAt,
    });
    expect(getStandings(tournament, "main")[0].points).toBe(21.5);
    const time = fixture(4, "time-trial");
    time.stages[0].config.rounds = 1;
    const timed = generateStage(time, "main");
    const final = recordResult(timed, timed.matches[0].id, {
      scores: [120, 110, 130, 115],
      winnerIds: ["p2"],
      outcome: "played",
      recordedAt: timed.updatedAt,
    });
    expect(getChampion(final)?.id).toBe("p2");
  });

  it("runs a gauntlet and updates a challenge ladder by rank swaps", () => {
    expect(
      finish(generateStage(fixture(7, "gauntlet"), "main")).matches,
    ).toHaveLength(6);
    let ladder = fixture(4, "ladder");
    ladder.stages[0].config.rounds = 1;
    ladder = generateStage(ladder, "main");
    for (const match of ladder.matches) ladder = score(ladder, match, 1);
    expect(
      getStandings(ladder, "main").map((row) => row.participantId),
    ).toEqual(["p2", "p1", "p4", "p3"]);
    expect(getChampion(ladder)?.id).toBe("p2");
  });
});

describe("data safety and scheduling", () => {
  it("requires confirmation before invalidating played downstream results and keeps recovery data", () => {
    let tournament = generateStage(fixture(8), "main");
    const first = tournament.matches[0];
    tournament = score(tournament, first);
    tournament = score(
      tournament,
      tournament.matches.find(
        (match) => match.round === 1 && match.status === "ready",
      )!,
    );
    const semifinal = tournament.matches.find(
      (match) => match.round === 2 && match.status === "ready",
    )!;
    tournament = score(tournament, semifinal);
    tournament.matches.find((match) => match.id === semifinal.id)!.liveScores =
      [9, 3];
    const changed = {
      scores: [0, 2],
      winnerIds: [first.slots[1].participantId!],
      outcome: "played" as const,
      recordedAt: tournament.updatedAt,
    };
    expect(
      getCorrectionImpact(tournament, first.id).map((match) => match.id),
    ).toContain(semifinal.id);
    expect(() => recordResult(tournament, first.id, changed)).toThrow(
      CorrectionRequiredError,
    );
    const corrected = recordResult(tournament, first.id, changed, true);
    expect(
      corrected.matches.find((match) => match.id === semifinal.id)?.status,
    ).toBe("ready");
    expect(
      corrected.matches.find((match) => match.id === semifinal.id)?.result,
    ).toBeUndefined();
    expect(
      corrected.matches.find((match) => match.id === semifinal.id)?.liveScores,
    ).toBeUndefined();
    expect(corrected.metadata.correctionRecovery).toBeDefined();
    expect(
      tournament.matches.find((match) => match.id === semifinal.id)?.result,
    ).toBeDefined();
  });

  it("invalidates derived Swiss pairings after an earlier round correction", () => {
    let tournament = fixture(6, "swiss");
    tournament.stages[0].config.rounds = 2;
    tournament = finish(generateStage(tournament, "main"));
    const first = tournament.matches[0];
    const changed = {
      scores: [0, 2],
      winnerIds: [first.slots[1].participantId!],
      outcome: "played" as const,
      recordedAt: tournament.updatedAt,
    };
    expect(() => recordResult(tournament, first.id, changed)).toThrow(
      CorrectionRequiredError,
    );
    tournament = recordResult(tournament, first.id, changed, true);
    expect(tournament.matches.every((match) => match.round === 1)).toBe(true);
    expect(tournament.stages[0].status).toBe("active");
  });

  it("rejects cyclic stages, duplicate entrants and draw regeneration after play", () => {
    const initial = addPlayoffs(fixture(8));
    initial.stages[0].sources = [
      { stageId: "playoffs", count: 8, perGroup: false },
    ];
    expect(validateGraph(initial)).toContain(
      "Stage dependencies contain a cycle.",
    );
    const duplicate = fixture(4);
    duplicate.stages[0].participantIds.push("p1");
    expect(() => generateStage(duplicate, "main")).toThrow(/Invalid entrants/);
    let tournament = generateStage(fixture(4), "main");
    tournament = score(tournament, tournament.matches[0]);
    expect(() => generateStage(tournament, "main")).toThrow(/played or live/);
  });

  it("schedules resources, dependencies, entrants and rest without conflicts", () => {
    const initial = generateStage(fixture(13), "main");
    initial.schedule.resources = [
      { id: "a", name: "Court A" },
      { id: "b", name: "Court B" },
    ];
    initial.schedule.startAt = "2026-10-20T09:00:00Z";
    const tournament = autoSchedule(initial);
    expect(detectConflicts(tournament)).toEqual([]);
    expect(
      tournament.matches
        .filter((match) => match.status !== "bye")
        .every((match) => match.scheduledAt && match.resourceId),
    ).toBe(true);
    const first = tournament.matches.find((match) => match.scheduledAt)!;
    const second = tournament.matches.find(
      (match) => match.scheduledAt && match.id !== first.id,
    )!;
    second.resourceId = first.resourceId;
    second.scheduledAt = first.scheduledAt;
    expect(
      detectConflicts(tournament).some((message) =>
        message.includes("overlap"),
      ),
    ).toBe(true);
  });

  it("reports unavailable time windows", () => {
    const tournament = generateStage(fixture(4), "main");
    tournament.schedule.startAt = "2026-10-20T09:00:00Z";
    tournament.schedule.resources = [
      { id: "a", name: "Court A", availableUntil: "2026-10-20T09:01:00Z" },
    ];
    expect(() => autoSchedule(tournament)).toThrow(/No available resource/);
  });

  it("simulates independently of the original document", () => {
    const initial = fixture(13);
    const simulation = simulate(initial);
    expect(getChampion(simulation)).toBeDefined();
    expect(initial.matches).toEqual([]);
    expect(initial.status).toBe("draft");
  });

  it("simulates group qualification with default tie-breakers", () => {
    const initial = addPlayoffs(fixture(16, "groups"));
    initial.rules.tieBreakers = ["points", "wins", "differential", "scored"];
    const simulation = simulate(initial);
    expect(simulation.status).toBe("completed");
    expect(getChampion(simulation)?.id).toBe("p1");
    expect(initial.matches).toEqual([]);
  });
});
