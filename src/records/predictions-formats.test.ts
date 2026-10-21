import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Tournament,
} from "../domain/types";
import { advanceStage, generateStage, recordResult } from "../engine";
import { admitSwissEntrant, setSwissPolicy } from "../engine/swiss-controls";
import { swissPolicy } from "../domain/swiss";
import {
  freezePrediction as freezeLegacy,
  encodePrediction as encodeLegacy,
} from "./prediction-legacy";
import {
  decodePrediction,
  encodePrediction,
  freezePrediction,
  predictionDrawHash,
  predictionRows,
  predictionScore,
  predictionScopeKey,
  validatePrediction,
  type PredictionChoices,
} from "./predictions";
import { readRecords, withRecords } from "./model";
import {
  readPlayerStatistics,
  savePlayerEvent,
  withPlayerStatistics,
  deletePlayerEvent,
} from "../players/model";

function fixture(format: FormatId, count = 8): Tournament {
  const doc = createTournament(
    "Prediction formats",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    format,
  );
  doc.stages[0].config.groupCount = 2;
  doc.stages[0].config.rounds = 3;
  doc.stages[0].config.capacity = 4;
  doc.rules.allowDraws = ["round-robin", "groups", "swiss"].includes(format);
  return generateStage(doc, doc.stages[0].id);
}
function choices(doc: Tournament, reset = false): PredictionChoices {
  const picks: PredictionChoices = {};
  for (let iteration = 0; iteration < doc.matches.length + 1; iteration++) {
    for (const row of predictionRows(doc, doc.stages[0].id, picks)) {
      if (row.automatic || row.waiting || row.pick) continue;
      picks[row.match.id] = row.placement
        ? {
            outcome: "placements",
            ranks: row.entrants.map((participantId, index) => ({
              participantId,
              rank: index + 1,
            })),
          }
        : row.entrants[reset && row.match.bracket === "final" ? 1 : 0];
    }
  }
  return picks;
}
function playRound(doc: Tournament) {
  let next = doc;
  for (const match of next.matches.filter((match) => match.status === "ready"))
    next = recordResult(next, match.id, {
      scores: [3, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
  return next;
}

describe("predictions across formats", () => {
  it("preserves historical Swiss scopes across late entries and future pairing policies", async () => {
    const initial = fixture("swiss", 5);
    const packet = await freezePrediction(
      initial,
      initial.stages[0].id,
      "Opening pairings",
      choices(initial),
    );
    let doc = playRound(initial);
    doc = setSwissPolicy(doc, doc.stages[0].id, {
      ...swissPolicy(doc.stages[0]),
      allowLateEntrants: true,
      colorPolicy: "balanced",
      preferences: { [doc.participants[0].id]: "second" },
    });
    doc = admitSwissEntrant(doc, doc.stages[0].id, "Late player", 1);
    doc = advanceStage(doc, doc.stages[0].id);
    expect(await validatePrediction(doc, packet)).toEqual(packet);
    const scoringChange = structuredClone(doc);
    scoringChange.rules.allowDraws = false;
    await expect(validatePrediction(scoringChange, packet)).rejects.toThrow(
      "different tournament draw",
    );
  });
  it("retains player-event evidence after deletion and blocks late predictions", async () => {
    let doc = fixture("single-elimination", 4);
    const match = doc.matches[0],
      team = doc.participants.find(
        (entry) => entry.id === match.slots[0].participantId,
      )!;
    team.roster = [{ id: "captain", name: "Captain", role: "captain" }];
    doc = withPlayerStatistics(doc, {
      version: 1,
      metrics: [
        {
          id: "goals",
          label: "Goals",
          unit: "goals",
          type: "integer",
          aggregation: "sum",
          min: 0,
          max: 100,
          archived: false,
        },
      ],
      events: [],
    });
    doc = savePlayerEvent(doc, {
      matchId: match.id,
      teamId: team.id,
      playerId: "captain",
      metricId: "goals",
      value: 1,
      period: "First",
      notes: "",
    });
    await expect(
      freezePrediction(doc, doc.stages[0].id, "Late event", choices(doc)),
    ).rejects.toThrow("recorded play");
    doc = deletePlayerEvent(
      doc,
      readPlayerStatistics(doc).events[0].id,
      "Incorrect scorer",
    );
    await expect(
      freezePrediction(doc, doc.stages[0].id, "Deleted event", choices(doc)),
    ).rejects.toThrow("recorded play");
  });
  it.each([
    "double-elimination",
    "gsl",
    "gauntlet",
    "round-robin",
    "groups",
    "swiss",
    "triple-elimination",
    "ladder",
    "free-for-all",
    "time-trial",
    "grand-prix",
  ] satisfies FormatId[])(
    "freezes and transfers complete %s predictions",
    async (format) => {
      const doc = fixture(format);
      const packet = await freezePrediction(
        doc,
        doc.stages[0].id,
        "پیش‌بینی من",
        choices(doc),
      );
      expect(packet.version).toBe(2);
      expect(await decodePrediction(await encodePrediction(packet))).toEqual(
        packet,
      );
      expect((await validatePrediction(doc, packet)).id).toBe(packet.id);
      expect(packet.picks.length).toBeGreaterThan(0);
      const saved = readRecords(doc);
      saved.predictions.push({
        packet,
        imported: false,
        receivedAt: packet.frozenAt,
      });
      expect(
        readRecords(withRecords(doc, saved)).predictions[0].packet,
      ).toEqual(packet);
    },
  );

  it.each([false, true])(
    "handles the conditional grand final reset (%s)",
    async (reset) => {
      let doc = fixture("double-elimination");
      const initial = structuredClone(doc);
      const selected = choices(doc, reset);
      const packet = await freezePrediction(
        doc,
        doc.stages[0].id,
        "Double elimination",
        selected,
      );
      expect(packet.picks).toHaveLength(15);
      for (let iteration = 0; iteration < 30; iteration++) {
        const match = doc.matches.find((entry) => entry.status === "ready");
        if (!match) break;
        const winnerId = selected[match.id];
        expect(typeof winnerId).toBe("string");
        doc = recordResult(doc, match.id, {
          scores: match.slots.map((slot) =>
            slot.participantId === winnerId ? 3 : 1,
          ),
          winnerIds: [String(winnerId)],
          outcome: "played",
          recordedAt: new Date().toISOString(),
        });
      }
      expect(
        doc.matches.find((match) => match.bracket === "reset")?.status,
      ).toBe(reset ? "completed" : "canceled");
      expect(predictionScore(doc, packet)).toEqual({
        correct: 15,
        incorrect: 0,
        pending: 0,
      });
      expect(await predictionDrawHash(doc, doc.stages[0].id)).toBe(
        await predictionDrawHash(initial, initial.stages[0].id),
      );
      expect(await validatePrediction(doc, packet)).toEqual(packet);
      const opposite = await freezePrediction(
        initial,
        initial.stages[0].id,
        "Opposite final",
        choices(initial, !reset),
      );
      expect(predictionScore(doc, opposite).incorrect).toBeGreaterThanOrEqual(
        2,
      );
    },
  );

  it("propagates classification winner and loser paths without using actual results", async () => {
    let doc = fixture("double-elimination", 7);
    doc.stages[0].config.fullPlacement = true;
    doc = generateStage(doc, doc.stages[0].id);
    const initialRows = predictionRows(doc, doc.stages[0].id, choices(doc));
    expect(
      initialRows.some((row) => row.match.bracket === "placement" && row.pick),
    ).toBe(true);
    const packet = await freezePrediction(
      doc,
      doc.stages[0].id,
      "Classification",
      choices(doc),
    );
    const ready = doc.matches.find((match) => match.status === "ready")!;
    const after = recordResult(doc, ready.id, {
      scores: [0, 1],
      winnerIds: [ready.slots[1].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect(
      predictionRows(after, after.stages[0].id, choices(doc)).map(
        (row) => row.pick,
      ),
    ).toEqual(initialRows.map((row) => row.pick));
    expect(await validatePrediction(after, packet)).toEqual(packet);
  });

  it.each(["swiss", "triple-elimination", "ladder"] satisfies FormatId[])(
    "keeps old %s scopes valid after a later round",
    async (format) => {
      const initial = fixture(format, 7);
      const packet = await freezePrediction(
        initial,
        initial.stages[0].id,
        "Round one",
        choices(initial),
      );
      expect(
        packet.version === 2 &&
          packet.scope.kind === "round" &&
          packet.scope.round,
      ).toBe(1);
      const next = advanceStage(playRound(initial), initial.stages[0].id);
      const later = await freezePrediction(
        next,
        next.stages[0].id,
        "Round two",
        choices(next),
      );
      expect(await validatePrediction(next, packet)).toEqual(packet);
      expect(predictionScopeKey(packet)).not.toBe(predictionScopeKey(later));
      const changed = structuredClone(next);
      changed.matches
        .find((match) => match.round === 1 && match.status !== "bye")!
        .slots.reverse();
      await expect(validatePrediction(changed, packet)).rejects.toThrow(
        "different tournament draw",
      );
    },
  );

  it("scores draws and voids canceled matches without guessing results", async () => {
    let doc = fixture("round-robin", 3);
    const selected = choices(doc);
    const first = doc.matches[0];
    selected[first.id] = { outcome: "draw" };
    const packet = await freezePrediction(
      doc,
      doc.stages[0].id,
      "League",
      selected,
    );
    doc = recordResult(doc, first.id, {
      scores: [1, 1],
      winnerIds: [],
      outcome: "draw",
      recordedAt: new Date().toISOString(),
    });
    doc.matches[1].status = "canceled";
    expect(predictionScore(doc, packet)).toEqual({
      correct: 1,
      incorrect: 0,
      pending: 1,
      voided: 1,
    });
  });

  it("requires complete competition ranks, supports ties and scores exact placements", async () => {
    let doc = fixture("free-for-all", 4);
    doc.rules.scoring = "placement";
    const selected = choices(doc),
      first = doc.matches[0];
    const ranks = first.slots.map((slot, index) => ({
      participantId: slot.participantId!,
      rank: index < 2 ? 1 : index + 1,
    }));
    selected[first.id] = { outcome: "placements", ranks };
    const packet = await freezePrediction(
      doc,
      doc.stages[0].id,
      "Tied podium",
      selected,
    );
    doc = recordResult(doc, first.id, {
      scores: [25, 25, 15, 12],
      winnerIds: ranks
        .filter((entry) => entry.rank === 1)
        .map((entry) => entry.participantId),
      placements: [1, 1, 3, 4],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect(predictionScore(doc, packet).correct).toBe(1);
    const invalid = choices(fixture("free-for-all", 4));
    const fresh = fixture("free-for-all", 4);
    const invalidRanks = fresh.matches[0].slots.map((slot, index) => ({
      participantId: slot.participantId!,
      rank: [1, 1, 2, 4][index],
    }));
    await expect(
      freezePrediction(fresh, fresh.stages[0].id, "Invalid ties", {
        ...invalid,
        [fresh.matches[0].id]: { outcome: "placements", ranks: invalidRanks },
      }),
    ).rejects.toThrow("valid outcome");
  });

  it.each(["time-trial", "grand-prix"] satisfies FormatId[])(
    "derives complete %s ranks from entered scores",
    async (format) => {
      let doc = fixture(format, 4);
      doc.rules.scoring = format === "time-trial" ? "time" : "high";
      const packet = await freezePrediction(
        doc,
        doc.stages[0].id,
        "Race",
        choices(doc),
      );
      const first = doc.matches[0];
      doc = recordResult(doc, first.id, {
        scores: format === "time-trial" ? [10, 20, 30, 40] : [40, 30, 20, 10],
        winnerIds: [first.slots[0].participantId!],
        outcome: "played",
        recordedAt: new Date().toISOString(),
      });
      expect(predictionScore(doc, packet).correct).toBe(1);
    },
  );

  it("uses time-trial format direction even with high-score rule defaults", async () => {
    let doc = fixture("time-trial", 4);
    doc.stages[0].config.rounds = 1;
    doc = generateStage(doc, doc.stages[0].id);
    expect(doc.rules.scoring).toBe("high");
    const packet = await freezePrediction(
      doc,
      doc.stages[0].id,
      "Ascending times",
      choices(doc),
    );
    const match = doc.matches[0];
    doc = recordResult(doc, match.id, {
      scores: [10, 20, 30, 40],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect(predictionScore(doc, packet)).toEqual({
      correct: 1,
      incorrect: 0,
      pending: 0,
    });
  });

  it.each([
    "forfeit",
    "walkover",
    "no-show",
    "disqualified",
    "manual",
  ] as const)(
    "voids full placement predictions when %s supplies only a winner",
    async (outcome) => {
      let doc = fixture("free-for-all", 4);
      doc.stages[0].config.rounds = 1;
      if (outcome === "manual") doc.rules.scoring = "manual";
      doc = generateStage(doc, doc.stages[0].id);
      const match = doc.matches[0];
      const packet = await freezePrediction(
        doc,
        doc.stages[0].id,
        "No invented ranks",
        {
          [match.id]: {
            outcome: "placements",
            ranks: match.slots.map((slot) => ({
              participantId: slot.participantId!,
              rank: 1,
            })),
          },
        },
      );
      doc = recordResult(doc, match.id, {
        scores: [0, 0, 0, 0],
        winnerIds: [match.slots[0].participantId!],
        outcome: outcome === "manual" ? "played" : outcome,
        recordedAt: new Date().toISOString(),
      });
      expect(predictionScore(doc, packet)).toEqual({
        correct: 0,
        incorrect: 0,
        pending: 0,
        voided: 1,
      });
    },
  );

  it("scores explicit complete administrative placements and voids contradictory ranks", async () => {
    let doc = fixture("free-for-all", 4);
    doc.stages[0].config.rounds = 1;
    doc = generateStage(doc, doc.stages[0].id);
    const packet = await freezePrediction(
      doc,
      doc.stages[0].id,
      "Recorded ruling ranks",
      choices(doc),
    );
    const match = doc.matches[0];
    const input = {
      scores: [0, 0, 0, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "forfeit" as const,
      recordedAt: new Date().toISOString(),
    };
    const complete = recordResult(doc, match.id, {
      ...input,
      placements: [1, 2, 3, 4],
    });
    expect(predictionScore(complete, packet)).toEqual({
      correct: 1,
      incorrect: 0,
      pending: 0,
    });
    const contradictory = recordResult(doc, match.id, {
      ...input,
      placements: [2, 1, 3, 4],
    });
    expect(predictionScore(contradictory, packet)).toEqual({
      correct: 0,
      incorrect: 0,
      pending: 0,
      voided: 1,
    });
  });

  it("binds rules and draw, preserves legacy packets and keeps legacy scoring separate", async () => {
    const doc = fixture("single-elimination", 4);
    const selected = choices(doc) as Record<string, string>;
    const old = await freezeLegacy(doc, doc.stages[0].id, "Legacy", selected);
    expect(await decodePrediction(await encodeLegacy(old))).toEqual(old);
    expect(await validatePrediction(doc, old)).toEqual(old);
    const current = await freezePrediction(
      doc,
      doc.stages[0].id,
      "Current",
      selected,
    );
    expect(predictionScopeKey(current)).not.toBe(predictionScopeKey(old));
    const changed = structuredClone(doc);
    changed.rules.allowDraws = true;
    await expect(validatePrediction(changed, current)).rejects.toThrow(
      "different tournament draw",
    );
    const duplicate = {
      ...current,
      picks: [...current.picks, current.picks[0]],
    };
    await expect(validatePrediction(doc, duplicate)).rejects.toThrow(
      "same match twice",
    );
  });

  it.each(["aggregate", "hands", "live-score", "timer", "concealed"])(
    "blocks a freeze after %s evidence despite a postponed status",
    async (kind) => {
      const doc = fixture("single-elimination", 4),
        match = doc.matches[0];
      match.status = "postponed";
      if (kind === "aggregate") match.aggregateProgress = [[1, 0]];
      if (kind === "hands")
        match.hands = [
          {
            id: "hand",
            at: new Date().toISOString(),
            guessingTeamId: "a",
            concealingTeamId: "b",
            points: 1,
            awardedToId: "a",
            action: "guess",
          },
        ];
      if (kind === "live-score") match.liveScores = [1, 0];
      if (kind === "timer") match.metadata.timing = { invalid: "must reject" };
      if (kind === "concealed") match.private = { concealedPosition: "secret" };
      await expect(
        freezePrediction(doc, doc.stages[0].id, "Too late", choices(doc)),
      ).rejects.toThrow("recorded play");
    },
  );
});
