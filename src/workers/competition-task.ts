import type { Tournament } from "../domain/types";

export type CompetitionTask =
  | { kind: "draw" | "advance"; tournament: Tournament; stageId: string }
  | { kind: "simulate"; tournament: Tournament };

export function requiresCompetitionWorker(
  tournament: Tournament,
  stageId?: string,
) {
  return tournament.stages.some(
    (stage) =>
      (!stageId || stage.id === stageId) &&
      stage.format === "swiss" &&
      Boolean(stage.config.swiss?.federation),
  );
}
