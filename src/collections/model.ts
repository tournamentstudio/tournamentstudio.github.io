import { z } from "zod";
import { assertSafeJson, canonicalize, sha256 } from "../security/codec";
import type { Tournament } from "../domain/types";
import { themeSchema } from "../domain/validate";

const id = z.string().min(1).max(120);
const name = z.string().trim().min(1).max(180);
export const collectionSchema = z
  .object({
    version: z.literal(1),
    id,
    revision: z.number().int().min(0),
    hash: z.string().max(64),
    title: name,
    theme: themeSchema,
    description: z.string().max(5000),
    season: z.string().max(180),
    archived: z.boolean(),
    updatedAt: z.string().datetime(),
    directory: z
      .array(
        z
          .object({
            id,
            name,
            kind: z.enum(["team", "individual"]),
            divisionId: id,
          })
          .strict(),
      )
      .max(2048),
    divisions: z
      .array(
        z
          .object({
            id,
            name,
            promote: z.number().int().min(0).max(512),
            relegate: z.number().int().min(0).max(512),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    competitions: z
      .array(
        z
          .object({
            tournamentId: id,
            stageId: id,
            divisionId: id,
            weight: z.number().finite().min(0.001).max(1000),
            bindings: z
              .array(z.object({ participantId: id, directoryId: id }).strict())
              .max(512),
            resources: z
              .array(z.object({ resourceId: id, sharedName: name }).strict())
              .max(128),
          })
          .strict(),
      )
      .max(64),
    placementPoints: z
      .array(z.number().finite().min(0).max(100000))
      .min(1)
      .max(512),
    adjustments: z
      .array(
        z
          .object({
            id,
            directoryId: id,
            points: z.number().finite().min(-100000).max(100000),
            reason: name,
          })
          .strict(),
      )
      .max(2048),
  })
  .strict();
export type EventCollection = z.infer<typeof collectionSchema>;
export type CompetitionLink = EventCollection["competitions"][number];

export function validateCollection(value: unknown): EventCollection {
  assertSafeJson(value);
  const result = collectionSchema.parse(value);
  for (const ids of [
    result.directory.map((e) => e.id),
    result.divisions.map((e) => e.id),
    result.competitions.map((e) => e.tournamentId),
    result.adjustments.map((e) => e.id),
  ]) {
    if (new Set(ids).size !== ids.length)
      throw new Error("Duplicate event identifier.");
  }
  const divisions = new Set(result.divisions.map((e) => e.id));
  const directory = new Map(result.directory.map((e) => [e.id, e]));
  for (const person of result.directory)
    if (!divisions.has(person.divisionId))
      throw new Error("An event participant references a missing division.");
  for (const entry of result.competitions) {
    if (!divisions.has(entry.divisionId))
      throw new Error("A competition references a missing division.");
    if (
      new Set(entry.bindings.map((e) => e.participantId)).size !==
        entry.bindings.length ||
      new Set(entry.bindings.map((e) => e.directoryId)).size !==
        entry.bindings.length
    )
      throw new Error(
        "A competition cannot assign an entrant or directory member twice.",
      );
    if (
      entry.bindings.some(
        (e) =>
          !directory.has(e.directoryId) ||
          directory.get(e.directoryId)!.divisionId !== entry.divisionId,
      )
    )
      throw new Error(
        "A competition binding must use a member of its division.",
      );
    if (
      new Set(entry.resources.map((e) => e.resourceId)).size !==
      entry.resources.length
    )
      throw new Error("A venue can have only one shared event name.");
  }
  for (const adjustment of result.adjustments)
    if (!directory.has(adjustment.directoryId))
      throw new Error(
        "A points adjustment references a missing event participant.",
      );
  return result;
}

export async function sealCollection(
  value: EventCollection,
): Promise<EventCollection> {
  const document = validateCollection(value);
  return {
    ...document,
    hash: await sha256(canonicalize({ ...document, hash: "" })),
  };
}

export function createCollection(title: string, season = ""): EventCollection {
  return validateCollection({
    version: 1,
    id: crypto.randomUUID(),
    revision: 0,
    hash: "",
    title,
    theme: { preset: "championship-gold", reducedMotion: false },
    season,
    description: "",
    archived: false,
    updatedAt: new Date().toISOString(),
    directory: [],
    divisions: [
      { id: crypto.randomUUID(), name: "Open", promote: 0, relegate: 0 },
    ],
    competitions: [],
    placementPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    adjustments: [],
  });
}

export function linkCompetition(
  collection: EventCollection,
  tournament: Tournament,
  stageId: string,
  divisionId: string,
): EventCollection {
  if (collection.competitions.some((e) => e.tournamentId === tournament.id))
    throw new Error("This tournament is already in the event.");
  const stage = tournament.stages.find((e) => e.id === stageId);
  if (!stage) throw new Error("Choose a valid competition stage.");
  const draft = structuredClone(collection);
  const participants = tournament.participants;
  const bindings = participants.map((p) => {
    const directoryId = crypto.randomUUID();
    draft.directory.push({
      id: directoryId,
      name: p.name,
      kind: p.kind,
      divisionId,
    });
    return { participantId: p.id, directoryId };
  });
  draft.competitions.push({
    tournamentId: tournament.id,
    stageId,
    divisionId,
    weight: 1,
    bindings,
    resources: [],
  });
  return validateCollection(draft);
}
