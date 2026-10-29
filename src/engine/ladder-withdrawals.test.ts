import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { advanceStage, generateStage, recordResult } from "./index";

function fixture(): Tournament {
  const input = createTournament(
    "Local ladder",
    Array.from({ length: 6 }, (_, i) => ({
      ...createParticipant(`Player ${i + 1}`, i + 1),
      id: `p${i + 1}`,
    })),
    "ladder",
  );
  input.stages[0].config.rounds = 4;
  return finishRound(generateStage(input, input.stages[0].id));
}

function finishRound(input: Tournament): Tournament {
  let next = input;
  for (const match of input.matches.filter((entry) => entry.status === "ready"))
    next = recordResult(next, match.id, {
      scores: [2, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: input.updatedAt,
    });
  return next;
}

describe("adjacent ladder participation changes", () => {
  it("pairs active ranks after withdrawals without rewriting results or rank history", () => {
    const input = fixture();
    input.participants[1].status = "withdrawn";
    input.participants[2].status = "disqualified";
    const original = structuredClone(input);
    const next = advanceStage(input, input.stages[0].id);
    expect(
      next.matches
        .filter((match) => match.round === 2)
        .map((match) => match.slots.map((slot) => slot.participantId)),
    ).toEqual([["p4", "p5"]]);
    expect(next.matches.filter((match) => match.round === 1)).toEqual(
      input.matches,
    );
    expect(next.stages[0].metadata.ladderOrder).toEqual(
      input.stages[0].metadata.ladderOrder,
    );
    expect(next.stages[0].participantIds).toEqual(
      input.stages[0].participantIds,
    );
    expect(validateTournament(next)).toEqual(next);
    expect(input).toEqual(original);
  });

  it("pairs the last two active entrants even in an offset round", () => {
    const input = fixture();
    for (const participant of input.participants.slice(1, 5))
      participant.status = "withdrawn";
    const next = advanceStage(input, input.stages[0].id);
    expect(
      next.matches
        .filter((match) => match.round === 2)
        .map((match) => match.slots.map((slot) => slot.participantId)),
    ).toEqual([["p1", "p6"]]);
  });

  it.each([0, 1])(
    "refuses a new round with %i active entrants without changing the source",
    (count) => {
      const input = fixture();
      for (const participant of input.participants.slice(count))
        participant.status = "withdrawn";
      const original = structuredClone(input);
      expect(() => advanceStage(input, input.stages[0].id)).toThrow(
        "no valid matches",
      );
      expect(input).toEqual(original);
    },
  );
});
