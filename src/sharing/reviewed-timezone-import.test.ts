import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { db, repository } from "../persistence";
import {
  applyPatch,
  createPatch,
  exportArchive,
  hashDocument,
  importArchiveBundle,
  sealDocument,
  validateArchiveRevisions,
} from "./index";
import type { LegacyTimezoneChoice } from "./legacy-timezones";
import { prepareReviewedTimezoneImport } from "./reviewed-timezone-import";

const action = "Correct imported schedule timezone";
const choices: LegacyTimezoneChoice[] = [
  { fieldId: "/schedule/startAt", timeZone: "Asia/Tehran" },
];

function fixture() {
  const document = createTournament("جام زمان", [
    createParticipant("تیم یک", 1),
    createParticipant("Team two", 2),
  ]);
  document.revision = 7;
  document.timezone = "Asia/Tehran";
  document.schedule.startAt = "2026-10-22T09:30";
  return document;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
});

describe("reviewed timezone imports", () => {
  it("keeps uncorrected imports unchanged without creating a revision", async () => {
    const original = await sealDocument(fixture());
    const revisions = [{ action: "Saved", tournament: original }];
    const prepared = await prepareReviewedTimezoneImport(
      original,
      revisions,
      [],
      action,
    );
    expect(prepared.tournament).toBe(original);
    expect(prepared.revisions).toBe(revisions);
  });

  it("seals raw JSON as a recoverable baseline and saves the correction atomically", async () => {
    const original = fixture();
    original.revision = 0;
    const originalBytes = JSON.stringify(original);
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    expect(JSON.stringify(original)).toBe(originalBytes);
    expect(prepared.tournament.revision).toBe(1);
    expect(prepared.tournament.schedule.startAt).toBe(
      "2026-10-22T06:00:00.000Z",
    );
    expect(prepared.tournament.createdAt).toBe(original.createdAt);
    expect(prepared.tournament.history.at(-1)).toMatchObject({
      action,
      revision: 1,
      at: prepared.tournament.updatedAt,
    });
    const saved = await repository.createWithHistory(
      prepared.tournament,
      prepared.revisions,
    );
    expect(await repository.load(saved.id)).toEqual(prepared.tournament);
    const baseline = await repository.loadRevision(saved.id, 0);
    expect(baseline).toEqual(await sealDocument(original));
    expect(baseline.revisionHash).toBe(await hashDocument(baseline));
    expect(
      (await repository.revisions(saved.id)).map((item) => item.revision),
    ).toEqual([1, 0]);
  });

  it("retains existing history content and hashes without modifying old revisions", async () => {
    const original = await sealDocument(fixture());
    const prior = await sealDocument({
      ...original,
      revision: 6,
      title: "Before",
    });
    const revisions = [
      { action: "Earlier revision", tournament: prior },
      { action: "Saved backup", tournament: original },
    ];
    const historyBytes = JSON.stringify(revisions);
    const prepared = await prepareReviewedTimezoneImport(
      original,
      revisions,
      choices,
      action,
    );
    expect(JSON.stringify(revisions)).toBe(historyBytes);
    expect(prepared.revisions.slice(0, 2)).toEqual(revisions);
    expect(prepared.revisions[1].tournament.revisionHash).toBe(
      original.revisionHash,
    );
    expect(prepared.tournament.revision).toBe(8);
    await expect(
      validateArchiveRevisions(prepared.tournament, prepared.revisions),
    ).resolves.toEqual(prepared.revisions);
  });

  it("retains the source baseline when the history and audit limits are reached", async () => {
    const raw = fixture();
    raw.revision = 50;
    raw.history = Array.from({ length: 500 }, (_, index) => ({
      id: `audit-${index}`,
      at: raw.createdAt,
      revision: 1,
      action: `Change ${index}`,
    }));
    const original = await sealDocument(raw);
    const revisions = await Promise.all(
      Array.from({ length: 50 }, async (_, index) => ({
        action: `Revision ${index + 1}`,
        tournament: await sealDocument({ ...original, revision: index + 1 }),
      })),
    );
    const prepared = await prepareReviewedTimezoneImport(
      original,
      revisions,
      choices,
      action,
    );
    expect(prepared.revisions).toHaveLength(50);
    expect(prepared.revisions[0].tournament.revision).toBe(2);
    expect(prepared.revisions.at(-2)?.tournament).toEqual(original);
    expect(prepared.revisions.at(-1)?.tournament.revision).toBe(51);
    expect(prepared.tournament.history).toHaveLength(500);
    expect(prepared.tournament.history[0].id).toBe("audit-1");
    expect(prepared.tournament.history.at(-1)?.action).toBe(action);
  });

  it("forks corrected history with a new identity while leaving the local source intact", async () => {
    const original = await repository.create(fixture());
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    const fork = await repository.createWithHistory(
      prepared.tournament,
      prepared.revisions,
      undefined,
      true,
    );
    expect(fork.id).not.toBe(original.id);
    expect(await repository.load(original.id)).toEqual(original);
    const baseline = await repository.loadRevision(fork.id, original.revision);
    expect(baseline).toEqual(await sealDocument({ ...original, id: fork.id }));
    expect(await repository.load(fork.id)).toEqual(fork);
  });

  it("encrypts original and corrected history and restores both from a protected archive", async () => {
    const secret = "test-only-timezone-vault-secret";
    const original = await sealDocument(fixture());
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    const saved = await repository.createWithHistory(
      prepared.tournament,
      prepared.revisions,
      secret,
    );
    const persisted = JSON.stringify({
      documents: await db.documents.toArray(),
      snapshots: await db.snapshots.toArray(),
    });
    expect(persisted).not.toContain(original.title);
    expect(persisted).not.toContain(original.schedule.startAt);
    expect(persisted).not.toContain(saved.schedule.startAt);
    expect(persisted).not.toContain(secret);
    await expect(
      repository.load(saved.id, "test-only-wrong-secret"),
    ).rejects.toThrow();
    const archive = await exportArchive(
      saved,
      secret,
      await repository.exportHistory(saved.id, saved.revision, secret),
    );
    await db.documents.clear();
    await db.snapshots.clear();
    const restored = await importArchiveBundle(archive, secret);
    await repository.createWithHistory(
      restored.tournament,
      restored.revisions,
      secret,
    );
    expect(await repository.load(saved.id, secret)).toEqual(saved);
    expect(
      await repository.loadRevision(saved.id, original.revision, secret),
    ).toEqual(original);
  });

  it("rejects existing identity collisions without changing stored data", async () => {
    const original = await repository.create(fixture());
    const priorSnapshots = await db.snapshots.toArray();
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    await expect(
      repository.createWithHistory(prepared.tournament, prepared.revisions),
    ).rejects.toThrow("already exists");
    expect(await repository.load(original.id)).toEqual(original);
    expect(await db.snapshots.toArray()).toEqual(priorSnapshots);
  });

  it.each<LegacyTimezoneChoice>([
    { fieldId: "/schedule/startAt", timeZone: "Invalid/Timezone" },
    { fieldId: "/unknown", timeZone: "UTC" },
    {
      fieldId: "/schedule/startAt",
      timeZone: "America/Los_Angeles",
      wallTime: "2026-03-08T02:30",
    },
    {
      fieldId: "/schedule/startAt",
      timeZone: "America/Los_Angeles",
      wallTime: "2026-11-01T01:30",
    },
  ])("does not write an invalid or unresolved review: %j", async (choice) => {
    const original = await sealDocument(fixture());
    await expect(
      prepareReviewedTimezoneImport(original, [], [choice], action).then(
        (prepared) =>
          repository.createWithHistory(prepared.tournament, prepared.revisions),
      ),
    ).rejects.toThrow("Review the selected schedule times");
    expect(await db.documents.count()).toBe(0);
    expect(await db.snapshots.count()).toBe(0);
  });

  it("validates source history before applying any correction", async () => {
    const original = await sealDocument(fixture());
    const revisions = [
      {
        action: "Saved",
        tournament: { ...original, title: "Changed without a matching hash" },
      },
    ];
    await expect(
      prepareReviewedTimezoneImport(
        original,
        revisions,
        [{ fieldId: "/unknown", timeZone: "UTC" }],
        action,
      ),
    ).rejects.toThrow("integrity");
    expect(await db.documents.count()).toBe(0);
  });

  it("rolls back the import when writing recovered history fails", async () => {
    const original = await sealDocument(fixture());
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    vi.spyOn(db.snapshots, "bulkPut").mockRejectedValueOnce(
      new DOMException("Test quota", "QuotaExceededError"),
    );
    await expect(
      repository.createWithHistory(prepared.tournament, prepared.revisions),
    ).rejects.toThrow("storage is full");
    expect(await db.documents.count()).toBe(0);
    expect(await db.snapshots.count()).toBe(0);
  });

  it("detects sender patch divergence after a correction and supports a correction patch", async () => {
    const original = await sealDocument(fixture());
    const prepared = await prepareReviewedTimezoneImport(
      original,
      [],
      choices,
      action,
    );
    const senderTarget = await sealDocument({
      ...original,
      revision: original.revision + 1,
      subtitle: "Sender update",
    });
    const senderPatch = await createPatch(original, senderTarget);
    await expect(applyPatch(prepared.tournament, senderPatch)).rejects.toThrow(
      "diverged",
    );
    expect(await applyPatch(original, senderPatch)).toEqual(senderTarget);
    expect(
      await applyPatch(
        original,
        await createPatch(original, prepared.tournament),
      ),
    ).toEqual(prepared.tournament);
  });
});
