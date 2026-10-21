import type { Match } from "../domain/types";
import {
  aggregateResolvedMetric,
  resolvedDimensionValues,
  type MetricDefinition,
  type MetricValues,
} from "./metrics";

export interface MetricSummary {
  participantId: string;
  values: Record<string, { value: number; matches: number }>;
}
export function metricStatistics(
  definitions: MetricDefinition[],
  participantIds: string[],
  matches: (Omit<Match, "result"> & {
    result?: Match["result"] & { metrics?: MetricValues };
  })[],
): MetricSummary[] {
  const participants = new Set(participantIds);
  const inputs = new Map<string, Map<string, number[]>>();
  for (const match of matches) {
    if (match.status !== "completed" || !match.result?.metrics) continue;
    for (const [dimensionId, entries] of Object.entries(match.result.metrics)) {
      const definition = definitions.find((item) => item.id === dimensionId);
      if (!definition) continue;
      const resolved = resolvedDimensionValues(definition, entries);
      match.slots.forEach((slot, index) => {
        const id = slot.participantId,
          value = resolved[index];
        if (
          !id ||
          !participants.has(id) ||
          value === null ||
          value === undefined
        )
          return;
        let dimensions = inputs.get(id);
        if (!dimensions) {
          dimensions = new Map();
          inputs.set(id, dimensions);
        }
        const values = dimensions.get(dimensionId) ?? [];
        values.push(value);
        dimensions.set(dimensionId, values);
      });
    }
  }
  return participantIds.map((participantId) => {
    const values: MetricSummary["values"] = {};
    for (const definition of definitions) {
      const recorded = inputs.get(participantId)?.get(definition.id) ?? [];
      const value = aggregateResolvedMetric(definition, recorded);
      if (value !== undefined)
        values[definition.id] = { value, matches: recorded.length };
    }
    return { participantId, values };
  });
}
