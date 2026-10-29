import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { createPatch, sealDocument } from "../sharing";
import { db, repository, RevisionConflictError } from "./index";
import * as revisions from "./revision-store";

afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
});

function fixture() {
  return createTournament("Original competition", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
}

function afterFirstRead(id: string, change: () => Promise<void>) {
  const read = db.documents.get.bind(db.documents);
  vi.spyOn(db.documents, "get").mockImplementationOnce(() =>
    read(id).then(async (captured) => {
      await change();
      return captured;
    }),
  );
}

it.each(["save", "patch", "protect", "unprotect"] as const)(
  "%s rejects a replacement imported with the same ID and revision",
  async (operation) => {
    const secret = "test-only-record-secret";
    const protectedMode = operation === "unprotect";
    const original = await repository.create(
      fixture(),
      protectedMode ? secret : undefined,
    );
    const target = await sealDocument({
      ...original,
      revision: original.revision + 1,
      subtitle: "Prepared by the older tab",
    });
    const patch = await createPatch(original, target);
    const replacement = await sealDocument({
      ...original,
      title: "Recovered competition",
    });
    afterFirstRead(original.id, async () => {
      await repository.remove(original.id);
      await repository.purge(original.id);
      await repository.create(replacement, protectedMode ? secret : undefined);
    });
    const write =
      operation === "save"
        ? repository.save(target, original.revision)
        : operation === "patch"
          ? repository.applyUpdate(original.id, patch)
          : operation === "protect"
            ? repository.protect(original.id, secret)
            : repository.unprotect(original.id, secret);
    await expect(write).rejects.toBeInstanceOf(RevisionConflictError);
    expect(await repository.load(original.id, secret)).toEqual(replacement);
    expect(
      await repository.loadRevision(original.id, original.revision, secret),
    ).toEqual(replacement);
    expect((await repository.list())[0].protected).toBe(protectedMode);
    expect(await repository.revisions(original.id)).toHaveLength(1);
  },
);

it.each(["save", "patch", "unprotect"] as const)(
  "%s rejects an older unlock after another tab changes the vault secret",
  async (operation) => {
    const firstSecret = "test-only-original-secret";
    const nextSecret = "test-only-replacement-secret";
    const original = await repository.create(fixture(), firstSecret);
    const target = await sealDocument({
      ...original,
      revision: original.revision + 1,
      subtitle: "Prepared using the older unlock",
    });
    const patch = await createPatch(original, target);
    const changeSecret = async () => {
      await repository.unprotect(original.id, firstSecret);
      await repository.protect(original.id, nextSecret);
    };
    if (operation === "unprotect") {
      const reconstruct = revisions.reconstructRevisions;
      vi.spyOn(revisions, "reconstructRevisions").mockImplementationOnce(
        async (...args) => {
          const captured = await reconstruct(...args);
          await changeSecret();
          return captured;
        },
      );
    } else afterFirstRead(original.id, changeSecret);
    const write =
      operation === "save"
        ? repository.save(target, original.revision, "Edit", firstSecret)
        : operation === "patch"
          ? repository.applyUpdate(original.id, patch, firstSecret)
          : repository.unprotect(original.id, firstSecret);
    await expect(write).rejects.toBeInstanceOf(RevisionConflictError);
    expect(await repository.load(original.id, nextSecret)).toEqual(original);
    expect(
      await repository.loadRevision(original.id, original.revision, nextSecret),
    ).toEqual(original);
    await expect(repository.load(original.id, firstSecret)).rejects.toThrow(
      "Incorrect secret",
    );
    expect((await repository.list())[0].protected).toBe(true);
    expect(await repository.revisions(original.id)).toHaveLength(1);
  },
);

it("rejects a stale editor hash before preparing a same-revision save", async () => {
  const original = await repository.create(fixture());
  const replacement = await sealDocument({
    ...original,
    title: "Recovered competition",
  });
  await repository.remove(original.id);
  await repository.purge(original.id);
  await repository.create(replacement);
  await expect(
    repository.save(
      { ...original, subtitle: "Edit from the older tab" },
      original.revision,
      "Edit",
      undefined,
      original.revisionHash,
    ),
  ).rejects.toBeInstanceOf(RevisionConflictError);
  expect(await repository.load(original.id)).toEqual(replacement);
  expect(await repository.loadRevision(original.id, 1)).toEqual(replacement);
});

it("uses the reviewed base hash when replacing content from another revision", async () => {
  const original = await repository.create(fixture());
  const imported = await sealDocument({
    ...original,
    revision: 14,
    title: "Imported competition",
  });
  const saved = await repository.save(
    imported,
    original.revision,
    "Replace reviewed content",
    undefined,
    original.revisionHash,
  );
  expect(saved.title).toBe(imported.title);
  expect(saved.revision).toBe(original.revision + 1);
  expect(await repository.loadRevision(original.id, 1)).toEqual(original);
});
