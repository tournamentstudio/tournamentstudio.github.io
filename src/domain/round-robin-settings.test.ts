import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "./types";
import { parseTournament, validateTournament } from "./validate";
import { generateStage } from "../engine";

describe("round-robin meeting limits", () => {
  for (const format of ["round-robin", "groups"] as const) {
    for (const meetings of [11, 12]) {
      it(`saves and restores ${meetings} meetings in ${format}`, () => {
        const draft = createTournament(
          "Repeated meetings",
          Array.from({ length: 4 }, (_, index) =>
            createParticipant(`Team ${index + 1}`, index + 1),
          ),
          format,
        );
        draft.stages[0].config.meetings = meetings;
        draft.stages[0].config.groupCount = 2;
        expect(validateTournament(draft).stages[0].config.meetings).toBe(
          meetings,
        );
        const generated = generateStage(draft, draft.stages[0].id);
        const restored = parseTournament(JSON.stringify(generated));
        expect(restored.matches).toHaveLength(
          meetings * (format === "groups" ? 2 : 6),
        );
        expect(restored).toEqual(generated);
      });
    }
  }

  it.each([0, -1, 2.5, 13, NaN, Infinity])(
    "rejects an invalid meeting count of %s",
    (meetings) => {
      const draft = createTournament(
        "Invalid meetings",
        [createParticipant("Team A", 1), createParticipant("Team B", 2)],
        "round-robin",
      );
      draft.stages[0].config.meetings = meetings;
      expect(() => validateTournament(draft)).toThrow();
      expect(() => generateStage(draft, draft.stages[0].id)).toThrow();
    },
  );
});
