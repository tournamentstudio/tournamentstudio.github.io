import type { Match, Stage } from "../domain/types";

export function orderFixtures(matches: Match[], stages: Stage[]): Match[] {
  const stageOrder = new Map(
    [...stages]
      .sort((first, second) => first.order - second.order)
      .map((stage, index) => [stage.id, index]),
  );
  return [...matches].sort(
    (first, second) =>
      (stageOrder.get(first.stageId) ?? stages.length) -
        (stageOrder.get(second.stageId) ?? stages.length) ||
      first.round - second.round,
  );
}
