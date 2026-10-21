import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { compress, decompress } from "../security/codec";
import { exportArchive, importArchiveBundle } from "../sharing";
import { db, repository } from "./index";
import type { SnapshotRecord } from "./revision-store";
import { acceptUndo, recordUndo, type UndoState } from "../app/undo-session";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});
function fixture() {
  const doc = createTournament(
    "History command cup",
    Array.from({ length: 32 }, (_, index) =>
      createParticipant(`Player ${index}`, index + 1),
    ),
  );
  return generateStage(doc, doc.stages[0].id);
}
it("stores small edits as commands and reconstructs every retained revision", async () => {
  let doc = await repository.create(fixture());
  const expected = new Map([[doc.revision, doc]]);
  for (let index = 0; index < 55; index++) {
    doc = await repository.save(
      { ...doc, subtitle: `Note ${index}` },
      doc.revision,
      "Change note",
    );
    expected.set(doc.revision, doc);
  }
  const stored = await db.snapshots
    .where("tournamentId")
    .equals(doc.id)
    .sortBy("revision");
  expect(stored).toHaveLength(50);
  expect(stored[0].encoding).toBe("checkpoint-v1");
  expect(
    stored.filter((entry) => entry.encoding === "command-v1").length,
  ).toBeGreaterThan(35);
  const history = await repository.exportHistory(doc.id, doc.revision);
  for (const entry of history)
    expect(entry.tournament).toEqual(expected.get(entry.tournament.revision));
  const archive = await exportArchive(doc, undefined, history);
  const restored = await importArchiveBundle(archive);
  expect(restored.revisions).toHaveLength(50);
  await db.documents.clear();
  await db.snapshots.clear();
  await repository.createWithHistory(restored.tournament, restored.revisions!);
  expect(await repository.loadRevision(doc.id, 25)).toEqual(expected.get(25));
});
it("retains legacy untagged checkpoints and rejects unknown or corrupt commands without writes", async () => {
  const first = await repository.create(fixture());
  await db.snapshots.update([first.id, first.revision], {
    encoding: undefined,
  });
  const oldBytes = (await db.snapshots.get([first.id, first.revision]))!
    .payload;
  expect(await repository.loadRevision(first.id, 1)).toEqual(first);
  const next = await repository.save(
    { ...first, title: "After legacy import" },
    first.revision,
  );
  expect((await db.snapshots.get([first.id, 1]))!.payload).toEqual(oldBytes);
  const command = (await db.snapshots.get([first.id, 2]))!;
  expect(command.encoding).toBe("command-v1");
  await db.snapshots.put({
    ...command,
    encoding: "command-v99",
  } as unknown as SnapshotRecord);
  await expect(repository.loadRevision(first.id, 2)).rejects.toThrow(
    "newer storage format",
  );
  expect(await repository.load(first.id)).toEqual(next);
  await db.snapshots.put(command);
  const payload = decompress(command.payload as Uint8Array) as {
    checksum: string;
  };
  payload.checksum = "x".repeat(43);
  await db.snapshots.put({ ...command, payload: compress(payload) });
  await expect(repository.loadRevision(first.id, 2)).rejects.toThrow(
    "checksum",
  );
  expect(await repository.loadRevision(first.id, 1)).toEqual(first);
  await db.snapshots.put(command);
  await db.snapshots.delete([first.id, 1]);
  await expect(repository.loadRevision(first.id, 2)).rejects.toThrow(
    "incomplete",
  );
});
it("encrypts command contents and converts all history when changing vault mode", async () => {
  const secret = "test-only-history-secret";
  let doc = await repository.create(fixture(), secret);
  const first = doc;
  doc = await repository.save(
    { ...doc, title: "Private changed title" },
    doc.revision,
    "Private command description",
    secret,
  );
  const stored = JSON.stringify(await db.snapshots.toArray());
  expect(stored).not.toContain("Private changed title");
  expect(stored).not.toContain("Private command description");
  expect(stored).not.toContain(first.revisionHash);
  await expect(
    repository.loadRevision(doc.id, 2, "wrong-test-secret"),
  ).rejects.toThrow("Incorrect secret");
  expect(await repository.loadRevision(doc.id, 2, secret)).toEqual(doc);
  await repository.unprotect(doc.id, secret);
  expect(await repository.loadRevision(doc.id, 1)).toEqual(first);
  await repository.protect(doc.id, secret);
  expect(await repository.loadRevision(doc.id, 2, secret)).toEqual(doc);
  expect((await db.snapshots.toArray()).every((entry) => entry.protected)).toBe(
    true,
  );
});
it("requires reviewed played-match impact and rejects a stale restoration preview", async () => {
  const first = await repository.create(fixture());
  const match = first.matches.find((entry) => entry.status === "ready")!;
  const played = recordResult(first, match.id, {
    scores: [2, 0],
    winnerIds: [match.slots[0].participantId!],
    recordedAt: new Date().toISOString(),
    outcome: "played",
  });
  const saved = await repository.save(played, first.revision, "Record result");
  await expect(
    repository.restoreReviewed(
      first.id,
      1,
      saved.revision,
      saved.revisionHash,
      false,
      "Undo",
    ),
  ).rejects.toThrow("affected played matches");
  const newer = await repository.save(
    { ...saved, subtitle: "Another tab" },
    saved.revision,
  );
  await expect(
    repository.restoreReviewed(
      first.id,
      1,
      saved.revision,
      saved.revisionHash,
      true,
      "Undo",
    ),
  ).rejects.toThrow("changed after this preview");
  const undone = await repository.restoreReviewed(
    first.id,
    1,
    newer.revision,
    newer.revisionHash,
    true,
    "Undo result",
  );
  expect(
    undone.matches.find((entry) => entry.id === match.id)?.result,
  ).toBeUndefined();
  expect(
    (await repository.loadRevision(first.id, 2)).matches.find(
      (entry) => entry.id === match.id,
    )?.result,
  ).toBeTruthy();
});
it("maintains bounded undo/redo commands and clears redo after a new saved edit", async () => {
  const first = await repository.create(fixture());
  const second = await repository.save({ ...first, subtitle: "Second" }, 1);
  let state: UndoState = recordUndo(
    { undo: [], redo: [] },
    first,
    second,
    "Edit",
  );
  const undo = await repository.restoreReviewed(
    first.id,
    1,
    2,
    second.revisionHash,
    false,
    "Undo",
  );
  state = acceptUndo(state, "undo", undo);
  expect(state.undo).toHaveLength(0);
  expect(state.redo).toHaveLength(1);
  const redo = await repository.restoreReviewed(
    first.id,
    2,
    3,
    undo.revisionHash,
    false,
    "Redo",
  );
  state = acceptUndo(state, "redo", redo);
  expect(state.undo).toHaveLength(1);
  expect(state.redo).toHaveLength(0);
  state = recordUndo(state, first, second, "Unrelated session");
  expect(state.undo).toHaveLength(1);
});
it("keeps repeated undo and redo targets inside retained history", async () => {
  let doc = await repository.create(fixture());
  let state: UndoState = { undo: [], redo: [] };
  for (let index = 1; index <= 20; index++) {
    const saved = await repository.save(
      { ...doc, subtitle: `Edit ${index}` },
      doc.revision,
    );
    state = recordUndo(state, doc, saved, "Edit");
    doc = saved;
  }
  for (let cycle = 0; cycle < 3; cycle++)
    for (const direction of ["undo", "redo"] as const) {
      for (let index = 0; index < 20; index++) {
        const command = state[direction].at(-1)!;
        doc = await repository.restoreReviewed(
          doc.id,
          direction === "undo" ? command.before : command.after,
          doc.revision,
          doc.revisionHash,
          false,
          direction,
        );
        state = acceptUndo(state, direction, doc);
      }
      expect(doc.subtitle).toBe(direction === "undo" ? "" : "Edit 20");
    }
  expect(await repository.revisions(doc.id)).toHaveLength(50);
}, 15000);
