import { expect, it } from "vitest";
import fc from "fast-check";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { decodeCode, encodeCode } from "../sharing";
import {
  generateStage,
  getChampion,
  getCorrectionImpact,
  getStandings,
  recordResult,
  simulate,
} from "./index";

function cup(count: number, reset = true) {
  const doc = createTournament(
    "Double classification",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`Team ${i + 1}`, i + 1),
    ),
    "double-elimination",
  );
  doc.stages[0].config.fullPlacement = true;
  doc.stages[0].config.grandFinalReset = reset;
  return generateStage(doc, doc.stages[0].id);
}
it.each([2, 3, 5, 7, 8, 13, 16, 31, 64, 127])(
  "determines every final place for %i double-elimination entrants",
  (count) => {
    const doc = simulate(cup(count));
    const rows = getStandings(doc, doc.stages[0].id);
    expect(doc.stages[0].status).toBe("completed");
    expect(rows.map((row) => row.rank)).toEqual(
      Array.from({ length: count }, (_, i) => i + 1),
    );
    expect(rows.every((row) => !row.tied)).toBe(true);
    expect(rows[0].participantId).toBe(getChampion(doc)?.id);
    expect(validateTournament(doc)).toEqual(doc);
  },
);
it("preserves championship drops and ranks the reset winner first", async () => {
  let doc = cup(8);
  const baseline = structuredClone(doc);
  baseline.stages[0].config.fullPlacement = false;
  baseline.matches = [];
  const normal = generateStage(baseline, baseline.stages[0].id);
  expect(
    doc.matches
      .filter((match) => match.bracket !== "placement")
      .map((match) => ({
        ...match,
        metadata: { ...match.metadata, placementLossRank: undefined },
      })),
  ).toEqual(
    normal.matches.map((match) => ({
      ...match,
      metadata: { ...match.metadata, placementLossRank: undefined },
    })),
  );
  while (doc.matches.some((match) => match.status === "ready")) {
    const match = doc.matches.find((item) => item.status === "ready")!;
    const index =
      match.bracket === "final" || match.bracket === "reset" ? 1 : 0;
    doc = recordResult(doc, match.id, {
      scores: [index ? 0 : 2, index ? 2 : 0],
      winnerIds: [match.slots[index].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
  }
  const reset = doc.matches.find((match) => match.bracket === "reset")!;
  expect(reset.status).toBe("completed");
  expect(getStandings(doc, doc.stages[0].id)[0].participantId).toBe(
    reset.result!.winnerIds[0],
  );
  expect(
    getCorrectionImpact(
      doc,
      doc.matches.find(
        (match) => match.bracket === "losers" && match.round === 1,
      )!.id,
    ).some((match) => match.bracket === "placement"),
  ).toBe(true);
  const copy = await decodeCode(await encodeCode(doc));
  expect(getStandings(copy, doc.stages[0].id)).toEqual(
    getStandings(doc, doc.stages[0].id),
  );
});
it("keeps each second-loss cohort separate and generated matches bounded through512", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 9 }), (exponent) => {
      const count = 2 ** exponent,
        doc = cup(count, false);
      expect(doc.matches.length).toBeLessThanOrEqual(count * (exponent + 2));
      expect(new Set(doc.matches.map((match) => match.id)).size).toBe(
        doc.matches.length,
      );
      for (const match of doc.matches.filter(
        (item) => item.bracket === "placement",
      )) {
        const parents = match.slots.map((slot) =>
          doc.matches.find((item) => item.id === slot.source?.matchId)!,
        );
        expect(parents[0].bracket).toBe(parents[1].bracket);
        expect(parents[0].round).toBe(parents[1].round);
      }
    }),
    { numRuns: 18 },
  );
});
