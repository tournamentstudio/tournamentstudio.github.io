import { z } from "zod";
import type { Match, Stage, Tournament } from "../domain/types";
import { formats } from "../engine/formats";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { predictionSchema as legacySchema } from "./prediction-legacy";

const id = z.string().min(1).max(160);
const rank = z
  .object({ participantId: id, rank: z.number().int().min(1).max(512) })
  .strict();
export const predictionPickSchema = z.discriminatedUnion("outcome", [
  z
    .object({ matchId: id, outcome: z.literal("winner"), winnerId: id })
    .strict(),
  z.object({ matchId: id, outcome: z.literal("draw") }).strict(),
  z.object({ matchId: id, outcome: z.literal("not-played") }).strict(),
  z
    .object({
      matchId: id,
      outcome: z.literal("placements"),
      ranks: z.array(rank).min(2).max(512),
    })
    .strict(),
]);
export const predictionScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage") }).strict(),
  z
    .object({
      kind: z.literal("round"),
      round: z.number().int().min(1).max(20000),
      matchIds: z.array(id).min(1).max(1024),
    })
    .strict(),
]);
const currentSchema = z
  .object({
    version: z.literal(2),
    id,
    tournamentId: id,
    stageId: id,
    name: z.string().trim().min(1).max(180),
    frozenAt: z.string().datetime(),
    baseRevision: z.number().int().min(0),
    drawHash: z.string().length(43),
    scope: predictionScopeSchema,
    picks: z.array(predictionPickSchema).min(1).max(20000),
  })
  .strict();
export const predictionSchema = z.discriminatedUnion("version", [
  legacySchema,
  currentSchema,
]);
export type Prediction = z.infer<typeof predictionSchema>;
export type CurrentPrediction = z.infer<typeof currentSchema>;
export type PredictionPick = z.infer<typeof predictionPickSchema>;
export type PredictionScope = z.infer<typeof predictionScopeSchema>;
export type PredictionChoice =
  | string
  | { outcome: "draw" }
  | { outcome: "placements"; ranks: { participantId: string; rank: number }[] };
export type PredictionChoices = Record<string, PredictionChoice>;

export function scopedMatches(
  document: Tournament,
  stageId: string,
  scope?: PredictionScope,
): { stage: Stage; matches: Match[]; scope: PredictionScope } {
  const stage = document.stages.find((entry) => entry.id === stageId);
  if (!stage)
    throw new Error("Choose a generated stage before making predictions.");
  const generated = document.matches.filter(
    (match) => match.stageId === stageId,
  );
  if (!generated.length)
    throw new Error("Choose a generated stage before making predictions.");
  const dynamic = formats.find((format) => format.id === stage.format)?.dynamic;
  const latest = Math.max(...generated.map((match) => match.round));
  const selected: PredictionScope =
    scope ??
    (dynamic
      ? {
          kind: "round",
          round: latest,
          matchIds: generated
            .filter((match) => match.round === latest)
            .map((match) => match.id)
            .sort(),
        }
      : { kind: "stage" });
  if (dynamic !== (selected.kind === "round"))
    throw new Error(
      "The prediction scope does not match this competition format.",
    );
  const matches =
    selected.kind === "stage"
      ? generated
      : generated.filter((match) => match.round === selected.round);
  if (
    selected.kind === "round" &&
    (new Set(selected.matchIds).size !== selected.matchIds.length ||
      matches.length !== selected.matchIds.length ||
      matches.some((match) => !selected.matchIds.includes(match.id)))
  )
    throw new Error(
      "The predicted round no longer has the same generated matches.",
    );
  if (!matches.length)
    throw new Error("Choose a generated stage before making predictions.");
  return { stage, matches, scope: selected };
}

export function predictionStarted(
  document: Tournament,
  stageId: string,
  scope?: PredictionScope,
): boolean {
  return scopedMatches(document, stageId, scope).matches.some(
    tournamentMatchEvidence(document),
  );
}

export function validPlacementRanks(
  entrants: string[],
  ranks: { participantId: string; rank: number }[],
): boolean {
  if (
    ranks.length !== entrants.length ||
    new Set(ranks.map((entry) => entry.participantId)).size !==
      entrants.length ||
    ranks.some(
      (entry) =>
        !entrants.includes(entry.participantId) ||
        !Number.isInteger(entry.rank) ||
        entry.rank < 1 ||
        entry.rank > entrants.length,
    )
  )
    return false;
  const values = ranks.map((entry) => entry.rank).sort((a, b) => a - b);
  return values.every(
    (value, index) =>
      value ===
      (index > 0 && value === values[index - 1]
        ? values[index - 1]
        : index + 1),
  );
}
