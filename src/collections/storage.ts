import { z } from "zod";
import { db } from "../persistence";
import { canonicalize, safeParse } from "../security/codec";
import { decryptJson, encryptedSchema, encryptJson } from "../security/crypto";
import {
  sealCollection,
  validateCollection,
  type EventCollection,
} from "./model";

const recordSchema = z
  .object({
    id: z.string(),
    revision: z.number().int(),
    title: z.string(),
    protected: z.boolean(),
    updatedAt: z.string(),
    archived: z.boolean(),
    payload: z.unknown(),
  })
  .strict();
export type CollectionEntry = Omit<z.infer<typeof recordSchema>, "payload">;
export const collectionKey = (id: string) => `event:${id}`;
export async function prepareCollection(
  input: EventCollection,
  secret?: string,
) {
  const document = await sealCollection(input);
  const record = {
    id: document.id,
    revision: document.revision,
    title: secret ? "Protected event" : document.title,
    protected: Boolean(secret),
    updatedAt: document.updatedAt,
    archived: secret ? false : document.archived,
    payload: secret ? await encryptJson(document, secret, "package") : document,
  };
  return {
    document,
    preference: {
      key: collectionKey(document.id),
      value: canonicalize(record),
    },
  };
}
async function open(value: string, secret?: string) {
  const record = recordSchema.parse(safeParse(value));
  if (record.protected && !secret)
    throw new Error("Unlock the event with its secret.");
  const document = validateCollection(
    record.protected
      ? await decryptJson(encryptedSchema.parse(record.payload), secret!)
      : record.payload,
  );
  if (
    document.id !== record.id ||
    document.revision !== record.revision ||
    (await sealCollection(document)).hash !== document.hash
  )
    throw new Error("The event failed its integrity check.");
  return document;
}
export const collectionRepository = {
  async list(): Promise<CollectionEntry[]> {
    const records = await db.preferences
      .where("key")
      .startsWith("event:")
      .toArray();
    return records
      .map((row) => {
        const { payload: _payload, ...entry } = recordSchema.parse(
          safeParse(row.value),
        );
        return entry;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async load(id: string, secret?: string) {
    const row = await db.preferences.get(collectionKey(id));
    if (!row) throw new Error("This event is not stored in this browser.");
    return open(row.value, secret);
  },
  async save(
    input: EventCollection,
    expected: number | undefined,
    secret?: string,
  ) {
    const old = await db.preferences.get(collectionKey(input.id));
    if (expected === undefined ? Boolean(old) : !old)
      throw new Error("The event changed. Reload it before saving.");
    if (old) {
      const previous = await open(old.value, secret);
      if (previous.revision !== expected)
        throw new Error("The event changed. Reload it before saving.");
      if (
        recordSchema.parse(safeParse(old.value)).protected !== Boolean(secret)
      )
        throw new Error(
          "The event storage mode cannot change during an ordinary save.",
        );
    }
    const prepared = await prepareCollection(
      {
        ...input,
        revision: (expected ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      },
      secret,
    );
    await db.transaction("rw", db.preferences, async () => {
      const current = await db.preferences.get(prepared.preference.key);
      if (current?.value !== old?.value)
        throw new Error("The event changed. Reload it before saving.");
      await db.preferences.put(prepared.preference);
    });
    return prepared.document;
  },
};
