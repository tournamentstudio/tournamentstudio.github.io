import { expect, it } from "vitest";
import type { Match } from "../domain/types";
import { metricStatistics } from "./metric-statistics";
import type { MetricDefinition, MetricValues } from "./metrics";
const definition: MetricDefinition = {
  id: "fouls",
  name: "Fouls",
  unit: "count",
  kind: "number",
  min: 0,
  max: 1000,
  aggregate: "sum",
};
function match(
  id: string,
  metrics: MetricValues,
  status: Match["status"] = "completed",
) {
  return {
    id,
    stageId: "s",
    round: 1,
    index: 0,
    label: id,
    slots: [{ participantId: "a" }, { participantId: "b" }],
    status,
    result: {
      scores: [2, 1],
      winnerIds: ["a"],
      outcome: "played" as const,
      recordedAt: new Date().toISOString(),
      metrics,
    },
    metadata: {},
  };
}
it("aggregates completed recorded inputs and preserves missing values", () => {
  expect(
    metricStatistics(
      [definition],
      ["a", "b", "c"],
      [
        match("1", { fouls: [1, 2] }),
        match("2", { fouls: [3, null] }),
        match("3", { fouls: [100, 100] }, "bye"),
      ],
    ),
  ).toEqual([
    { participantId: "a", values: { fouls: { value: 4, matches: 2 } } },
    { participantId: "b", values: { fouls: { value: 2, matches: 1 } } },
    { participantId: "c", values: {} },
  ]);
});
it("calculates a mean per played match after judge aggregation", () => {
  const judges: MetricDefinition = {
    ...definition,
    kind: "judges",
    judgeCount: 3,
    judgeMethod: "average",
    aggregate: "average",
  };
  expect(
    metricStatistics(
      [judges],
      ["a"],
      [
        match("1", { fouls: [[1, 2, 3], null] }),
        match("2", { fouls: [[5, 6, 7], null] }),
      ],
    )[0].values.fouls,
  ).toEqual({ value: 4, matches: 2 });
});
