import { z } from "zod";
import type { Match, Tournament } from "../domain/types";
import { canonicalize, sha256 } from "../security/codec";
import { decodeTransport, encodeTransport } from "../sharing";

const id = z.string().min(1).max(160);
export const predictionSchema = z
  .object({
    version: z.literal(1),
    id,
    tournamentId: id,
    stageId: id,
    name: z.string().trim().min(1).max(180),
    frozenAt: z.string().datetime(),
    baseRevision: z.number().int().min(0),
    drawHash: z.string().length(43),
    picks: z.array(z.object({ matchId: id, winnerId: id }).strict()).max(1024),
  })
  .strict();
export type Prediction = z.infer<typeof predictionSchema>;
export interface PredictionRow {
  match: Match;
  entrants: string[];
  winnerId?: string;
  automatic: boolean;
}

export function predictionRows(
  document: Tournament,
  stageId: string,
  picks: Record<string, string>,
): PredictionRow[] {
  const stage = document.stages.find((entry) => entry.id === stageId);
  if (!stage || stage.format !== "single-elimination")
    throw new Error(
      "Prediction brackets require a generated single-elimination stage.",
    );
  const matches = document.matches.filter((match) => match.stageId === stageId);
  if (!matches.length || matches.some((match) => match.slots.length !== 2))
    throw new Error(
      "Generate a two-entrant knockout bracket before making predictions.",
    );
  const indexed = new Map(matches.map((match) => [match.id, match]));
  const resolved = new Map<string, PredictionRow>(),
    visiting = new Set<string>();
  function resolve(matchId: string): PredictionRow {
    if (resolved.has(matchId)) return resolved.get(matchId)!;
    if (visiting.has(matchId))
      throw new Error("The prediction bracket contains a dependency cycle.");
    visiting.add(matchId);
    const match = indexed.get(matchId);
    if (!match)
      throw new Error("The prediction bracket references a missing match.");
    const slots = match.slots.map((slot) => {
      if (!slot.source) return slot.participantId;
      const source = resolve(slot.source.matchId);
      if (!source.winnerId) return undefined;
      return slot.source.result === "winner"
        ? source.winnerId
        : source.entrants.find((entrant) => entrant !== source.winnerId);
    });
    const entrants = slots.filter((entrant): entrant is string =>
      Boolean(entrant),
    );
    const waiting = match.slots.some(
      (slot, index) =>
        slot.source &&
        slots[index] === undefined &&
        !resolved.get(slot.source.matchId)?.automatic,
    );
    const automatic = !waiting && entrants.length < 2;
    const winnerId = automatic
      ? entrants[0]
      : entrants.length === 2 && entrants.includes(picks[match.id])
        ? picks[match.id]
        : undefined;
    const row = { match, entrants, automatic, winnerId };
    resolved.set(matchId, row);
    visiting.delete(matchId);
    return row;
  }
  return matches
    .map((match) => resolve(match.id))
    .sort(
      (first, second) =>
        first.match.round - second.match.round ||
        first.match.index - second.match.index ||
        first.match.id.localeCompare(second.match.id),
    );
}

export async function predictionDrawHash(
  document: Tournament,
  stageId: string,
): Promise<string> {
  predictionRows(document, stageId, {});
  return sha256(
    canonicalize({
      tournamentId: document.id,
      stageId,
      participants: document.participants.map((participant) => participant.id),
      matches: document.matches
        .filter((match) => match.stageId === stageId)
        .map((match) => ({
          id: match.id,
          round: match.round,
          bracket: match.bracket,
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
  const prediction = predictionSchema.parse(input);
  if (
    prediction.tournamentId !== document.id ||
    prediction.drawHash !==
      (await predictionDrawHash(document, prediction.stageId))
  )
    throw new Error("This prediction belongs to a different tournament draw.");
  const picks = Object.fromEntries(
    prediction.picks.map((pick) => [pick.matchId, pick.winnerId]),
  );
  if (Object.keys(picks).length !== prediction.picks.length)
    throw new Error("A prediction cannot choose the same match twice.");
  const rows = predictionRows(document, prediction.stageId, picks);
  const required = rows.filter((row) => !row.automatic);
  if (
    required.length !== prediction.picks.length ||
    required.some(
      (row) => !row.winnerId || picks[row.match.id] !== row.winnerId,
    )
  )
    throw new Error("Choose a valid winner for every played prediction match.");
  return prediction;
}

export async function freezePrediction(
  document: Tournament,
  stageId: string,
  name: string,
  picks: Record<string, string>,
): Promise<Prediction> {
  if (
    document.matches.some(
      (match) =>
        match.stageId === stageId &&
        ((match.result && match.status !== "bye") ||
          match.status === "live" ||
          match.status === "contested"),
    )
  )
    throw new Error(
      "Predictions can only be frozen before this stage has results or live matches.",
    );
  const rows = predictionRows(document, stageId, picks);
  if (rows.some((row) => !row.automatic && !row.winnerId))
    throw new Error("Choose a valid winner for every played prediction match.");
  return validatePrediction(document, {
    version: 1,
    id: crypto.randomUUID(),
    tournamentId: document.id,
    stageId,
    name,
    frozenAt: new Date().toISOString(),
    baseRevision: document.revision,
    drawHash: await predictionDrawHash(document, stageId),
    picks: rows
      .filter((row) => !row.automatic)
      .map((row) => ({ matchId: row.match.id, winnerId: row.winnerId ?? "" })),
  });
}

export async function encodePrediction(
  prediction: Prediction,
): Promise<string> {
  const valid = predictionSchema.parse(prediction);
  return encodeTransport("TSB1", {
    format: "tournastudio-prediction",
    version: 1,
    prediction: valid,
    hash: await sha256(canonicalize(valid)),
  });
}
export async function decodePrediction(code: string): Promise<Prediction> {
  const parsed = z
    .object({
      format: z.literal("tournastudio-prediction"),
      version: z.literal(1),
      prediction: predictionSchema,
      hash: z.string().length(43),
    })
    .strict()
    .parse(await decodeTransport("TSB1", code));
  if ((await sha256(canonicalize(parsed.prediction))) !== parsed.hash)
    throw new Error("The prediction packet checksum is invalid.");
  return parsed.prediction;
}

export function predictionScore(document: Tournament, prediction: Prediction) {
  let correct = 0,
    incorrect = 0,
    pending = 0;
  for (const pick of prediction.picks) {
    const match = document.matches.find((entry) => entry.id === pick.matchId);
    if (!match?.result || match.status !== "completed") pending++;
    else if (match.result.winnerIds.includes(pick.winnerId)) correct++;
    else incorrect++;
  }
  return { correct, incorrect, pending };
}
