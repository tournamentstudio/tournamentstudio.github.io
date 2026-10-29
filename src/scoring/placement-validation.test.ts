import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type MatchResult,
  type Outcome,
} from "../domain/types";
import { parseTournament, validateTournament } from "../domain/validate";
import { generateStage, getStandings, recordResult } from "../engine";

function fixture() {
  const draft = createTournament(
    "Placement rulings",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Entrant ${i + 1}`, i + 1),
    ),
    "free-for-all",
  );
  draft.stages[0].config.rounds = 1;
  return generateStage(draft, draft.stages[0].id);
}

function result(outcome: Outcome, placements?: number[]): MatchResult {
  return {
    scores: [4, 3, 2, 1],
    winnerIds: [],
    outcome,
    placements,
    recordedAt: "2026-10-29T12:00:00.000Z",
  };
}

describe("placement validation across scoring outcomes", () => {
  it.each(["forfeit", "walkover", "no-show", "disqualified"] as const)(
    "rejects an incomplete %s placement table before standings can contain NaN",
    (outcome) => {
      const doc = fixture();
      const match = doc.matches[0];
      const input = {
        ...result(outcome, [1]),
        winnerIds: [match.slots[0].participantId!],
      };
      expect(() => recordResult(doc, match.id, input)).toThrow(
        "valid placement for every entrant",
      );
      expect(doc.matches[0].result).toBeUndefined();
    },
  );

  it.each([
    { label: "empty", placements: [] },
    { label: "unskipped tied place", placements: [1, 1, 2, 4] },
    { label: "missing first place", placements: [2, 2, 3, 4] },
  ])("rejects $label supplied ranks with manual scoring", ({ placements }) => {
    const doc = fixture();
    doc.rules.scoring = "manual";
    const match = doc.matches[0];
    expect(() =>
      recordResult(doc, match.id, {
        ...result("played", placements),
        winnerIds: [match.slots[0].participantId!],
      }),
    ).toThrow(/placement/i);
  });

  it("validates supplied placements even when set scores determine the winner", () => {
    const draft = createTournament("Sets", [
      createParticipant("A", 1),
      createParticipant("B", 2),
    ]);
    draft.rules.scoring = "sets";
    draft.rules.bestOf = 3;
    const doc = generateStage(draft, draft.stages[0].id);
    expect(() =>
      recordResult(doc, doc.matches[0].id, {
        ...result("played", [1]),
        scores: [2, 0],
        sets: [
          [6, 1],
          [6, 2],
        ],
      }),
    ).toThrow("valid placement for every entrant");
  });

  it("rejects incomplete imported ruling placements without changing legacy rulings that omit them", () => {
    const doc = fixture();
    const match = doc.matches[0];
    const completed = recordResult(doc, match.id, {
      ...result("disqualified"),
      winnerIds: [match.slots[0].participantId!],
    });
    expect(validateTournament(completed)).toEqual(completed);
    expect(
      getStandings(completed, completed.stages[0].id).every((row) =>
        Number.isFinite(row.points),
      ),
    ).toBe(true);
    const malformed = structuredClone(completed);
    malformed.matches[0].result!.placements = [1];
    expect(() => parseTournament(JSON.stringify(malformed))).toThrow(
      "valid placement for every entrant",
    );
  });

  it("retains a complete ruled placement table including lower-place ties", () => {
    const doc = fixture();
    const match = doc.matches[0];
    const completed = recordResult(doc, match.id, {
      ...result("walkover", [1, 2, 2, 4]),
      winnerIds: [match.slots[0].participantId!],
    });
    expect(validateTournament(completed)).toEqual(completed);
    expect(
      getStandings(completed, completed.stages[0].id).map((row) => row.points),
    ).toEqual([25, 16.5, 16.5, 12]);
  });
});
