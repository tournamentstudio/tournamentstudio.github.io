import type { Tournament } from "../domain/types";
import {
  aggregateAwayWinner,
  aggregateScores,
  legScoresSchema,
} from "../domain/aggregate";

export function saveAggregateProgress(
  input: Tournament,
  matchId: string,
  legs: number[][],
): Tournament {
  const doc = structuredClone(input);
  const match = doc.matches.find((item) => item.id === matchId);
  const policy = doc.stages.find((stage) => stage.id === match?.stageId)?.config
    .aggregate;
  if (
    !match ||
    !policy ||
    match.result ||
    !["ready", "live", "postponed", "contested"].includes(match.status) ||
    match.slots.some((slot) => !slot.participantId)
  )
    throw new Error(
      "Only an unresolved playable aggregate tie can save leg progress.",
    );
  const parsed = legScoresSchema.parse(legs);
  if (policy.awayGoals && parsed.some((leg) => leg.some((score) => score < 0)))
    throw new Error("Away-goal scoring requires nonnegative leg scores.");
  const extra = policy.tieBreak === "extra-leg" ? 1 : 0;
  if (!parsed.length || parsed.length > policy.legs + extra)
    throw new Error("Save between one leg and the configured aggregate limit.");
  if (parsed.length > policy.legs) {
    const regulation = aggregateScores(parsed.slice(0, policy.legs));
    if (
      regulation[0] !== regulation[1] ||
      aggregateAwayWinner(
        policy,
        match.slots.map((slot) => slot.participantId!),
        parsed,
      )
    )
      throw new Error(
        "An extra leg is allowed only when the regulation aggregate is tied.",
      );
  }
  match.aggregateProgress = parsed;
  match.liveScores = aggregateScores(parsed);
  match.status = "live";
  return doc;
}
