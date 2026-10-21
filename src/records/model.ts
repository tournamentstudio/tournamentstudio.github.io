import { z } from "zod";
import type { JsonValue, Tournament } from "../domain/types";
import { mappedSourceSchema, validateRatingSource } from "./ratings";
import { predictionSchema } from "./predictions";

const schema = z
  .object({
    version: z.literal(1),
    initialRating: z.number().finite().min(0).max(10000),
    kFactor: z.number().finite().min(1).max(200),
    identities: z
      .array(
        z
          .object({
            id: z.string().min(1).max(160),
            name: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(2048),
    sources: z.array(mappedSourceSchema).max(16),
    predictions: z
      .array(
        z
          .object({
            packet: predictionSchema,
            imported: z.boolean(),
            receivedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Records = z.infer<typeof schema>;
export function readRecords(document: Tournament): Records {
  if (document.metadata.records === undefined)
    return {
      version: 1,
      initialRating: 1200,
      kFactor: 32,
      identities: [],
      sources: [],
      predictions: [],
    };
  const result = schema.safeParse(document.metadata.records);
  if (!result.success)
    throw new Error(
      "The saved records use an unsupported or invalid format. Export a backup before changing them.",
    );
  for (const source of result.data.sources) validateRatingSource(source.source);
  for (const ids of [
    result.data.identities.map((entry) => entry.id),
    result.data.sources.map((entry) => entry.source.tournamentId),
    result.data.predictions.map((entry) => entry.packet.id),
  ])
    if (new Set(ids).size !== ids.length)
      throw new Error("Saved records contain duplicate identifiers.");
  return result.data;
}
export function withRecords(
  document: Tournament,
  records: Records,
): Tournament {
  const valid = schema.parse(records);
  const next = {
    ...document,
    metadata: { ...document.metadata, records: valid as unknown as JsonValue },
  };
  readRecords(next);
  return next;
}
