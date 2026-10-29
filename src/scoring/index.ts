import type { Match, MatchResult, Rules, Stage } from "../domain/types";
import { validateMetrics, weightedScores } from "./metrics";
import { validateAggregateResult } from "../domain/aggregate";
import { validatePlacements } from "./placements";

const elimination = new Set([
  "single-elimination",
  "double-elimination",
  "triple-elimination",
  "gsl",
  "gauntlet",
  "ladder",
]);

export function validateResult(
  match: Match,
  stage: Stage,
  rules: Rules,
  input: MatchResult,
): MatchResult {
  const entrants = match.slots.map((slot) => slot.participantId);
  if (entrants.some((id) => !id) || entrants.length < 2)
    throw new Error("The match does not have all its entrants yet.");
  const ids = entrants as string[];
  if (new Set(ids).size !== ids.length)
    throw new Error("A participant cannot occupy two slots in one match.");
  validatePlacements(input.placements, ids.length);
  if (
    input.scores.length !== ids.length ||
    input.scores.some(
      (score) => !Number.isFinite(score) || Math.abs(score) > 1e9,
    )
  ) {
    throw new Error(
      "Enter one finite score per entrant, between -1000000000 and 1000000000.",
    );
  }
  if (
    new Set(input.winnerIds).size !== input.winnerIds.length ||
    input.winnerIds.some((id) => !ids.includes(id))
  ) {
    throw new Error(
      "Every selected winner must be a distinct entrant in this match.",
    );
  }
  if (input.outcome === "abandoned")
    throw new Error(
      "An abandoned match needs a final ruling before it can count.",
    );
  const result = structuredClone(input);
  if (
    input.fairPlay &&
    (input.fairPlay.length !== ids.length ||
      input.fairPlay.some(
        (value) => !Number.isFinite(value) || value < 0 || value > 1000000,
      ))
  )
    throw new Error(
      "Fair-play penalties require one value per entrant between 0 and 1000000.",
    );
  const manualOutcome = [
    "forfeit",
    "walkover",
    "no-show",
    "disqualified",
  ].includes(input.outcome);
  if (stage.config.aggregate && !["high", "low"].includes(rules.scoring))
    throw new Error("Aggregate legs require highest-score or lowest-score rules.");
  if (stage.config.aggregate?.awayGoals && (rules.scoring !== "high" || stage.config.aggregate.legs % 2 !== 0))
    throw new Error("Away-goal tiebreaks need highest-score rules and an even number of regulation legs.");
  const aggregateWinner = validateAggregateResult(stage, ids, input);
  if (input.metrics)
    result.metrics = validateMetrics(
      rules.metricDefinitions ?? [],
      input.metrics,
      ids.length,
    );
  if (rules.scoring === "weighted" && !manualOutcome) {
    const calculated = weightedScores(
      rules.metricDefinitions ?? [],
      input.metrics,
      ids.length,
    );
    if (calculated.some((score, index) => score !== input.scores[index]))
      throw new Error(
        "Recorded scores must agree with the weighted metric calculation.",
      );
    if (input.placements) {
      const low =
        rules.weightedDirection === "low" || stage.format === "time-trial";
      const expected = calculated.map(
        (score) =>
          1 +
          calculated.filter((value) => (low ? value < score : value > score))
            .length,
      );
      if (
        expected.length !== input.placements.length ||
        expected.some((rank, index) => rank !== input.placements![index])
      )
        throw new Error(
          "Placements must agree with the weighted metric calculation.",
        );
    }
  }
  let winners: string[];
  if (aggregateWinner) {
    winners = [aggregateWinner];
  } else if (manualOutcome || rules.scoring === "manual") {
    if (input.winnerIds.length !== 1)
      throw new Error("Select exactly one winner for this ruling.");
    winners = [...input.winnerIds];
  } else if (rules.scoring === "sets") {
    if (ids.length !== 2 || rules.bestOf < 1 || rules.bestOf % 2 !== 1)
      throw new Error(
        "Set scoring requires two entrants and an odd best-of value.",
      );
    const sets = input.sets ?? [];
    const required = Math.floor(rules.bestOf / 2) + 1;
    const totals = [0, 0];
    for (const set of sets) {
      if (totals.some((count) => count >= required))
        throw new Error("Remove sets played after the match was already won.");
      if (
        set.length !== 2 ||
        set.some(
          (score) => !Number.isFinite(score) || score < 0 || score > 1e9,
        ) ||
        set[0] === set[1]
      ) {
        throw new Error("Each set requires two valid, unequal scores.");
      }
      totals[set[0] > set[1] ? 0 : 1]++;
    }
    if (!totals.includes(required))
      throw new Error(`A winner needs ${required} completed sets.`);
    result.scores = totals;
    winners = [ids[totals[0] > totals[1] ? 0 : 1]];
  } else if (input.placements) {
    winners = ids.filter((_, index) => input.placements![index] === 1);
  } else {
    const lowest =
      (rules.scoring === "weighted" && rules.weightedDirection === "low") ||
      rules.scoring === "low" ||
      rules.scoring === "time" ||
      stage.format === "time-trial";
    const best = lowest
      ? Math.min(...result.scores)
      : Math.max(...result.scores);
    winners = ids.filter((_, index) => result.scores[index] === best);
  }
  const isDraw = ids.length === 2 && winners.length === 2;
  if (isDraw && (elimination.has(stage.format) || !rules.allowDraws))
    throw new Error(
      "This match needs a winner. Resolve the tie before saving.",
    );
  if (
    !manualOutcome &&
    input.winnerIds.length > 0 &&
    !isDraw &&
    (input.winnerIds.length !== winners.length ||
      input.winnerIds.some((id) => !winners.includes(id)))
  ) {
    throw new Error("The selected winner does not match the entered scores.");
  }
  if (input.outcome === "draw" && !isDraw)
    throw new Error("A draw requires equal results.");
  result.winnerIds = isDraw ? [] : winners;
  result.outcome = isDraw ? "draw" : input.outcome;
  if (!Number.isFinite(Date.parse(result.recordedAt)))
    throw new Error("The result timestamp is invalid.");
  return result;
}
