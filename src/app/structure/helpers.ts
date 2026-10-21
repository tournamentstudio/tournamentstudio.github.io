import type { Stage, Tournament } from "../../domain/types";
import { ladderPolicy } from "../../domain/ladder";
import { hasMatchEvidence } from "../../engine/match-evidence";

export function sourceGroups(tournament: Tournament, stage?: Stage): string[] {
  if (!stage) return [];
  const groups = [
    ...new Set(
      tournament.matches
        .filter((match) => match.stageId === stage.id && match.group)
        .map((match) => match.group!),
    ),
  ].sort();
  if (groups.length) return groups;
  if (stage.format !== "groups" && stage.format !== "gsl") return [];
  const configured = Array.isArray(stage.config.groups)
    ? stage.config.groups.length
    : stage.format === "gsl"
      ? Math.ceil(stage.participantIds.length / 4)
      : stage.config.groupCount;
  return Array.from({ length: configured }, (_, index) =>
    String.fromCharCode(65 + index),
  );
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
  const played = matches.some(hasMatchEvidence);
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
