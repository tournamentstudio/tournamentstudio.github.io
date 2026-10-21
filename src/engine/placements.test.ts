import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { getStandings } from "../standings";
import { decodeCode, encodeCode } from "../sharing";
import {
  generateStage,
  getChampion,
  getCorrectionImpact,
  recordResult,
  simulate,
  validateGraph,
} from "./index";
import { completedPlacementOrder } from "./placements";

function cup(count: number) {
  const doc = createTournament(
    "Full classification",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "single-elimination",
  );
  doc.stages[0].config.fullPlacement = true;
  doc.stages[0].config.thirdPlace = true;
  return generateStage(doc, doc.stages[0].id);
}
describe("single-elimination full placement brackets", () => {
  it.each([1, 2, 3, 5, 7, 8, 13, 16, 31, 64, 127])(
    "determines every rank for %i entrants without phantom participants",
    (count) => {
      const generated = cup(count),
        doc = simulate(generated);
      expect(doc.stages[0].status).toBe("completed");
      const standings = getStandings(doc, doc.stages[0].id);
      expect(standings.map((row) => row.rank)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
      expect(new Set(completedPlacementOrder(doc.matches)).size).toBe(count);
      expect(standings[0].participantId).toBe(getChampion(doc)?.id);
      expect(standings.every((row) => !row.tied)).toBe(true);
      expect(validateTournament(doc)).toEqual(doc);
      expect(validateGraph(doc)).toEqual([]);
      for (const match of doc.matches) {
        const entrants = match.slots.flatMap((slot) =>
          slot.participantId ? [slot.participantId] : [],
        );
        expect(new Set(entrants).size).toBe(entrants.length);
      }
    },
  );

  it("assigns real ranks according to the championship and each placement result", () => {
    let doc = cup(8);
    while (doc.matches.some((match) => match.status === "ready")) {
      const match = doc.matches.find((match) => match.status === "ready")!;
      const winner = match.slots
        .map((slot) => slot.participantId!)
        .sort(
          (a, b) =>
            doc.participants.find((participant) => participant.id === a)!.seed -
            doc.participants.find((participant) => participant.id === b)!.seed,
        )[0];
      doc = recordResult(doc, match.id, {
        scores: match.slots.map((slot) =>
          slot.participantId === winner ? 2 : 0,
        ),
        winnerIds: [winner],
        outcome: "played",
        recordedAt: doc.updatedAt,
      });
    }
    const names = new Map(
      doc.participants.map((participant) => [participant.id, participant.name]),
    );
    expect(
      getStandings(doc, doc.stages[0].id).map((row) =>
        names.get(row.participantId),
      ),
    ).toEqual([
      "Team 1",
      "Team 2",
      "Team 3",
      "Team 4",
      "Team 5",
      "Team 6",
      "Team 7",
      "Team 8",
    ]);
    expect(doc.matches).toHaveLength(12);
    const first = doc.matches.find((match) => match.round === 1)!;
    expect(
      getCorrectionImpact(doc, first.id).some(
        (match) => match.bracket === "placement",
      ),
    ).toBe(true);
  });

  it("preserves third-place match identifiers and portable final standings", async () => {
    const generated = cup(8),
      stage = generated.stages[0];
    expect(
      generated.matches.find((match) => match.label === "Third place")?.id,
    ).toBe(`${stage.id}::placement:3:0`);
    const doc = simulate(generated),
      copy = await decodeCode(await encodeCode(doc));
    expect(copy.stages[0].config.fullPlacement).toBe(true);
    expect(getStandings(copy, stage.id)).toEqual(getStandings(doc, stage.id));
  });

  it("keeps bounded match counts for power-of-two fields through512", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (exponent) => {
        const count = 2 ** exponent,
          doc = cup(count);
        expect(doc.matches).toHaveLength((count / 2) * exponent);
        expect(new Set(doc.matches.map((match) => match.id)).size).toBe(
          doc.matches.length,
        );
        expect(validateGraph(doc)).toEqual([]);
      }),
      { numRuns: 18 },
    );
  });
});
