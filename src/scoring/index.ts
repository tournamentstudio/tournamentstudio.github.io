import type { Match, MatchResult, Rules, Stage } from "../domain/types";

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
  const manualOutcome = [
    "forfeit",
    "walkover",
    "no-show",
    "disqualified",
  ].includes(input.outcome);
  let winners: string[];
  if (manualOutcome || rules.scoring === "manual") {
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
    if (
      input.placements.length !== ids.length ||
      input.placements.some(
        (rank) => !Number.isInteger(rank) || rank < 1 || rank > ids.length,
      )
    ) {
      throw new Error("Enter a valid placement for every entrant.");
    }
    const ranks = [...input.placements].sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++) {
      if (
        (i === 0 && ranks[i] !== 1) ||
        (i > 0 && ranks[i] !== ranks[i - 1] && ranks[i] !== i + 1)
      ) {
        throw new Error(
          "Use competition placements such as 1, 1, 3 when entrants tie.",
        );
      }
    }
    winners = ids.filter((_, index) => input.placements![index] === 1);
  } else {
    const lowest =
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
