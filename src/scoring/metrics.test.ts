import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  aggregateMetric,
  dimensionValue,
  metricDefinitionsSchema,
  validateMetrics,
  weightedScores,
  type MetricDefinition,
} from "./metrics";
const kills: MetricDefinition = {
  id: "kills",
  name: "Eliminations",
  unit: "count",
  kind: "number",
  aggregate: "sum",
  min: 0,
  max: 1000,
  weight: 2,
};
const time: MetricDefinition = {
  id: "time",
  name: "Time",
  unit: "seconds",
  kind: "number",
  aggregate: "average",
  min: 0,
  max: 1000,
  weight: -0.5,
};
describe("typed metric calculations", () => {
  it("combines positive and negative weights and normalizes decimal arithmetic", () => {
    expect(
      weightedScores([kills, time], { kills: [4, 2], time: [10, 4] }, 2),
    ).toEqual([3, 2]);
    expect(
      weightedScores([{ ...kills, weight: 0.1 }], { kills: [3] }, 1),
    ).toEqual([0.3]);
  });
  it("requires all scoring inputs while descriptive inputs may be missing", () => {
    expect(
      validateMetrics(
        [{ ...kills, weight: undefined }],
        { kills: [null, 2] },
        2,
      ),
    ).toEqual({ kills: [null, 2] });
    expect(() => weightedScores([kills], { kills: [null, 2] }, 2)).toThrow(
      "every entrant",
    );
    expect(() =>
      weightedScores([{ ...kills, weight: undefined }], {}, 2),
    ).toThrow("nonzero weight");
  });
  it("computes judge sums, means and a single high/low trimmed mean", () => {
    const judges: MetricDefinition = {
      ...kills,
      id: "judges",
      name: "Style",
      kind: "judges",
      judgeCount: 5,
      judgeMethod: "average",
    };
    expect(dimensionValue(judges, [1, 5, 6, 7, 10])).toBe(5.8);
    expect(
      dimensionValue(
        { ...judges, judgeMethod: "trimmed-mean" },
        [1, 5, 6, 7, 10],
      ),
    ).toBe(6);
    expect(
      dimensionValue({ ...judges, judgeMethod: "sum" }, [1, 5, 6, 7, 10]),
    ).toBe(29);
    expect(() => dimensionValue(judges, [5, 6])).toThrow("5 valid judge");
  });
  it("ignores unrecorded values in statistics without inventing zeroes", () => {
    expect(aggregateMetric(kills, [null, undefined])).toBeUndefined();
    expect(aggregateMetric(kills, [null, 1, 3])).toBe(4);
    expect(
      aggregateMetric({ ...kills, aggregate: "average" }, [null, 1, 3]),
    ).toBe(2);
    expect(aggregateMetric({ ...kills, aggregate: "min" }, [null, 1, 3])).toBe(
      1,
    );
    expect(aggregateMetric({ ...kills, aggregate: "max" }, [null, 1, 3])).toBe(
      3,
    );
  });
  it("rejects invalid ranges, duplicate identifiers and executable configurations", () => {
    expect(metricDefinitionsSchema.safeParse([kills, kills]).success).toBe(
      false,
    );
    expect(
      metricDefinitionsSchema.safeParse([{ ...kills, min: 20, max: 10 }])
        .success,
    ).toBe(false);
    expect(
      metricDefinitionsSchema.safeParse([{ ...kills, formula: "eval(value)" }])
        .success,
    ).toBe(false);
    expect(
      metricDefinitionsSchema.safeParse([
        {
          ...kills,
          kind: "judges",
          judgeCount: 2,
          judgeMethod: "trimmed-mean",
        },
      ]).success,
    ).toBe(false);
    expect(() => validateMetrics([kills], { unknown: [1] }, 1)).toThrow(
      "unknown metric",
    );
    expect(() => validateMetrics([kills], { kills: [1] }, 2)).toThrow(
      "one value",
    );
    expect(() => validateMetrics([kills], { kills: [-1] }, 1)).toThrow(
      "between 0 and 1000",
    );
    expect(() => validateMetrics([kills], {}, 513)).toThrow("512 entrants");
    expect(
      metricDefinitionsSchema.safeParse([{ ...kills, id: "__proto__" }])
        .success,
    ).toBe(false);
    expect(() =>
      validateMetrics([kills], JSON.parse('{"constructor":[1]}'), 1),
    ).toThrow();
  });
  it("preserves weighted arithmetic for generated integer inputs", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), {
          minLength: 1,
          maxLength: 64,
        }),
        (scores) => {
          expect(
            weightedScores([kills], { kills: scores }, scores.length),
          ).toEqual(scores.map((score) => score * 2));
        },
      ),
      { numRuns: 100 },
    );
  });
});
