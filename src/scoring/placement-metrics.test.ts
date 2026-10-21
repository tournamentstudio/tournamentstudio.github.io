import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult, simulate } from "../engine";
import { metricStatistics } from "./metric-statistics";
import {
  metricDefinitionsSchema,
  resolvedDimensionValues,
  weightedScores,
  type MetricDefinition,
} from "./metrics";
import {
  createResultProposal,
  validateResultProposal,
} from "../sharing/packets";

const place: MetricDefinition = {
  id: "place",
  name: "Finishing place",
  unit: "points",
  kind: "placement",
  min: 1,
  max: 512,
  aggregate: "sum",
  weight: 1,
  placementPoints: [25, 18, 15, 12],
};
const kills: MetricDefinition = {
  id: "kills",
  name: "Eliminations",
  unit: "count",
  kind: "number",
  min: 0,
  max: 1000,
  aggregate: "sum",
  weight: 2,
};
function fixture() {
  let doc = createTournament(
    "Arena",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Team ${i + 1}`, i + 1),
    ),
    "free-for-all",
  );
  doc.rules.scoring = "weighted";
  doc.rules.metricDefinitions = [place, kills];
  doc = generateStage(doc, doc.stages[0].id);
  return doc;
}
describe("placement sourced dimensions", () => {
  it("combines finishing ranks with eliminations and shares tied awards", () => {
    expect(
      weightedScores(
        [place, kills],
        { place: [1, 1, 3, 4], kills: [3, 1, 2, 0] },
        4,
      ),
    ).toEqual([27.5, 23.5, 19, 12]);
    expect(
      resolvedDimensionValues({ ...place, placementPoints: [10] }, [1, 1, 3]),
    ).toEqual([5, 5, 0]);
  });
  it("rejects invalid ranks and incomplete weighted data", () => {
    for (const ranks of [
      [1, 1, 2],
      [2, 3, 4],
      [1.5, 2, 3],
      [0, 2, 3],
      [1, 2, [3]],
    ])
      expect(() => weightedScores([place], { place: ranks }, 3)).toThrow();
    expect(() => weightedScores([place], { place: [1, null, 3] }, 3)).toThrow(
      "every entrant",
    );
    expect(() =>
      metricDefinitionsSchema.parse([{ ...place, placementPoints: undefined }]),
    ).toThrow("ordered points table");
    expect(() =>
      metricDefinitionsSchema.parse([
        { ...place, placementPoints: Array(513).fill(1) },
      ]),
    ).toThrow();
  });
  it("preserves total awards through a complete tie", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000, max: 1000 }), {
          minLength: 2,
          maxLength: 64,
        }),
        (points) => {
          const values = resolvedDimensionValues(
            { ...place, placementPoints: points },
            points.map(() => 1),
          );
          expect(
            values.reduce<number>((sum, value) => sum + value!, 0),
          ).toBeCloseTo(
            points.reduce((sum, value) => sum + value, 0),
            3,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
  it("uses the same tied awards in statistics and imported weighted results", () => {
    const doc = fixture(),
      match = doc.matches[0],
      metrics = { place: [1, 1, 3, 4], kills: [3, 1, 2, 0] };
    const next = recordResult(doc, match.id, {
      scores: weightedScores([place, kills], metrics, 4),
      metrics,
      winnerIds: [],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
    expect(validateTournament(next)).toEqual(next);
    const stats = metricStatistics(
      [place, kills],
      doc.participants.map((p) => p.id),
      next.matches,
    );
    expect(
      stats.find((row) => row.participantId === match.slots[0].participantId)
        ?.values.place,
    ).toEqual({ value: 21.5, matches: 1 });
    next.matches[0].result!.winnerIds = [match.slots[3].participantId!];
    expect(() => validateTournament(next)).toThrow();
  });
  it("simulates configured awards without assuming the seed must win", () => {
    const doc = fixture();
    doc.rules.metricDefinitions = [
      { ...place, placementPoints: [0, 5, 10, 50] },
    ];
    expect(validateTournament(simulate(doc)).matches[0].result?.scores).toEqual(
      [0, 5, 10, 50],
    );
  });
  it("carries weighted metrics and sanctions through reviewed proposals", async () => {
    const doc = fixture(),
      match = doc.matches[0],
      metrics = { place: [1, 2, 3, 4], kills: [1, 0, 0, 0] };
    const proposal = await createResultProposal(doc, match.id, {
      scores: weightedScores([place, kills], metrics, 4),
      metrics,
      fairPlay: [0, 2, 0, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
    expect(
      (await validateResultProposal(doc, proposal)).result.metrics,
    ).toEqual(metrics);
    await expect(
      validateResultProposal(doc, {
        ...proposal,
        result: { ...proposal.result, scores: [99, 18, 15, 12] },
      }),
    ).rejects.toThrow("agree with the weighted");
    const next = recordResult(doc, match.id, proposal.result);
    expect(next.matches[0].result?.fairPlay).toEqual([0, 2, 0, 1]);
    expect(doc.matches[0].result).toBeUndefined();
    await expect(validateResultProposal(next, proposal)).rejects.toThrow(
      "changed",
    );
  });
});
