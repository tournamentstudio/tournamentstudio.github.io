import type { Stage, Tournament } from "../../domain/types";
import { ladderPolicy } from "../../domain/ladder";
import { tournamentMatchEvidence } from "../../engine/match-evidence";
import { sourceGroups as stageSourceGroups } from "../../domain/advancement";

export function sourceGroups(tournament: Tournament, stage?: Stage): string[] {
  if (!stage) return [];
  if (
    stage.format !== "groups" &&
    stage.format !== "gsl" &&
    !tournament.matches.some((match) => match.stageId === stage.id && match.group)
  )
    return [];
  return stageSourceGroups(tournament, stage);
}

export function descendantIds(tournament: Tournament, id: string): Set<string> {
  const ids = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of tournament.stages) {
      if (
        !ids.has(stage.id) &&
        stage.sources.some(
          (source) => source.stageId === id || ids.has(source.stageId),
        )
      ) {
        ids.add(stage.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function stageProtection(tournament: Tournament, id: string) {
  const stage = tournament.stages.find((entry) => entry.id === id);
  const initializedChallenge =
    !!stage &&
    stage.format === "ladder" &&
    ladderPolicy(stage).mode === "invitations" &&
    stage.status !== "draft";
  const descendants = descendantIds(tournament, id);
  const matches = tournament.matches.filter((match) => match.stageId === id);
  const drawnDescendants = tournament.stages.filter(
    (stage) =>
      descendants.has(stage.id) &&
      tournament.matches.some((match) => match.stageId === stage.id),
  );
  const played = matches.some(tournamentMatchEvidence(tournament));
  const outcomeConsumers = tournament.stages.some((stage) =>
    stage.sources.some(
      (source) =>
        source.stageId === id && source.selection?.kind === "match-results",
    ),
  );
  return {
    locked:
      initializedChallenge || matches.length > 0 || drawnDescendants.length > 0,
    canReset:
      (initializedChallenge || matches.length > 0) &&
      !played &&
      drawnDescendants.length === 0 &&
      !outcomeConsumers,
    played,
    drawnDescendants,
    matchCount: matches.length,
  };
}
