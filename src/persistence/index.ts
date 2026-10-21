import Dexie, { type Table } from "dexie";
import type { FormatId, Tournament, TournamentStatus } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { canonicalize, compress, decompress, sha256 } from "../security/codec";
import {
  decryptJson,
  encryptJson,
  type EncryptedPayload,
} from "../security/crypto";
import {
  applyPatch,
  hashDocument,
  sealDocument,
  validateArchiveRevisions,
  type ArchiveRevision,
  type TournamentPatch,
} from "../sharing";
import { previewSelectivePatch } from "../sharing/merge";

export interface LibraryEntry {
  id: string;
  title: string;
  sport: string;
  formats?: FormatId[];
  status: TournamentStatus;
  updatedAt: string;
  revision: number;
  protected: boolean;
  favorite: boolean;
  trashedAt?: string;
  lastBackupAt?: string;
  lastBackupRevision?: number;
}

export interface RevisionEntry {
  revision: number;
  at: string;
  action: string;
  hash: string;
}

interface DocumentRecord extends LibraryEntry {
  revisionHash: string;
  payload: Tournament | EncryptedPayload;
}

interface SnapshotRecord extends RevisionEntry {
  tournamentId: string;
  protected: boolean;
  payload: Uint8Array | EncryptedPayload;
}

class TournamentDatabase extends Dexie {
  documents!: Table<DocumentRecord, string>;
  snapshots!: Table<SnapshotRecord, [string, number]>;
  preferences!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("TournaStudio");
    this.version(1).stores({
      documents: "&id,updatedAt,trashedAt",
      snapshots: "[tournamentId+revision],tournamentId",
      preferences: "&key",
    });
  }
}

export const db = new TournamentDatabase();
const listeners = new Set<(event: { id: string; revision: number }) => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("tournastudio-revisions")
    : null;
channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (
    data &&
    typeof data === "object" &&
    "id" in data &&
    "revision" in data &&
    typeof data.id === "string" &&
    typeof data.revision === "number"
  ) {
    for (const listener of listeners)
      listener({ id: data.id, revision: data.revision });
  }
});

function notify(id: string, revision: number): void {
  const event = { id, revision };
  channel?.postMessage(event);
  for (const listener of listeners) listener(event);
}

export class RevisionConflictError extends Error {
  constructor(
    public expected: number,
    public actual: number,
  ) {
    super(
      `Another tab changed this tournament (revision ${actual}). Reload the saved copy before editing. Your unsaved copy can be exported for recovery.`,
    );
    this.name = "RevisionConflictError";
  }
}

function storageError(error: unknown): never {
  if (error instanceof Error && /quota/i.test(error.name + error.message))
    throw new Error(
      "Browser storage is full. Export a backup, free storage space, and retry. The previous saved revision is intact.",
    );
  if (
    error instanceof Error &&
    /SecurityError|InvalidStateError/.test(error.name)
  )
    throw new Error(
      "Browser storage is unavailable. Allow local storage or use a regular browser profile.",
    );
  throw error;
}

function entryFor(
  tournament: Tournament,
  protectedMode: boolean,
  previous?: LibraryEntry,
): LibraryEntry {
  return {
    id: tournament.id,
    title: protectedMode ? "Protected tournament" : tournament.title,
    sport: protectedMode ? "" : tournament.sport,
    ...(!protectedMode
      ? {
          formats: [...new Set(tournament.stages.map((stage) => stage.format))],
        }
      : {}),
    status: protectedMode ? "draft" : tournament.status,
    revision: tournament.revision,
    updatedAt: tournament.updatedAt,
    protected: protectedMode,
    favorite: previous?.favorite ?? false,
    ...(previous?.trashedAt ? { trashedAt: previous.trashedAt } : {}),
    ...(previous?.lastBackupAt ? { lastBackupAt: previous.lastBackupAt } : {}),
    ...(previous?.lastBackupRevision !== undefined
      ? { lastBackupRevision: previous.lastBackupRevision }
      : {}),
  };
}

