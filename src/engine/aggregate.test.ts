import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { aggregateScores } from "../domain/aggregate";
import { decodeCode, encodeCode, publicProjection } from "../sharing";
import { generateStage, getChampion, recordResult, simulate } from "./index";
import { saveAggregateProgress } from "./aggregate";

function cup(count = 4, tieBreak: "manual" | "extra-leg" = "manual") {
  const doc = createTournament(
    "Aggregate cup",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "single-elimination",
  );
  doc.rules.scoring = "high";
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak };
  return generateStage(doc, doc.stages[0].id);
}
function result(
  doc: ReturnType<typeof cup>,
  legs: number[][],
  winnerId?: string,
) {
  return {
    scores: aggregateScores(legs),
    winnerIds: winnerId ? [winnerId] : [],
    legs,
    outcome: "played" as const,
    recordedAt: doc.updatedAt,
  };
}
describe("aggregate ties", () => {
  it("rejects imported inconsistent live totals and premature extra-leg progress", () => {
    const doc = cup(2, "extra-leg"),
      match = doc.matches[0];
    match.aggregateProgress = [[2, 0]];
    match.liveScores = [9, 0];
    expect(() => validateTournament(doc)).toThrow(/saved leg totals/);
    delete match.liveScores;
    match.aggregateProgress = [
      [2, 0],
      [1, 0],
      [0, 1],
    ];
    expect(() => validateTournament(doc)).toThrow(/extra leg is allowed only/);
  });
  it("keeps partial progress without advancement, then uses the total across both legs", () => {
    let doc = cup(),
      match = doc.matches.find((item) => item.status === "ready")!;
    doc = saveAggregateProgress(doc, match.id, [[3, 1]]);
    expect(
      doc.matches.find((item) => item.id === match.id)?.liveScores,
    ).toEqual([3, 1]);
    expect(
      doc.matches
        .filter((item) => item.status === "pending")
        .every((item) => item.slots.every((slot) => !slot.participantId)),
    ).toBe(true);
    expect(() => recordResult(doc, match.id, result(doc, [[3, 1]]))).toThrow(
      /every required/,
    );
    doc = recordResult(
      doc,
      match.id,
      result(doc, [
        [3, 1],
        [0, 4],
      ]),
    );
    match = doc.matches.find((item) => item.id === match.id)!;
    expect(match.result?.winnerIds).toEqual([match.slots[1].participantId]);
    expect(match.aggregateProgress).toBeUndefined();
    expect(validateTournament(doc)).toEqual(doc);
  });
  it("requires an explicit tiebreak and enforces extra-leg eligibility", () => {
    const doc = cup(2),
      match = doc.matches[0],
      winner = match.slots[0].participantId!;
    const tied = result(
      doc,
      [
        [1, 0],
        [0, 1],
      ],
      winner,
    );
    expect(() => recordResult(doc, match.id, tied)).toThrow(/agreed aggregate/);
    expect(
      getChampion(
        recordResult(doc, match.id, {
          ...tied,
          aggregateTiebreakWinnerId: winner,
        }),
      )?.id,
    ).toBe(winner);
    const extra = cup(2, "extra-leg"),
      fixture = extra.matches[0];
    expect(() =>
      recordResult(
        extra,
        fixture.id,
        result(extra, [
          [1, 0],
          [0, 1],
        ]),
      ),
    ).toThrow(/configured extra/);
    expect(() =>
      recordResult(
        extra,
        fixture.id,
        result(extra, [
          [1, 0],
          [1, 0],
          [0, 1],
        ]),
      ),
    ).toThrow(/only when/);
    const completed = recordResult(
      extra,
      fixture.id,
      result(extra, [
        [1, 0],
        [0, 1],
        [0, 2],
      ]),
    );
    expect(getChampion(completed)?.id).toBe(fixture.slots[1].participantId);
  });
  it("rejects mismatched totals, mixed scoring, invalid policies and out-of-policy schedules", () => {
    const doc = cup(2),
      match = doc.matches[0];
    expect(() =>
      recordResult(doc, match.id, {
        ...result(doc, [
          [2, 0],
          [1, 0],
        ]),
        scores: [2, 0],
      }),
    ).toThrow(/sum/);
    expect(() =>
      recordResult(doc, match.id, {
        ...result(doc, [
          [2, 0],
          [1, 0],
        ]),
        sets: [[1, 0]],
      }),
    ).toThrow(/set or placement/);
    doc.matches[0].legSchedule = [{ leg: 3, scheduledAt: doc.updatedAt }];
    expect(() => validateTournament(doc)).toThrow(/configured aggregate/);
    delete doc.matches[0].legSchedule;
    doc.rules.scoring = "sets";
    expect(() => validateTournament(doc)).toThrow(
      /highest-score or lowest-score/,
    );
  });
  it("preserves public leg scores and schedules through portable sharing", async () => {
    let doc = cup(3),
      match = doc.matches.find((item) => item.status === "ready")!;
    doc = saveAggregateProgress(doc, match.id, [[4, 2]]);
    match = doc.matches.find((item) => item.id === match.id)!;
    match.legSchedule = [
      { leg: 1, scheduledAt: doc.updatedAt },
      {
        leg: 2,
        scheduledAt: new Date(
          Date.parse(doc.updatedAt) + 3600000,
        ).toISOString(),
      },
    ];
    const copy = await decodeCode(await encodeCode(doc));
    expect(
      copy.matches.find((item) => item.id === match.id)?.legSchedule,
    ).toEqual(match.legSchedule);
    expect(
      publicProjection(doc).matches.find((item) => item.id === match.id)
        ?.aggregateProgress,
    ).toEqual([[4, 2]]);
  });
  it.each([3, 8, 13])(
    "simulates %i entrant aggregate brackets including byes",
    (count) => {
      const doc = simulate(cup(count));
      expect(doc.stages[0].status).toBe("completed");
      expect(
        doc.matches
          .filter((match) => match.status === "completed")
          .every((match) => match.result?.legs?.length === 2),
      ).toBe(true);
      expect(validateTournament(doc)).toEqual(doc);
    },
  );
  it("supports lower aggregate scores and decisive no-show rulings", () => {
    const doc = cup(2),
      match = doc.matches[0];
    doc.rules.scoring = "low";
    expect(
      getChampion(
        recordResult(
          doc,
          match.id,
          result(doc, [
            [3, 1],
            [1, 2],
          ]),
        ),
      )?.id,
    ).toBe(match.slots[1].participantId);
    expect(
      getChampion(
        recordResult(doc, match.id, {
          scores: [0, 0],
          winnerIds: [match.slots[0].participantId!],
          outcome: "no-show",
          recordedAt: doc.updatedAt,
        }),
      )?.id,
    ).toBe(match.slots[0].participantId);
  });
  it("releases a provisional extra-leg reservation after a decisive regulation total", () => {
    const doc = cup(2, "extra-leg"),
      match = doc.matches[0];
    match.legSchedule = [1, 2, 3].map((leg) => ({
      leg,
      scheduledAt: new Date(
        Date.parse(doc.updatedAt) + leg * 3600000,
      ).toISOString(),
    }));
    const completed = recordResult(
      doc,
      match.id,
      result(doc, [
        [1, 0],
        [2, 0],
      ]),
    );
    expect(completed.matches[0].legSchedule?.map((entry) => entry.leg)).toEqual(
      [1, 2],
    );
    expect(doc.matches[0].legSchedule).toHaveLength(3);
  });
  it("uses optional regulation away goals before extra legs with alternating hosts", () => {
    const doc = cup(2, "extra-leg"),
      match = doc.matches[0];
    doc.stages[0].config.aggregate!.awayGoals = true;
    const outcome = result(doc, [
      [2, 1],
      [0, 1],
    ]);
    const completed = recordResult(doc, match.id, outcome);
    expect(completed.matches[0].result!.winnerIds).toEqual([
      match.slots[1].participantId,
    ]);
    expect(validateTournament(completed)).toEqual(completed);
    expect(() =>
      recordResult(doc, match.id, {
        ...outcome,
        winnerIds: [match.slots[0].participantId!],
      }),
    ).toThrow(/away-goal totals/);
    expect(() =>
      recordResult(doc, match.id, {
        ...outcome,
        aggregateTiebreakWinnerId: match.slots[0].participantId,
      }),
    ).toThrow(/cannot be replaced/);
    expect(() =>
      recordResult(
        doc,
        match.id,
        result(doc, [
          [2, 1],
          [0, 1],
          [1, 0],
        ]),
      ),
    ).toThrow(/extra leg is allowed only/);
    const tied = recordResult(doc, match.id, {
      ...result(
        doc,
        [
          [1, 0],
          [0, 1],
          [0, 0],
        ],
        match.slots[0].participantId,
      ),
      aggregateTiebreakWinnerId: match.slots[0].participantId,
    });
    expect(tied.matches[0].result!.winnerIds).toEqual([
      match.slots[0].participantId,
    ]);
  });
  it("validates away-goal policy, negative inputs and imported official winners", () => {
    const doc = cup(2),
      match = doc.matches[0];
    doc.stages[0].config.aggregate!.awayGoals = true;
    expect(() =>
      recordResult(
        doc,
        match.id,
        result(doc, [
          [-1, 0],
          [2, 0],
        ]),
      ),
    ).toThrow(/nonnegative/);
    doc.stages[0].config.aggregate!.legs = 3;
    expect(() => validateTournament(doc)).toThrow(/even number/);
    doc.stages[0].config.aggregate!.legs = 2;
    doc.rules.scoring = "low";
    expect(() => validateTournament(doc)).toThrow(/highest-score rules/);
    doc.rules.scoring = "high";
    const completed = recordResult(
      doc,
      match.id,
      result(doc, [
        [2, 0],
        [1, 0],
      ]),
    );
    completed.matches[0].result!.winnerIds = [match.slots[1].participantId!];
    expect(() => validateTournament(completed)).toThrow(
      /calculated or ruled winner/,
    );
  });
});
