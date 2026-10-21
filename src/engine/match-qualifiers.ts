import type { Tournament } from "../domain/types";

export interface MatchOutcomePick {
  matchId: string;
  outcome: "winners" | "losers";
}

export interface MatchOutcomeSelection {
  participantIds: string[];
  outcomes: (MatchOutcomePick & { participantIds: string[] })[];
  issues: string[];
}

/** Uses recorded outcomes in pick order, independent of standings. */
export function matchResultQualifiers(
  tournament: Tournament,
  sourceStageId: string,
  picks: MatchOutcomePick[],
  expectedCount: number,
): MatchOutcomeSelection {
  const result: MatchOutcomeSelection = {
    participantIds: [],
    outcomes: [],
    issues: [],
  };
  const matches = new Map(
    tournament.matches
      .filter((match) => match.stageId === sourceStageId)
      .map((match) => [match.id, match]),
  );
  for (const pick of picks) {
    const match = matches.get(pick.matchId);
    if (!match) {
      result.issues.push("A selected outcome references a missing source match.");
      continue;
    }
    if (!["completed", "bye"].includes(match.status) || !match.result) {
      result.issues.push("Complete every selected source match before advancing its outcome.");
      continue;
    }
    const entrants = match.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    );
    const winners = match.result.winnerIds;
    if (
      ["draw", "abandoned"].includes(match.result.outcome) ||
      !winners.length ||
      new Set(winners).size !== winners.length ||
      winners.some((id) => !entrants.includes(id)) ||
      (entrants.length > 1 && winners.length === entrants.length)
    ) {
      result.issues.push("A selected source match has no decisive validated outcome.");
      continue;
    }
    // Slot order is stable even when a result lists multiple winners differently.
    const participantIds = entrants.filter((id) =>
      pick.outcome === "winners" ? winners.includes(id) : !winners.includes(id),
    );
    if (!participantIds.length) {
      result.issues.push("A selected source outcome contains no entrants. A bye has no loser.");
      continue;
    }
    result.outcomes.push({ ...pick, participantIds });
    result.participantIds.push(...participantIds);
  }
  if (new Set(result.participantIds).size !== result.participantIds.length)
    result.issues.push("The selected match outcomes qualify the same entrant more than once.");
  if (result.participantIds.length !== expectedCount)
    result.issues.push("The selected match outcomes do not match the expected qualifier count.");
  result.issues = [...new Set(result.issues)];
  return result;
}
