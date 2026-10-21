import { z } from "zod";
import type { Tournament } from "../domain/types";
import { canonicalize, sha256 } from "../security/codec";
import { decodeTransport, encodeTransport } from "../sharing";

const id = z.string().min(1).max(160);
export const ratingSourceSchema = z
  .object({
    tournamentId: id,
    title: z.string().min(1).max(240),
    revision: z.number().int().min(0),
    participants: z
      .array(z.object({ id, name: z.string().min(1).max(240) }).strict())
      .max(512),
    matches: z
      .array(
        z
          .object({
            id,
            at: z.string().datetime(),
            entrants: z.tuple([id, id]),
            result: z.enum(["first", "second", "draw"]),
          })
          .strict(),
      )
      .max(4096),
  })
  .strict();
export type RatingSource = z.infer<typeof ratingSourceSchema>;
export interface RatingIdentity {
  id: string;
  name: string;
}
export const mappedSourceSchema = z
  .object({
    source: ratingSourceSchema,
    bindings: z
      .array(z.object({ participantId: id, identityId: id }).strict())
      .max(512),
  })
  .strict();
export type MappedRatingSource = z.infer<typeof mappedSourceSchema>;

export function validateRatingSource(value: unknown): RatingSource {
  const source = ratingSourceSchema.parse(value);
  const participants = new Set(source.participants.map((entry) => entry.id));
  if (
    participants.size !== source.participants.length ||
    new Set(source.matches.map((match) => match.id)).size !==
      source.matches.length
  )
    throw new Error("Rating source contains duplicate identifiers.");
  if (
    source.matches.some(
      (match) =>
        match.entrants[0] === match.entrants[1] ||
        match.entrants.some((entrant) => !participants.has(entrant)),
    )
  )
    throw new Error("Rating source contains invalid match entrants.");
  return source;
}

export function ratingSource(document: Tournament): RatingSource {
  return validateRatingSource({
    tournamentId: document.id,
    title: document.title,
    revision: document.revision,
    participants: document.participants.map(({ id, name }) => ({ id, name })),
    matches: document.matches.flatMap((match) => {
      if (
        match.status !== "completed" ||
        !match.result ||
        !["played", "draw"].includes(match.result.outcome) ||
        match.slots.length !== 2 ||
        match.slots.some((slot) => !slot.participantId)
      )
        return [];
      const entrants = match.slots.map((slot) => slot.participantId!);
      if (
        match.result.outcome !== "draw" &&
        (match.result.winnerIds.length !== 1 ||
          !entrants.includes(match.result.winnerIds[0]))
      )
        return [];
      return [
        {
          id: match.id,
          at: match.result.recordedAt,
          entrants,
          result:
            match.result.outcome === "draw"
              ? "draw"
              : match.result.winnerIds[0] === entrants[0]
                ? "first"
                : "second",
        },
      ];
    }),
  });
}

export async function exportRatingSource(
  document: Tournament,
): Promise<string> {
  const source = ratingSource(document);
  return encodeTransport("TSH1", {
    format: "tournastudio-rating-results",
    version: 1,
    source,
    hash: await sha256(canonicalize(source)),
  });
}

export async function importRatingSource(code: string): Promise<RatingSource> {
  const envelope = z
    .object({
      format: z.literal("tournastudio-rating-results"),
      version: z.literal(1),
      source: ratingSourceSchema,
      hash: z.string().length(43),
    })
    .strict()
    .parse(await decodeTransport("TSH1", code));
  const source = validateRatingSource(envelope.source);
  if ((await sha256(canonicalize(source))) !== envelope.hash)
    throw new Error("The rating source checksum is invalid.");
  return source;
}

export interface RatingRow {
  identityId: string;
  name: string;
  rating: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}
export interface RatingChange {
  tournamentId: string;
  matchId: string;
  at: string;
  firstId: string;
  secondId: string;
  firstBefore: number;
  firstAfter: number;
  secondBefore: number;
  secondAfter: number;
  result: "first" | "second" | "draw";
}
export function calculateRatings(
  identities: RatingIdentity[],
  sources: MappedRatingSource[],
  initial = 1200,
  factor = 32,
): { rows: RatingRow[]; history: RatingChange[] } {
  if (
    !Number.isFinite(initial) ||
    initial < 0 ||
    initial > 10000 ||
    !Number.isFinite(factor) ||
    factor < 1 ||
    factor > 200
  )
    throw new Error(
      "Choose an initial rating from 0 to 10000 and a K factor from 1 to 200.",
    );
  const rows = new Map(
    identities.map((identity) => [
      identity.id,
      {
        identityId: identity.id,
        name: identity.name,
        rating: initial,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      },
    ]),
  );
  if (
    rows.size !== identities.length ||
    new Set(sources.map((entry) => entry.source.tournamentId)).size !==
      sources.length
  )
    throw new Error(
      "A rating identity or tournament source appears more than once.",
    );
  const matches = sources
    .flatMap((entry) => {
      const source = validateRatingSource(entry.source);
      const bindings = new Map(
        entry.bindings.map((binding) => [
          binding.participantId,
          binding.identityId,
        ]),
      );
      if (
        bindings.size !== entry.bindings.length ||
        new Set(bindings.values()).size !== bindings.size ||
        bindings.size !== source.participants.length ||
        source.participants.some(
          (participant) => !rows.has(bindings.get(participant.id) ?? ""),
        )
      )
        throw new Error(
          "Map every source entrant to a different rating identity.",
        );
      return source.matches.map((match) => ({
        ...match,
        tournamentId: source.tournamentId,
        firstId: bindings.get(match.entrants[0])!,
        secondId: bindings.get(match.entrants[1])!,
      }));
    })
    .sort(
      (first, second) =>
        first.at.localeCompare(second.at) ||
        first.tournamentId.localeCompare(second.tournamentId) ||
        first.id.localeCompare(second.id),
    );
  const history: RatingChange[] = [];
  for (const match of matches) {
    const first = rows.get(match.firstId)!,
      second = rows.get(match.secondId)!;
    const firstBefore = first.rating,
      secondBefore = second.rating;
    const expected = 1 / (1 + Math.pow(10, (secondBefore - firstBefore) / 400));
    const actual =
      match.result === "draw" ? 0.5 : match.result === "first" ? 1 : 0;
    const change = factor * (actual - expected);
    first.rating += change;
    second.rating -= change;
    first.played++;
    second.played++;
    if (match.result === "draw") {
      first.draws++;
      second.draws++;
    } else if (match.result === "first") {
      first.wins++;
      second.losses++;
    } else {
      second.wins++;
      first.losses++;
    }
    history.push({
      tournamentId: match.tournamentId,
      matchId: match.id,
      at: match.at,
      firstId: first.identityId,
      secondId: second.identityId,
      firstBefore,
      secondBefore,
      firstAfter: first.rating,
      secondAfter: second.rating,
      result: match.result,
    });
  }
  return {
    rows: [...rows.values()].sort(
      (first, second) =>
        second.rating - first.rating ||
        first.identityId.localeCompare(second.identityId),
    ),
    history,
  };
}
