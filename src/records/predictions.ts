import { z } from "zod";
import type { Tournament } from "../domain/types";
import { canonicalize, sha256 } from "../security/codec";
import { decodeTransport, encodeTransport } from "../sharing";
import * as legacy from "./prediction-legacy";
import {
  predictionSchema,
  predictionStarted,
  scopedMatches,
  validPlacementRanks,
  type Prediction,
  type PredictionChoices,
  type PredictionScope,
} from "./prediction-model";
import { choicesFromPicks, predictionRows } from "./prediction-rows";
export {
  predictionSchema,
  predictionStarted,
  scopedMatches,
} from "./prediction-model";
export type {
  Prediction,
  PredictionChoices,
  PredictionChoice,
  PredictionScope,
} from "./prediction-model";
export { predictionRows, choicesFromPicks } from "./prediction-rows";
export type { PredictionRow } from "./prediction-rows";

export async function predictionDrawHash(
  document: Tournament,
  stageId: string,
  scope?: PredictionScope,
): Promise<string> {
  const selected = scopedMatches(document, stageId, scope);
  predictionRows(document, stageId, {}, selected.scope);
  return sha256(
    canonicalize({
      tournamentId: document.id,
      stageId,
      format: selected.stage.format,
      formatVersion: selected.stage.formatVersion,
      // Generated-round pairings are already explicit. Later pairing settings
      // and late-entry credits must not rewrite a historical prediction scope.
      config:
        selected.scope.kind === "stage"
          ? selected.stage.config
          : {
              aggregate: selected.stage.config.aggregate,
            },
      rules: document.rules,
      scope: selected.scope,
      participants:
        selected.scope.kind === "stage"
          ? selected.stage.participantIds
          : undefined,
      matches: selected.matches.map((match) => ({
        id: match.id,
        round: match.round,
        index: match.index,
        group: match.group,
        bracket: match.bracket,
        conditionalReset: match.metadata.conditionalReset,
        slots: match.slots.map((slot) =>
          slot.source
            ? { source: slot.source }
            : { participantId: slot.participantId },
        ),
      })),
    }),
  );
}

export async function validatePrediction(
  document: Tournament,
  input: unknown,
): Promise<Prediction> {
  const packet = predictionSchema.parse(input);
  if (packet.version === 1) return legacy.validatePrediction(document, packet);
  if (
    packet.tournamentId !== document.id ||
    packet.drawHash !==
      (await predictionDrawHash(document, packet.stageId, packet.scope))
  )
    throw new Error("This prediction belongs to a different tournament draw.");
  if (
    new Set(packet.picks.map((pick) => pick.matchId)).size !==
    packet.picks.length
  )
    throw new Error("A prediction cannot choose the same match twice.");
  const rows = predictionRows(
    document,
    packet.stageId,
    choicesFromPicks(packet.picks),
    packet.scope,
  );
  const required = rows.filter((row) => !row.automatic);
  if (
    required.length !== packet.picks.length ||
    required.some(
      (row) =>
        !row.pick ||
        canonicalize(row.pick) !==
          canonicalize(
            packet.picks.find((pick) => pick.matchId === row.match.id),
          ),
    )
  )
    throw new Error("Choose a valid outcome for every prediction match.");
  return packet;
}

export async function freezePrediction(
  document: Tournament,
  stageId: string,
  name: string,
  choices: PredictionChoices,
): Promise<Prediction> {
  const { scope } = scopedMatches(document, stageId);
  if (predictionStarted(document, stageId, scope))
    throw new Error(
      "Predictions can only be frozen before this stage or generated round has recorded play.",
    );
  const rows = predictionRows(document, stageId, choices, scope);
  if (rows.some((row) => !row.automatic && !row.pick))
    throw new Error("Choose a valid outcome for every prediction match.");
  return validatePrediction(document, {
    version: 2,
    id: crypto.randomUUID(),
    tournamentId: document.id,
    stageId,
    name,
    frozenAt: new Date().toISOString(),
    baseRevision: document.revision,
    drawHash: await predictionDrawHash(document, stageId, scope),
    scope,
    picks: rows.flatMap((row) => (row.pick ? [row.pick] : [])),
  });
}

