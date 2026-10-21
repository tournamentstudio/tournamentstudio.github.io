import { z } from "zod";
import type { Tournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { canonicalize, LIMITS } from "../security/codec";
import { decryptJson, encryptJson } from "../security/crypto";
import {
  decodeTransport,
  encodeTransport,
  hashDocument,
  publicProjection,
  sealDocument,
} from "../sharing";
import {
  sealCollection,
  validateCollection,
  type EventCollection,
} from "./model";

export interface CollectionBundle {
  version: 1;
  collection: EventCollection;
  tournaments: Tournament[];
}
export async function validateBundle(
  value: unknown,
): Promise<CollectionBundle> {
  const data = z
    .object({
      version: z.literal(1),
      collection: z.unknown(),
      tournaments: z.array(z.unknown()).max(64),
    })
    .strict()
    .parse(value);
  const collection = validateCollection(data.collection);
  if ((await sealCollection(collection)).hash !== collection.hash)
    throw new Error("The event package checksum does not match.");
  const tournaments = data.tournaments.map(validateTournament);
  const ids = new Set(tournaments.map((t) => t.id));
  if (
    ids.size !== tournaments.length ||
    ids.size !== collection.competitions.length
  )
    throw new Error("The event package has duplicate or missing competitions.");
  for (const link of collection.competitions) {
    const tournament = tournaments.find((t) => t.id === link.tournamentId);
    if (!tournament || !tournament.stages.some((s) => s.id === link.stageId))
      throw new Error("An event competition stage is missing.");
    if (
      link.bindings.some(
        (b) => !tournament.participants.some((p) => p.id === b.participantId),
      ) ||
      link.resources.some(
        (r) =>
          !tournament.schedule.resources.some((v) => v.id === r.resourceId),
      )
    )
      throw new Error("An event participant or venue reference is missing.");
  }
  for (const tournament of tournaments)
    if ((await hashDocument(tournament)) !== tournament.revisionHash)
      throw new Error("An event tournament failed its integrity check.");
  if (
    new TextEncoder().encode(canonicalize(value)).length > LIMITS.documentBytes
  )
    throw new Error("The event package is too large.");
  return { version: 1, collection, tournaments };
}
export async function exportCollection(
  collection: EventCollection,
  documents: Tournament[],
  options: { private: boolean; secret?: string },
) {
  if (options.private && !options.secret)
    throw new Error("Use a separate secret for a private event package.");
  const tournaments = await Promise.all(
    documents.map((d) =>
      sealDocument(options.private ? d : publicProjection(d)),
    ),
  );
  const projected = options.private
    ? collection
    : {
        ...collection,
        description: "",
        adjustments: collection.adjustments.map((a) => ({
          ...a,
          reason: "Organizer adjustment",
        })),
      };
  const bundle = await validateBundle({
    version: 1,
    collection: await sealCollection(projected),
    tournaments,
  });
  return encodeTransport(
    "TSE1",
    options.secret
      ? {
          encrypted: true,
          payload: await encryptJson(bundle, options.secret, "package"),
        }
      : { encrypted: false, payload: bundle },
  );
}
export async function importCollection(
  raw: string,
  secret?: string,
): Promise<{ bundle: CollectionBundle; encrypted: boolean }> {
  const envelope = z
    .object({ encrypted: z.boolean(), payload: z.unknown() })
    .strict()
    .parse(await decodeTransport("TSE1", raw));
  if (envelope.encrypted && !secret)
    throw new Error("Enter the event package secret.");
  const bundle = await validateBundle(
    envelope.encrypted
      ? await decryptJson(envelope.payload, secret!)
      : envelope.payload,
  );
  return { bundle, encrypted: envelope.encrypted };
}
export async function forkBundle(
  bundle: CollectionBundle,
  clearResults = false,
): Promise<CollectionBundle> {
  const source = await validateBundle(bundle);
  const mapping = new Map(
    source.tournaments.map((t) => [t.id, crypto.randomUUID()]),
  );
  const at = new Date().toISOString();
  const tournaments = await Promise.all(
    source.tournaments.map((t) => {
      const copy = structuredClone(t);
      if (clearResults) {
        copy.matches = [];
        copy.status = "draft";
        for (const stage of copy.stages) {
          stage.status = "draft";
          stage.metadata = {};
          if (stage.sources.length) stage.participantIds = [];
        }
        for (const p of copy.participants) {
          p.checkedIn = false;
          delete p.metadata.pointsAdjustment;
          delete p.metadata.availableFrom;
          delete p.metadata.availableUntil;
        }
      }
      delete copy.metadata.appliedPatches;
      return sealDocument({
        ...copy,
        id: mapping.get(t.id)!,
        revision: 1,
        history: [],
        createdAt: at,
        updatedAt: at,
      });
    }),
  );
  const collection = await sealCollection({
    ...source.collection,
    id: crypto.randomUUID(),
    revision: 1,
    updatedAt: at,
    archived: false,
    ...(clearResults ? { adjustments: [] } : {}),
    competitions: source.collection.competitions.map((c) => ({
      ...c,
      tournamentId: mapping.get(c.tournamentId)!,
    })),
  });
  return validateBundle({ version: 1, collection, tournaments });
}
