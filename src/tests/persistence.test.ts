import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { db, repository, RevisionConflictError } from "../persistence";
import {
  createPatch,
  exportArchive,
  importArchive,
  sealDocument,
} from "../sharing";

function fixture() {
  return createTournament("Local tournament", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
});

describe("transactional persistence", () => {
  it("creates, saves and reloads confirmed revisions", async () => {
    const first = await repository.create(fixture());
    expect(first.revision).toBe(1);
    const next = await repository.save(
      { ...first, title: "Updated title" },
      first.revision,
      "Renamed tournament",
    );
    expect(next.revision).toBe(2);
    expect(await repository.load(first.id)).toEqual(next);
    expect((await repository.list())[0].title).toBe("Updated title");
    expect(
      (await repository.revisions(first.id)).map((entry) => entry.revision),
    ).toEqual([2, 1]);
    expect((await repository.loadRevision(first.id, 1)).title).toBe(
      "Local tournament",
    );
  });

  it("restores an older revision as a new recoverable change", async () => {
    const first = await repository.create(fixture());
    await repository.save({ ...first, title: "Changed title" }, 1, "Rename");
    const restored = await repository.restoreRevision(first.id, 1);
    expect(restored.revision).toBe(3);
    expect(restored.title).toBe("Local tournament");
    expect((await repository.loadRevision(first.id, 2)).title).toBe(
      "Changed title",
    );
    expect(restored.history.at(-1)?.action).toBe("Restored revision 1");
  });

  it("rejects stale writes and commits exactly one racing update", async () => {
    const first = await repository.create(fixture());
    const outcomes = await Promise.allSettled([
      repository.save({ ...first, title: "First writer" }, 1, "First write"),
      repository.save({ ...first, title: "Second writer" }, 1, "Second write"),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    await expect(repository.save(first, 1)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    expect((await repository.load(first.id)).revision).toBe(2);
    expect(await repository.revisions(first.id)).toHaveLength(2);
  });

  it("preserves imported snapshot identity for subsequent patches", async () => {
    const original = await sealDocument({ ...fixture(), revision: 10 });
    const imported = await repository.create(original);
    expect(imported).toEqual(original);
    const target = await sealDocument({
      ...original,
      revision: 13,
      subtitle: "Three more matches",
    });
    const patch = await createPatch(original, target);
    expect(await repository.applyUpdate(original.id, patch)).toEqual(target);
    await expect(repository.applyUpdate(original.id, patch)).rejects.toThrow(
      "already applied",
    );
  });

  it("moves to trash, restores and requires trash before permanent deletion", async () => {
    const document = await repository.create(fixture());
    await expect(repository.purge(document.id)).rejects.toThrow("trash");
    await repository.remove(document.id);
    expect((await repository.list())[0].trashedAt).toBeTruthy();
    await repository.restore(document.id);
    expect((await repository.list())[0].trashedAt).toBeUndefined();
    await repository.remove(document.id);
    await repository.purge(document.id);
    expect(await repository.list()).toEqual([]);
    expect(await repository.revisions(document.id)).toEqual([]);
  });

  it("notifies listeners only after the successful write", async () => {
    const received: { id: string; revision: number }[] = [];
    const stop = repository.subscribe((event) => received.push(event));
    const document = await repository.create(fixture());
    expect(received).toEqual([{ id: document.id, revision: 1 }]);
    await expect(repository.save(document, 0)).rejects.toThrow();
    expect(received).toHaveLength(1);
    stop();
  });

  it("rolls back failed saves and reports quota errors", async () => {
    const document = await repository.create(fixture());
    vi.spyOn(db.snapshots, "put").mockRejectedValueOnce(
      new DOMException("Test quota", "QuotaExceededError"),
    );
    await expect(
      repository.save({ ...document, title: "Never committed" }, 1),
    ).rejects.toThrow("storage is full");
    expect((await repository.load(document.id)).title).toBe("Local tournament");
    expect((await repository.load(document.id)).revision).toBe(1);
  });

  it("keeps backup and favorite flags outside competition revisions", async () => {
    const document = await repository.create(fixture());
    await repository.favorite(document.id, true);
    await repository.markBackup(document.id);
    const entry = (await repository.list())[0];
    expect(entry.favorite).toBe(true);
    expect(entry.lastBackupAt).toBeTruthy();
    expect(entry.revision).toBe(1);
  });

  it("keeps the latest 50 snapshots while leaving audit history intact", async () => {
    let document = await repository.create(fixture());
    for (let index = 0; index < 51; index++)
      document = await repository.save(
        { ...document, subtitle: `Round ${index}` },
        document.revision,
        "Updated round note",
      );
    const revisions = await repository.revisions(document.id);
    expect(revisions).toHaveLength(50);
    expect(revisions[0].revision).toBe(52);
    expect(revisions.at(-1)?.revision).toBe(3);
    expect(document.history).toHaveLength(52);
    await expect(repository.loadRevision(document.id, 1)).rejects.toThrow(
      "no longer",
    );
    expect((await repository.loadRevision(document.id, 3)).revision).toBe(3);
  });
});

describe("protected local vault", () => {
  const secret = "test-only-not-for-use";

  it("stores no private plaintext and rejects incorrect unlocking secrets", async () => {
    const document = fixture();
    document.title = "Private vault event";
    document.metadata.private = "Never persist this plaintext";
    const saved = await repository.create(document, secret);
    const stored = JSON.stringify(await db.documents.get(saved.id));
    expect(stored).not.toContain(document.title);
    expect(stored).not.toContain("Never persist this plaintext");
    expect(stored).not.toContain(saved.revisionHash);
    expect((await repository.list())[0].title).toBe("Protected tournament");
    await expect(repository.load(saved.id)).rejects.toThrow("Unlock");
    await expect(
      repository.load(saved.id, "incorrect-test-secret"),
    ).rejects.toThrow("Incorrect secret");
    expect(await repository.load(saved.id, secret)).toEqual(saved);
    const snapshot = JSON.stringify(await db.snapshots.toArray());
    expect(snapshot).not.toContain(document.title);
    expect(snapshot).not.toContain(saved.revisionHash);
  });

  it("encrypts previous revisions when protecting an existing tournament", async () => {
    const first = await repository.create(fixture());
    const next = await repository.save(
      { ...first, title: "Private historical title" },
      1,
      "Title includes private content",
    );
    await repository.protect(next.id, secret);
    const stored = JSON.stringify({
      current: await db.documents.toArray(),
      revisions: await db.snapshots.toArray(),
    });
    expect(stored).not.toContain("Private historical title");
    expect(stored).not.toContain("Title includes private content");
    expect((await repository.loadRevision(next.id, 1, secret)).title).toBe(
      first.title,
    );
    await expect(
      repository.save(next, 2, "Attempted write", "incorrect-test-secret"),
    ).rejects.toThrow("Incorrect secret");
    expect((await repository.load(next.id, secret)).revision).toBe(2);
    await repository.unprotect(next.id, secret);
    expect((await repository.load(next.id)).title).toBe(
      "Private historical title",
    );
  });

  it("recovers a protected archive into an independent local store", async () => {
    const saved = await repository.create(fixture(), secret);
    const archive = await exportArchive(saved, secret);
    await db.documents.clear();
    await db.snapshots.clear();
    const imported = await importArchive(archive, secret);
    await repository.create(imported, secret);
    expect(await repository.load(imported.id, secret)).toEqual(saved);
    await expect(repository.load(imported.id)).rejects.toThrow("Unlock");
  });
});