export async function encodePrediction(packet: Prediction): Promise<string> {
  const valid = predictionSchema.parse(packet);
  return encodeTransport("TSB1", {
    format: "tournastudio-prediction",
    version: valid.version,
    prediction: valid,
    hash: await sha256(canonicalize(valid)),
  });
}
export async function decodePrediction(code: string): Promise<Prediction> {
  const parsed = z
    .object({
      format: z.literal("tournastudio-prediction"),
      version: z.union([z.literal(1), z.literal(2)]),
      prediction: predictionSchema,
      hash: z.string().length(43),
    })
    .strict()
    .parse(await decodeTransport("TSB1", code));
  if (
    parsed.version !== parsed.prediction.version ||
    (await sha256(canonicalize(parsed.prediction))) !== parsed.hash
  )
    throw new Error("The prediction packet checksum is invalid.");
  return parsed.prediction;
}

export function predictionScore(
  document: Tournament,
  packet: Prediction,
): { correct: number; incorrect: number; pending: number; voided?: number } {
  if (packet.version === 1) return legacy.predictionScore(document, packet);
  let correct = 0,
    incorrect = 0,
    pending = 0,
    voided = 0;
  const matches = new Map(document.matches.map((match) => [match.id, match]));
  for (const pick of packet.picks) {
    const match = matches.get(pick.matchId);
    if (!match) {
      pending++;
      continue;
    }
    if (match.metadata.conditionalReset) {
      const final = matches.get(String(match.metadata.conditionalReset));
      if (!final?.result || final.status !== "completed") {
        pending++;
        continue;
      }
      const omitted =
        final.result.winnerIds[0] === final.slots[0].participantId;
      if (omitted || pick.outcome === "not-played") {
        if (omitted === (pick.outcome === "not-played")) correct++;
        else incorrect++;
        continue;
      }
    }
    if (match.status === "canceled") {
      voided++;
      continue;
    }
    if (!match.result || match.status !== "completed") {
      pending++;
      continue;
    }
    let accurate = false;
    if (pick.outcome === "winner")
      accurate =
        match.result.winnerIds.length === 1 &&
        match.result.winnerIds[0] === pick.winnerId;
    if (pick.outcome === "draw") accurate = match.result.outcome === "draw";
    if (pick.outcome === "placements") {
      const ids = match.slots.flatMap((slot) =>
        slot.participantId ? [slot.participantId] : [],
      );
      const administrative =
        ["forfeit", "walkover", "no-show", "disqualified"].includes(
          match.result.outcome,
        ) || document.rules.scoring === "manual";
      if (administrative && !match.result.placements) {
        voided++;
        continue;
      }
      const ranks =
        match.result.placements ??
        ids.map((_, index) => {
          const scores = match.result!.scores;
          const low =
            document.stages.find((stage) => stage.id === match.stageId)
              ?.format === "time-trial" ||
            ["low", "time"].includes(document.rules.scoring) ||
            (document.rules.scoring === "weighted" &&
              document.rules.weightedDirection === "low");
          return (
            1 +
            scores.filter((score) =>
              low ? score < scores[index] : score > scores[index],
            ).length
          );
        });
      if (
        !validPlacementRanks(
          ids,
          ids.map((participantId, index) => ({
            participantId,
            rank: ranks[index],
          })),
        ) ||
        (administrative &&
          (ids.filter((_, index) => ranks[index] === 1).length !== 1 ||
            ids[ranks.indexOf(1)] !== match.result.winnerIds[0]))
      ) {
        voided++;
        continue;
      }
      accurate =
        ids.length === pick.ranks.length &&
        pick.ranks.every(
          (entry) =>
            ids.includes(entry.participantId) &&
            ranks[ids.indexOf(entry.participantId)] === entry.rank,
        );
    }
    if (accurate) correct++;
    else incorrect++;
  }
  return { correct, incorrect, pending, ...(voided ? { voided } : {}) };
}

export function predictionScopeKey(packet: Prediction): string {
  return `${packet.version}:${packet.stageId}:${packet.drawHash}`;
}