async function openRecord(
  record: DocumentRecord,
  secret?: string,
): Promise<Tournament> {
  if (record.protected && !secret)
    throw new Error("Unlock this tournament with its secret.");
  const value = record.protected
    ? await decryptJson(record.payload, secret!)
    : record.payload;
  const document = validateTournament(value);
  const storedHash = record.protected
    ? await sha256(canonicalize(record.payload))
    : document.revisionHash;
  if (
    document.id !== record.id ||
    document.revision !== record.revision ||
    storedHash !== record.revisionHash ||
    (await hashDocument(document)) !== document.revisionHash
  ) {
    throw new Error(
      "The saved tournament failed its integrity check. Restore a backup or an earlier revision.",
    );
  }
  return document;
}

async function prepareRecord(
  document: Tournament,
  protectedMode: boolean,
  secret?: string,
  previous?: LibraryEntry,
): Promise<DocumentRecord> {
  if (protectedMode && !secret)
    throw new Error("The tournament must be unlocked before saving.");
  const payload = protectedMode
    ? await encryptJson(document, secret!)
    : document;
  return {
    ...entryFor(document, protectedMode, previous),
    revisionHash: protectedMode
      ? await sha256(canonicalize(payload))
      : document.revisionHash,
    payload,
  };
}

function snapshotFor(record: DocumentRecord, action: string): SnapshotRecord {
  return {
    tournamentId: record.id,
    revision: record.revision,
    at: record.updatedAt,
    action: record.protected ? "Protected change" : action.slice(0, 1000),
    hash: record.revisionHash,
    protected: record.protected,
    payload: record.protected
      ? (record.payload as EncryptedPayload)
      : compress(record.payload),
  };
}

async function storeRecord(
  record: DocumentRecord,
  expectedRevision: number | undefined,
  action: string,
): Promise<void> {
  try {
    await db.transaction("rw", db.documents, db.snapshots, async () => {
      const current = await db.documents.get(record.id);
      if (expectedRevision === undefined) {
        if (current)
          throw new Error(
            "A tournament with this ID already exists. Save a separate copy or explicitly replace it.",
          );
      } else if (
        !current ||
        current.revision !== expectedRevision ||
        current.protected !== record.protected
      ) {
        throw new RevisionConflictError(
          expectedRevision,
          current?.revision ?? -1,
        );
      }
      await db.documents.put(record);
      await db.snapshots.put(snapshotFor(record, action));
      const snapshots = await db.snapshots
        .where("tournamentId")
        .equals(record.id)
        .sortBy("revision");
      const expired = snapshots.slice(0, Math.max(0, snapshots.length - 50));
      if (expired.length)
        await db.snapshots.bulkDelete(
          expired.map((snapshot) => [record.id, snapshot.revision]),
        );
    });
  } catch (error) {
    storageError(error);
  }
  notify(record.id, record.revision);
}

