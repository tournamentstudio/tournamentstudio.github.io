import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, getChampion, recordResult, simulate } from "../engine";
import { publicProjection } from "../sharing";
import { weightedScores, type MetricDefinition } from "./metrics";

const definitions: MetricDefinition[] = [
  {
    id: "difficulty",
    name: "Difficulty",
    unit: "points",
    kind: "number",
    min: 0,
    max: 10,
    aggregate: "average",
    weight: 2,
  },
  {
    id: "execution",
    name: "Execution",
    unit: "points",
    kind: "judges",
    min: 0,
    max: 10,
    aggregate: "average",
    judgeCount: 3,
    judgeMethod: "trimmed-mean",
    weight: 1,
  },
];
function fixture(
  format:
    | "single-elimination"
    | "free-for-all"
    | "round-robin" = "single-elimination",
) {
  let doc = createTournament(
    "Judged cup",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Entrant ${i + 1}`, i + 1),
    ),
    format,
  );
  doc.rules.scoring = "weighted";
  doc.rules.metricDefinitions = definitions;
  doc.rules.weightedDirection = "high";
  doc = generateStage(doc, doc.stages[0].id);
  return doc;
}
function result(
  doc: Tournament,
  difficulty = [8, 7],
  execution = [
    [7, 8, 9],
    [8, 9, 10],
  ],
) {
  const metrics = { difficulty, execution };
  return {
    scores: weightedScores(definitions, metrics, difficulty.length),
    metrics,
    winnerIds: [],
    outcome: "played" as const,
    recordedAt: doc.updatedAt,
  };
}
describe("weighted results through the competition engine", () => {
  it("records judge inputs, derives winners and advances the same result", () => {
    const doc = fixture(),
      match = doc.matches.find((m) => m.status === "ready")!;
    const next = recordResult(doc, match.id, result(doc));
    expect(next.matches.find((m) => m.id === match.id)?.result).toMatchObject({
      scores: [24, 23],
      winnerIds: [match.slots[0].participantId],
    });
    expect(
      next.matches
        .at(-1)
        ?.slots.some(
          (slot) => slot.participantId === match.slots[0].participantId,
        ),
    ).toBe(true);
    expect(
      publicProjection(next).matches.find((m) => m.id === match.id)?.result
        ?.metrics,
    ).toEqual(result(doc).metrics);
    expect(validateTournament(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it("rejects disagreement between stored scores, placements and recorded dimensions", () => {
    const doc = fixture(),
      match = doc.matches[0];
    expect(() =>
      recordResult(doc, match.id, { ...result(doc), scores: [25, 23] }),
    ).toThrow("agree with the weighted");
    expect(() =>
      recordResult(doc, match.id, { ...result(doc), placements: [2, 1] }),
    ).toThrow("Placements must agree");
    expect(() =>
      recordResult(doc, match.id, { ...result(doc), metrics: undefined }),
    ).toThrow("every entrant");
    const completed = recordResult(doc, match.id, result(doc));
    completed.matches[0].result!.scores[0] = 25;
    expect(() => validateTournament(completed)).toThrow(
      "agree with the weighted",
    );
  });
  it("supports declared manual rulings without invented metric measurements", () => {
    const doc = fixture(),
      match = doc.matches[0];
    const next = recordResult(doc, match.id, {
      scores: [1, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "forfeit",
      recordedAt: doc.updatedAt,
    });
    expect(next.matches[0].result?.metrics).toBeUndefined();
    expect(validateTournament(next).matches[0].result?.outcome).toBe("forfeit");
  });
  it("handles lower totals and multi-entrant tied placements", () => {
    const doc = fixture("free-for-all"),
      match = doc.matches[0];
    doc.rules.weightedDirection = "low";
    const input = result(
      doc,
      [1, 1, 3, 4],
      [
        [5, 5, 5],
        [5, 5, 5],
        [5, 5, 5],
        [5, 5, 5],
      ],
    );
    const next = recordResult(doc, match.id, {
      ...input,
      placements: [1, 1, 3, 4],
    });
    expect(next.matches[0].result?.winnerIds).toEqual(
      match.slots.slice(0, 2).map((slot) => slot.participantId),
    );
  });
  it("simulates weighted results without changing the original tournament", () => {
    const doc = fixture();
    const next = simulate(doc);
    expect(getChampion(next)?.id).toBe(doc.participants[0].id);
    expect(
      validateTournament(next)
        .matches.filter((m) => m.result)
        .every((m) => m.result?.metrics),
    ).toBe(true);
    expect(doc.matches.every((m) => !m.result)).toBe(true);
  });
  it("records optional descriptive metrics using ordinary sport scoring", () => {
    const doc = fixture("round-robin"),
      match = doc.matches[0];
    doc.rules.scoring = "high";
    const next = recordResult(doc, match.id, {
      ...result(doc),
      scores: [2, 0],
    });
    expect(next.matches[0].result?.metrics?.difficulty).toEqual([8, 7]);
    expect(() =>
      recordResult(doc, match.id, {
        ...result(doc),
        scores: [2, 0],
        metrics: { unknown: [1, 2] },
      }),
    ).toThrow("unknown metric");
  });
});
