import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { createPatch, sealDocument } from "../sharing";
import { db, repository } from "./index";

afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
});

const operations = ["save", "patch", "protect", "unprotect"] as const;

it.each(operations)(
  "%s retains library changes made while a document write is being prepared",
  async (operation) => {
    const secret = "test-only-library-secret";
    const document = await repository.create(
      createTournament("Library state", [
        createParticipant("North", 1),
        createParticipant("South", 2),
      ]),
      operation === "unprotect" ? secret : undefined,
    );
    const patch = await createPatch(
      document,
      await sealDocument({
        ...document,
        revision: document.revision + 1,
        subtitle: "Updated match report",
      }),
    );
    const read = db.documents.get.bind(db.documents);
    vi.spyOn(db.documents, "get").mockImplementationOnce(() =>
      read(document.id).then(async (captured) => {
        await repository.favorite(document.id, true);
        await repository.remove(document.id);
        await repository.markBackup(document.id, document.revision);
        return captured;
      }),
    );
    if (operation === "save")
      await repository.save(
        { ...document, subtitle: "Updated match report" },
        document.revision,
      );
    if (operation === "patch")
      await repository.applyUpdate(document.id, patch);
    if (operation === "protect")
      await repository.protect(document.id, secret);
    if (operation === "unprotect")
      await repository.unprotect(document.id, secret);
    const [entry] = await repository.list();
    expect(entry.favorite).toBe(true);
    expect(entry.trashedAt).toBeTruthy();
    expect(entry.lastBackupRevision).toBe(document.revision);
    expect(entry.lastBackupAt).toBeTruthy();
    expect(entry.protected).toBe(operation === "protect");
    expect((await repository.load(document.id, secret)).revision).toBe(
      document.revision + Number(operation === "save" || operation === "patch"),
    );
  },
);

it("does not undo a concurrent restore or favorite removal", async () => {
  const document = await repository.create(
    createTournament("Restored library state", [
      createParticipant("North", 1),
      createParticipant("South", 2),
    ]),
  );
  await repository.favorite(document.id, true);
  await repository.remove(document.id);
  const read = db.documents.get.bind(db.documents);
  vi.spyOn(db.documents, "get").mockImplementationOnce(() =>
    read(document.id).then(async (captured) => {
      await repository.favorite(document.id, false);
      await repository.restore(document.id);
      return captured;
    }),
  );
  await repository.save(document, document.revision);
  const [entry] = await repository.list();
  expect(entry.favorite).toBe(false);
  expect(entry.trashedAt).toBeUndefined();
});