export const repository = {
  async list(): Promise<LibraryEntry[]> {
    try {
      const records = await db.documents
        .orderBy("updatedAt")
        .reverse()
        .toArray();
      return records.map(
        ({ payload, revisionHash: _revisionHash, ...entry }) => ({
          ...entry,
          ...(!entry.protected && !entry.formats
            ? {
                formats: [
                  ...new Set(
                    validateTournament(payload).stages.map(
                      (stage) => stage.format,
                    ),
                  ),
                ],
              }
            : {}),
        }),
      );
    } catch (error) {
      return storageError(error);
    }
  },

  async load(id: string, secret?: string): Promise<Tournament> {
    const record = await db.documents.get(id);
    if (!record)
      throw new Error("This tournament is not stored in this browser.");
    return openRecord(record, secret);
  },

  async create(input: Tournament, secret?: string): Promise<Tournament> {
    let document = validateTournament(input);
    if (document.revision === 0) {
      const at = new Date().toISOString();
      document = {
        ...document,
        revision: 1,
        updatedAt: at,
        history: [
          {
            id: crypto.randomUUID(),
            at,
            revision: 1,
            action: "Created tournament",
          },
        ],
      };
    }
    document = await sealDocument(document);
    const record = await prepareRecord(document, Boolean(secret), secret);
    await storeRecord(record, undefined, "Created or imported tournament");
    return document;
  },

  async createMany(
    inputs: Tournament[],
    secret?: string,
    eventPreference?: { key: string; value: string },
  ): Promise<Tournament[]> {
    if (
      inputs.length > 64 ||
      new Set(inputs.map((d) => d.id)).size !== inputs.length
    )
      throw new Error("An event import needs at most 64 distinct tournaments.");
    if (
      eventPreference &&
      (!/^event:[a-zA-Z0-9-]{1,120}$/.test(eventPreference.key) ||
        eventPreference.value.length > 24 * 1024 * 1024)
    )
      throw new Error("Invalid event storage record.");
    const documents = await Promise.all(
      inputs.map((input) =>
        sealDocument({
          ...validateTournament(input),
          revision: Math.max(1, input.revision),
        }),
      ),
    );
    const records = await Promise.all(
      documents.map((document) =>
        prepareRecord(document, Boolean(secret), secret),
      ),
    );
    try {
      await db.transaction(
        "rw",
        db.documents,
        db.snapshots,
        db.preferences,
        async () => {
          if (
            (await db.documents.bulkGet(records.map((r) => r.id))).some(
              Boolean,
            ) ||
            (eventPreference && (await db.preferences.get(eventPreference.key)))
          )
            throw new Error(
              "An event import would replace existing data. Import a separate fork instead.",
            );
          await db.documents.bulkAdd(records);
          await db.snapshots.bulkAdd(
            records.map((record) =>
              snapshotFor(record, "Imported event competition"),
            ),
          );
          if (eventPreference) await db.preferences.add(eventPreference);
        },
      );
    } catch (error) {
      storageError(error);
    }
    for (const record of records) notify(record.id, record.revision);
    return documents;
  },

  async save(
    input: Tournament,
    expectedRevision: number,
    action = "Updated tournament",
    secret?: string,
  ): Promise<Tournament> {
    const validated = validateTournament(input);
    const current = await db.documents.get(validated.id);
    if (!current || current.revision !== expectedRevision)
      throw new RevisionConflictError(
        expectedRevision,
        current?.revision ?? -1,
      );
    // Unlocking is checked on every protected write. A wrong secret never replaces a vault.
    const previous = await openRecord(current, secret);
    const at = new Date().toISOString();
    const document = await sealDocument({
      ...validated,
      revision: expectedRevision + 1,
      updatedAt: at,
      history: [
        ...previous.history,
        {
          id: crypto.randomUUID(),
          at,
          revision: expectedRevision + 1,
          action: action.slice(0, 1000),
        },
      ].slice(-500),
    });
    await storeRecord(
      await prepareRecord(document, current.protected, secret, current),
      expectedRevision,
      action,
    );
    return document;
  },

  async exportHistory(
    id: string,
    expectedRevision: number,
    secret?: string,
  ): Promise<ArchiveRevision[]> {
    const captured = await db.transaction(
      "r",
      db.documents,
      db.snapshots,
      async () => ({
        current: await db.documents.get(id),
        snapshots: await db.snapshots
          .where("tournamentId")
          .equals(id)
          .toArray(),
      }),
    );
    if (!captured.current || captured.current.revision !== expectedRevision)
      throw new RevisionConflictError(
        expectedRevision,
        captured.current?.revision ?? -1,
      );
    const current = await openRecord(captured.current, secret);
    const entries: ArchiveRevision[] = [];
    for (const snapshot of captured.snapshots) {
      const value = snapshot.protected
        ? await decryptJson(snapshot.payload, secret!)
        : decompress(snapshot.payload as Uint8Array);
      const tournament = validateTournament(value);
      const hash = snapshot.protected
        ? await sha256(canonicalize(snapshot.payload))
        : tournament.revisionHash;
      if (hash !== snapshot.hash || snapshot.revision !== tournament.revision)
        throw new Error("The stored revision failed its integrity check.");
      entries.push({ action: snapshot.action, tournament });
    }
    return validateArchiveRevisions(current, entries);
  },

  async createWithHistory(
    input: Tournament,
    revisions: ArchiveRevision[],
    secret?: string,
    fork = false,
  ): Promise<Tournament> {
    let document = await sealDocument(input);
    let history = await validateArchiveRevisions(document, revisions);
    if (fork) {
      const id = crypto.randomUUID();
      document = await sealDocument({ ...document, id });
      history = await Promise.all(
        history.map(async (entry) => ({
          action: entry.action,
          tournament: await sealDocument({ ...entry.tournament, id }),
        })),
      );
    }
    const record = await prepareRecord(document, Boolean(secret), secret);
    const snapshots: SnapshotRecord[] = [];
    for (const entry of history) {
      const prepared = await prepareRecord(
        entry.tournament,
        Boolean(secret),
        secret,
      );
      snapshots.push(snapshotFor(prepared, entry.action));
    }
    if (!snapshots.some((snapshot) => snapshot.revision === record.revision))
      snapshots.push(snapshotFor(record, "Restored backup"));
    try {
      await db.transaction("rw", db.documents, db.snapshots, async () => {
        if (await db.documents.get(document.id))
          throw new Error(
            "A tournament with this ID already exists. Save a separate copy or explicitly replace it.",
          );
        await db.documents.add(record);
        await db.snapshots.bulkPut(snapshots.slice(-50));
      });
    } catch (error) {
      storageError(error);
    }
    notify(document.id, document.revision);
    return document;
  },

  async applyUpdate(
    id: string,
    patch: TournamentPatch,
    secret?: string,
  ): Promise<Tournament> {
    const current = await db.documents.get(id);
    if (!current)
      throw new Error("Import the initial tournament snapshot first.");
    const base = await openRecord(current, secret);
    const next = await applyPatch(base, patch);
    await storeRecord(
      await prepareRecord(next, current.protected, secret, current),
      current.revision,
      "Applied update packet",
    );
    return next;
  },

  async mergeUpdate(
    id: string,
    patch: TournamentPatch,
    selected: number[],
    expectedHash: string,
    confirmInvalidate: boolean,
    secret?: string,
  ): Promise<Tournament> {
    const current = await repository.load(id, secret);
    if ((await hashDocument(current)) !== expectedHash)
      throw new Error(
        "The local tournament changed after the merge preview. Review the update again.",
      );
    const base = await repository.loadRevision(id, patch.baseRevision, secret);
    const preview = await previewSelectivePatch(current, base, patch, selected);
    if (preview.affected.length && !confirmInvalidate)
      throw new Error(
        "Confirm the affected played matches before merging this update.",
      );
    return repository.save(
      preview.tournament,
      current.revision,
      `Merged ${selected.length} selected update changes`,
      secret,
    );
  },

  async remove(id: string): Promise<void> {
    await db.documents.update(id, { trashedAt: new Date().toISOString() });
    notify(id, -1);
  },

  async restore(id: string): Promise<void> {
    await db.documents.update(id, { trashedAt: undefined });
    notify(id, -1);
  },

  async purge(id: string): Promise<void> {
    await db.transaction("rw", db.documents, db.snapshots, async () => {
      const record = await db.documents.get(id);
      if (!record?.trashedAt)
        throw new Error(
          "Move a tournament to trash before deleting it permanently.",
        );
      await db.documents.delete(id);
      await db.snapshots.where("tournamentId").equals(id).delete();
    });
    notify(id, -1);
  },

  async revisions(id: string): Promise<RevisionEntry[]> {
    const entries = await db.snapshots
      .where("tournamentId")
      .equals(id)
      .reverse()
      .sortBy("revision");
    return entries
      .map(({ revision, at, action, hash }) => ({ revision, at, action, hash }))
      .sort((left, right) => right.revision - left.revision);
  },

  async loadRevision(
    id: string,
    revision: number,
    secret?: string,
  ): Promise<Tournament> {
    const snapshot = await db.snapshots.get([id, revision]);
    if (!snapshot)
      throw new Error(
        "This revision is no longer in the local history. Restore an exported backup instead.",
      );
    if (snapshot.protected && !secret)
      throw new Error("Unlock this revision with its secret.");
    const value = snapshot.protected
      ? await decryptJson(snapshot.payload, secret!)
      : decompress(snapshot.payload as Uint8Array);
    const document = validateTournament(value);
    const storedHash = snapshot.protected
      ? await sha256(canonicalize(snapshot.payload))
      : document.revisionHash;
    if (
      storedHash !== snapshot.hash ||
      (await hashDocument(document)) !== document.revisionHash ||
      document.id !== id ||
      document.revision !== revision
    )
      throw new Error("The stored revision failed its integrity check.");
    return document;
  },

  async restoreRevision(
    id: string,
    revision: number,
    secret?: string,
  ): Promise<Tournament> {
    const current = await repository.load(id, secret);
    const historical = await repository.loadRevision(id, revision, secret);
    return repository.save(
      historical,
      current.revision,
      `Restored revision ${revision}`,
      secret,
    );
  },

  async protect(id: string, secret: string): Promise<Tournament> {
    const current = await db.documents.get(id);
    if (!current) throw new Error("Tournament not found.");
    if (current.protected) return openRecord(current, secret);
    const document = await openRecord(current);
    const record = await prepareRecord(document, true, secret, current);
    const previousSnapshots = await db.snapshots
      .where("tournamentId")
      .equals(id)
      .toArray();
    const snapshots: SnapshotRecord[] = [];
    for (const snapshot of previousSnapshots) {
      const payload = await encryptJson(
        decompress(snapshot.payload as Uint8Array),
        secret,
        "revision",
      );
      snapshots.push({
        ...snapshot,
        action: "Protected change",
        protected: true,
        hash: await sha256(canonicalize(payload)),
        payload,
      });
    }
    await db.transaction("rw", db.documents, db.snapshots, async () => {
      const latest = await db.documents.get(id);
      if (latest?.revision !== current.revision || latest.protected)
        throw new RevisionConflictError(
          current.revision,
          latest?.revision ?? -1,
        );
      await db.documents.put(record);
      await db.snapshots.bulkPut(snapshots);
    });
    notify(id, document.revision);
    return document;
  },

  async unprotect(id: string, secret: string): Promise<Tournament> {
    const current = await db.documents.get(id);
    if (!current) throw new Error("Tournament not found.");
    const document = await openRecord(current, secret);
    if (!current.protected) return document;
    const snapshots = await db.snapshots
      .where("tournamentId")
      .equals(id)
      .toArray();
    const decrypted: SnapshotRecord[] = [];
    for (const snapshot of snapshots) {
      const value = validateTournament(
        await decryptJson(snapshot.payload, secret),
      );
      decrypted.push({
        ...snapshot,
        action: "Restored private revision",
        hash: value.revisionHash,
        protected: false,
        payload: compress(value),
      });
    }
    const record = await prepareRecord(document, false, undefined, current);
    await db.transaction("rw", db.documents, db.snapshots, async () => {
      const latest = await db.documents.get(id);
      if (latest?.revision !== current.revision || !latest.protected)
        throw new RevisionConflictError(
          current.revision,
          latest?.revision ?? -1,
        );
      await db.documents.put(record);
      await db.snapshots.bulkPut(decrypted);
    });
    notify(id, document.revision);
    return document;
  },

  async favorite(id: string, favorite: boolean): Promise<void> {
    await db.documents.update(id, { favorite });
    notify(id, -1);
  },

  async markBackup(id: string, exportedRevision: number): Promise<void> {
    await db.transaction("rw", db.documents, async () => {
      const record = await db.documents.get(id);
      if (!record) throw new Error("Tournament not found on this device.");
      if (
        !Number.isInteger(exportedRevision) ||
        exportedRevision < 1 ||
        exportedRevision > record.revision
      )
        throw new Error("The backup revision does not match a saved revision.");
      if ((record.lastBackupRevision ?? 0) > exportedRevision) return;
      await db.documents.update(id, {
        lastBackupAt: new Date().toISOString(),
        lastBackupRevision: exportedRevision,
      });
    });
    notify(id, -1);
  },

  subscribe(
    listener: (event: { id: string; revision: number }) => void,
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async storageHealth(): Promise<{
    usage: number;
    quota: number;
    persistent: boolean;
    available: boolean;
  }> {
    const storage =
      typeof navigator !== "undefined" ? navigator.storage : undefined;
    const estimate = await storage?.estimate?.();
    const persistent = (await storage?.persisted?.()) ?? false;
    return {
      usage: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
      persistent,
      available: Boolean(storage),
    };
  },

  async requestPersistence(): Promise<boolean> {
    return typeof navigator !== "undefined"
      ? ((await navigator.storage?.persist?.()) ?? false)
      : false;
  },
};
