import { z } from "zod";
import type { MatchResult, Stage, Tournament } from "./types";

export const aggregatePolicySchema = z
  .object({
    version: z.literal(1),
    legs: z.number().int().min(2).max(8),
    tieBreak: z.enum(["manual", "extra-leg"]),
    awayGoals: z.boolean().optional(),
  })
  .strict();
export type AggregatePolicy = z.infer<typeof aggregatePolicySchema>;
export const legScoresSchema = z
  .array(z.array(z.number().finite().min(-1e9).max(1e9)).length(2))
  .max(9);
export const legScheduleSchema = z
  .array(
    z
      .object({
        leg: z.number().int().min(1).max(9),
        scheduledAt: z.string().datetime({ offset: true }),
        resourceId: z.string().min(1).max(160).optional(),
        durationMinutes: z.number().int().min(1).max(1440).optional(),
      })
      .strict(),
  )
  .max(9)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.leg)).size === entries.length,
  );
export type LegSchedule = z.infer<typeof legScheduleSchema>;

export function aggregatePolicyErrors(
  tournament: Tournament,
  stage: Stage,
): string[] {
  if (!stage.config.aggregate) return [];
  if (!["single-elimination", "double-elimination"].includes(stage.format))
    return ["Aggregate legs require a single or double elimination stage."];
  if (!["high", "low"].includes(tournament.rules.scoring))
    return ["Aggregate legs require highest-score or lowest-score rules."];
  if (
    stage.config.aggregate.awayGoals &&
    (tournament.rules.scoring !== "high" ||
      stage.config.aggregate.legs % 2 !== 0)
  )
    return [
      "Away-goal tiebreaks need highest-score rules and an even number of regulation legs.",
    ];
  return aggregatePolicySchema.safeParse(stage.config.aggregate).success
    ? []
    : ["The aggregate leg policy is invalid."];
}

export function aggregateAwayScores(
  legs: number[][],
  regulationLegs: number,
): [number, number] {
  const totals: [number, number] = [0, 0];
  for (const [index, leg] of legScoresSchema
    .parse(legs.slice(0, regulationLegs))
    .entries()) {
    const away = index % 2 === 0 ? 1 : 0;
    totals[away] += leg[away];
  }
  return totals;
}

export function aggregateAwayWinner(
  policy: AggregatePolicy,
  ids: string[],
  legs: number[][],
): string | undefined {
  if (!policy.awayGoals || legs.length < policy.legs) return undefined;
  const total = aggregateScores(legs.slice(0, policy.legs));
  if (total[0] !== total[1]) return undefined;
  const away = aggregateAwayScores(legs, policy.legs);
  return away[0] === away[1] ? undefined : ids[away[0] > away[1] ? 0 : 1];
}

export function aggregateScores(legs: number[][]): [number, number] {
  const parsed = legScoresSchema.parse(legs);
  const scores: [number, number] = [0, 0];
  for (const leg of parsed) {
    scores[0] += leg[0];
    scores[1] += leg[1];
  }
  if (scores.some((score) => !Number.isFinite(score) || Math.abs(score) > 1e9))
    throw new Error("The aggregate score exceeds the supported range.");
  return scores;
}

export function validateAggregateResult(
  stage: Stage,
  ids: string[],
  input: MatchResult,
): string | undefined {
  const policy = stage.config.aggregate;
  if (!policy) {
    if (input.legs || input.aggregateTiebreakWinnerId)
      throw new Error("Leg results require an aggregate stage policy.");
    return undefined;
  }
  if (ids.length !== 2)
    throw new Error("Aggregate ties require exactly two entrants.");
  if (
    ["forfeit", "walkover", "no-show", "disqualified"].includes(input.outcome)
  ) {
    if (input.legs || input.aggregateTiebreakWinnerId)
      throw new Error(
        "Record an aggregate ruling without leg results or a tiebreak winner.",
      );
    return undefined;
  }
  const legs = input.legs ?? [];
  if (policy.awayGoals && legs.some((leg) => leg.some((score) => score < 0)))
    throw new Error("Away-goal scoring requires nonnegative leg scores.");
  const extra = policy.tieBreak === "extra-leg" ? 1 : 0;
  if (legs.length < policy.legs || legs.length > policy.legs + extra)
    throw new Error(
      "Enter every required regulation leg and only the permitted extra leg.",
    );
  const regulation = aggregateScores(legs.slice(0, policy.legs));
  const regulationTied = regulation[0] === regulation[1];
  const awayWinner = aggregateAwayWinner(policy, ids, legs);
  if (legs.length > policy.legs && (!regulationTied || awayWinner))
    throw new Error(
      "An extra leg is allowed only when the regulation aggregate is tied.",
    );
  if (regulationTied && !awayWinner && extra && legs.length === policy.legs)
    throw new Error(
      "Play the configured extra leg before resolving this tied aggregate.",
    );
  const scores = aggregateScores(legs);
  if (scores.some((score, index) => score !== input.scores[index]))
    throw new Error(
      "The recorded aggregate must equal the sum of all leg scores.",
    );
  if (input.sets?.length || input.placements)
    throw new Error(
      "Aggregate legs cannot also contain set or placement results.",
    );
  if (awayWinner) {
    if (input.aggregateTiebreakWinnerId)
      throw new Error(
        "The configured away-goal result cannot be replaced by a manual tiebreak winner.",
      );
    if (
      input.winnerIds.length &&
      (input.winnerIds.length !== 1 || input.winnerIds[0] !== awayWinner)
    )
      throw new Error(
        "The recorded winner does not match the regulation away-goal totals.",
      );
    return awayWinner;
  }
  if (scores[0] === scores[1]) {
    if (
      !input.aggregateTiebreakWinnerId ||
      !ids.includes(input.aggregateTiebreakWinnerId)
    )
      throw new Error(
        "Select the winner of the agreed aggregate tiebreak ruling.",
      );
    if (
      input.winnerIds.length !== 1 ||
      input.winnerIds[0] !== input.aggregateTiebreakWinnerId
    )
      throw new Error(
        "The aggregate tiebreak winner must match the recorded winner.",
      );
    return input.aggregateTiebreakWinnerId;
  }
  if (input.aggregateTiebreakWinnerId)
    throw new Error("A tiebreak winner is allowed only for a tied aggregate.");
  return undefined;
}
