import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { saveAggregateProgress } from "./aggregate";
import { hasMatchEvidence } from "./match-evidence";
import {
  changeMatchState,
  generateStage,
  recordResult,
  simulate,
  CorrectionRequiredError,
} from "./index";

const cup = () => {
  const doc = createTournament(
    "Lifecycle",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "single-elimination",
  );
  return generateStage(doc, doc.stages[0].id);
};
it("returns a completed one-match tournament to ready after reopening", () => {
  const draft = createTournament(
    "Final",
    [createParticipant("A", 1), createParticipant("B", 2)],
    "single-elimination",
  );
  const doc = simulate(generateStage(draft, draft.stages[0].id));
  const reopened = changeMatchState(doc, doc.matches[0].id, "ready", true);
  expect(reopened.status).toBe("ready");
  expect(reopened.stages[0].status).toBe("active");
});
it("requires confirmation before reopening completed matches and saves recovery data", () => {
  const doc = simulate(cup()),
    first = doc.matches[0];
  expect(() => changeMatchState(doc, first.id, "ready")).toThrow(
    CorrectionRequiredError,
  );
  const changed = changeMatchState(doc, first.id, "ready", true);
  expect(
    changed.matches.find((match) => match.id === first.id)?.result,
  ).toBeUndefined();
  expect(
    changed.matches
      .filter((match) =>
        match.slots.some((slot) => slot.source?.matchId === first.id),
      )
      .every((match) => !match.result),
  ).toBe(true);
  expect(changed.metadata.correctionRecovery).toBeTruthy();
  expect(doc.matches.every((match) => match.result)).toBe(true);
  expect(validateTournament(changed)).toEqual(changed);
});
it("keeps postponed and abandoned matches from advancing and permits a final ruling", () => {
  let doc = cup();
  const first = doc.matches[0];
  doc = changeMatchState(doc, first.id, "postponed");
  expect(doc.matches[0].status).toBe("postponed");
  doc = changeMatchState(doc, first.id, "abandoned");
  expect(doc.matches[0].status).toBe("contested");
  expect(doc.matches[0].metadata.awaitingRuling).toBe("abandoned");
  doc = recordResult(doc, first.id, {
    scores: [0, 0],
    winnerIds: [first.slots[0].participantId!],
    outcome: "forfeit",
    recordedAt: doc.updatedAt,
  });
  expect(doc.matches[0].status).toBe("completed");
});
it("rejects cancellation that would invent progression and retains round-robin cancellation", () => {
  const doc = cup();
  expect(() => changeMatchState(doc, doc.matches[0].id, "canceled")).toThrow(
    /needs a decisive ruling/,
  );
  const league = createTournament("League", doc.participants, "round-robin");
  const drawn = generateStage(league, league.stages[0].id);
  const canceled = changeMatchState(drawn, drawn.matches[0].id, "canceled");
  const completed = simulate(canceled);
  expect(completed.matches[0].status).toBe("canceled");
  expect(completed.matches[0].result).toBeUndefined();
});
it("clears invalidated entrant timing and leg progress while preserving paused evidence", () => {
  const doc = simulate(cup()),
    first = doc.matches[0];
  const final = doc.matches.find((match) =>
    match.slots.some((slot) => slot.source?.matchId === first.id),
  )!;
  final.metadata.timing = {
    [final.slots[0].participantId!]: {
      version: 1,
      elapsedMs: 100,
      startedAt: null,
      splits: [],
      evidence: "",
      review: "accepted",
    },
  };
  expect(
    changeMatchState(doc, first.id, "ready", true).matches.find(
      (match) => match.id === final.id,
    )?.metadata.timing,
  ).toBeUndefined();
  const fresh = cup();
  fresh.matches[0].metadata.timing = {
    [fresh.matches[0].slots[0].participantId!]: {
      version: 1,
      elapsedMs: 100,
      startedAt: null,
      splits: [],
      evidence: "",
      review: "accepted",
    },
  };
  expect(
    changeMatchState(fresh, fresh.matches[0].id, "postponed").matches[0]
      .metadata.timing,
  ).toEqual(fresh.matches[0].metadata.timing);
});

it.each(["postponed", "ready"] as const)(
  "requires upstream confirmation when a %s dependent retains scored aggregate legs",
  (state) => {
    let doc = cup();
    doc.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
    };
    const first = doc.matches[0];
    for (const match of doc.matches.filter((item) => item.round === 1)) {
      doc = recordResult(doc, match.id, {
        scores: [2, 0],
        legs: [
          [1, 0],
          [1, 0],
        ],
        winnerIds: [match.slots[0].participantId!],
        outcome: "played",
        recordedAt: doc.updatedAt,
      });
    }
    const final = doc.matches.find((match) => match.round === 2)!;
    doc = changeMatchState(
      saveAggregateProgress(doc, final.id, [[2, 1]]),
      final.id,
      state,
    );
    const correction = {
      scores: [0, 2],
      legs: [
        [0, 1],
        [0, 1],
      ],
      winnerIds: [first.slots[1].participantId!],
      outcome: "played" as const,
      recordedAt: doc.updatedAt,
    };
    try {
      recordResult(doc, first.id, correction);
      throw new Error("Expected correction confirmation");
    } catch (error) {
      expect(error).toBeInstanceOf(CorrectionRequiredError);
      expect(
        (error as CorrectionRequiredError).affected.map((match) => match.id),
      ).toContain(final.id);
    }
    try {
      changeMatchState(doc, first.id, "ready");
      throw new Error("Expected reopen confirmation");
    } catch (error) {
      expect(error).toBeInstanceOf(CorrectionRequiredError);
      expect(
        (error as CorrectionRequiredError).affected.map((match) => match.id),
      ).toContain(final.id);
    }
    const corrected = recordResult(doc, first.id, correction, true);
    expect(
      corrected.matches.find((match) => match.id === final.id)
        ?.aggregateProgress,
    ).toBeUndefined();
    const recovery = corrected.metadata.correctionRecovery as {
      matches: { id: string; aggregateProgress?: number[][] }[];
    }[];
    expect(
      recovery.at(-1)?.matches.find((match) => match.id === final.id)
        ?.aggregateProgress,
    ).toEqual([[2, 1]]);
    expect(
      doc.matches.find((match) => match.id === final.id)?.aggregateProgress,
    ).toEqual([[2, 1]]);
    expect(validateTournament(corrected)).toEqual(corrected);
  },
);

it("detects paused scored evidence consistently without treating automatic byes as played", () => {
  const match = cup().matches[0];
  match.status = "postponed";
  expect(hasMatchEvidence(match)).toBe(false);
  expect(hasMatchEvidence({ ...match, aggregateProgress: [[0, 0]] })).toBe(
    true,
  );
  expect(hasMatchEvidence({ ...match, liveScores: [1, 0] })).toBe(true);
  expect(
    hasMatchEvidence({
      ...match,
      golState: {
        elapsedMs: 0,
        runningSince: new Date().toISOString(),
        period: 0,
        overtime: "none",
      },
    }),
  ).toBe(true);
  expect(
    hasMatchEvidence({
      ...match,
      metadata: {
        timing: {
          [match.slots[0].participantId!]: {
            version: 1,
            elapsedMs: 100,
            startedAt: null,
            splits: [],
            evidence: "",
            review: "pending",
          },
        },
      },
    }),
  ).toBe(true);
  expect(
    hasMatchEvidence({
      ...match,
      status: "bye",
      result: {
        scores: [],
        winnerIds: [match.slots[0].participantId!],
        outcome: "walkover",
        recordedAt: new Date().toISOString(),
      },
    }),
  ).toBe(false);
});
