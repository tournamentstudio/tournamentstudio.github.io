import type { Tournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { canonicalize, compress, decompress, sha256 } from "../security/codec";
import {
  decryptJson,
  encryptJson,
  type EncryptedPayload,
} from "../security/crypto";
import { applyPatch, createPatch, hashDocument } from "../sharing";

export interface RevisionEntry {
  revision: number;
  at: string;
  action: string;
  hash: string;
}
export interface SnapshotRecord extends RevisionEntry {
  tournamentId: string;
  protected: boolean;
  encoding?: "checkpoint-v1" | "command-v1";
  baseRevision?: number;
  payload: Uint8Array | EncryptedPayload;
}

export async function compactRevision(
  previous: Tournament | undefined,
  document: Tournament,
  full: SnapshotRecord,
  secret?: string,
): Promise<SnapshotRecord> {
  if (
    !previous ||
    previous.createdAt !== document.createdAt ||
    document.revision % 10 === 1 ||
    document.revision !== previous.revision + 1
  )
    return full;
  const command = await createPatch(previous, document);
  const compressed = compress(command);
  if (compressed.length >= compress(document).length * 0.8) return full;
  const payload = full.protected
    ? await encryptJson(command, secret!, "revision")
    : compressed;
  return {
    ...full,
    encoding: "command-v1",
    baseRevision: previous.revision,
    payload,
    hash: full.protected
      ? await sha256(canonicalize(payload))
      : document.revisionHash,
  };
}

export async function reconstructRevisions(
  records: SnapshotRecord[],
  secret?: string,
  requested?: number[],
): Promise<Map<number, Tournament>> {
  const entries = new Map(records.map((entry) => [entry.revision, entry]));
  const documents = new Map<number, Tournament>();
  const visiting = new Set<number>();
  async function open(revision: number): Promise<Tournament> {
    const cached = documents.get(revision);
    if (cached) return cached;
    const record = entries.get(revision);
    if (!record || visiting.has(revision) || visiting.size > 50)
      throw new Error(
        "The revision command chain is incomplete or cyclic. Restore a backup.",
      );
    if (
      record.encoding &&
      !["checkpoint-v1", "command-v1"].includes(record.encoding)
    )
      throw new Error(
        "This revision uses a newer storage format. Keep the original data and update the application.",
      );
    if (record.protected && !secret)
      throw new Error("Unlock this revision with its secret.");
    visiting.add(revision);
    if (
      record.protected &&
      (await sha256(canonicalize(record.payload))) !== record.hash
    )
      throw new Error("The stored revision failed its integrity check.");
    const value = record.protected
      ? await decryptJson(record.payload, secret!)
      : decompress(record.payload as Uint8Array);
    let document: Tournament;
    if (record.encoding === "command-v1") {
      if (
        !Number.isInteger(record.baseRevision) ||
        record.baseRevision! >= record.revision
      )
        throw new Error("The revision command has an invalid base revision.");
      document = await applyPatch(await open(record.baseRevision!), value);
    } else document = validateTournament(value);
    if (
      document.id !== record.tournamentId ||
      document.revision !== revision ||
      (await hashDocument(document)) !== document.revisionHash ||
      (!record.protected && document.revisionHash !== record.hash)
    )
      throw new Error("The stored revision failed its integrity check.");
    visiting.delete(revision);
    documents.set(revision, document);
    return document;
  }
  for (const revision of requested ?? records.map((entry) => entry.revision))
    await open(revision);
  return documents;
}
