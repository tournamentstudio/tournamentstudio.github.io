import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { db, repository } from "../persistence";
import {
  defaultBackupReminders,
  dueBackups,
  loadBackupReminders,
  saveBackupReminders,
} from "../persistence/reminders";
import { decodeEmbeddedCode, encodeEmbeddedCode } from "./embedded";
import { compareRevisions } from "./history-diff";
import { planTransfer } from "./transfer-plan";
import {
  decodeCode,
  decodeRecipe,
  decodeTransport,
  encodeCode,
  encodeRecipe,
  importArchiveBundle,
} from "./index";
import { defaultOverlay } from "../domain/display-options";
import { prepareTransfer } from "./transfer";

const fixture = () =>
  createTournament("جام تجربه", [
    createParticipant("تهران", 1),
    createParticipant("Team B", 2),
  ]);
afterEach(async () => {
  await db.preferences.clear();
  await db.documents.clear();
  await db.snapshots.clear();
});

describe("embedded-key portable links", () => {
  it("decrypts without a separate secret and excludes private fields by default", async () => {
    const document = fixture();
    document.description = "Private organizer notes";
    const code = await encodeEmbeddedCode(document);
    expect(code).toMatch(/^TSK1:[A-Za-z0-9_-]{32}:TS1:/);
    const restored = await decodeEmbeddedCode(code);
    expect((await decodeCode(code)).title).toBe(document.title);
    expect(restored.title).toBe(document.title);
    expect(restored.description).toBe("");
    const [prefix, key, ...snapshot] = code.split(":");
    expect(prefix).toBe("TSK1");
    await expect(decodeCode(snapshot.join(":"))).rejects.toThrow(
      "separate secret",
    );
    const altered = `${prefix}:${key[0] === "A" ? "B" : "A"}${key.slice(1)}:${snapshot.join(":")}`;
    await expect(decodeEmbeddedCode(altered)).rejects.toThrow(
      "Incorrect secret",
    );
    expect(
      (await decodeEmbeddedCode(await encodeEmbeddedCode(document, true)))
        .description,
    ).toBe(document.description);
  });
  it("rejects malformed keys and accepts wrapped text", async () => {
    await expect(decodeEmbeddedCode("TSK1:short:TS1:broken")).rejects.toThrow(
      "malformed",
    );
    const code = await encodeEmbeddedCode(fixture());
    expect(
      (await decodeEmbeddedCode(code.replace(/(.{80})/g, "$1\n"))).participants,
    ).toHaveLength(2);
    await expect(
      decodeEmbeddedCode(
        `TSK1:${"A".repeat(32)}:${await encodeCode(fixture())}`,
      ),
    ).rejects.toThrow("malformed");
  });
});

describe("presentation recipe references", () => {
  it.each([1, 2])(
    "remaps introduction participants and removes match references with %i stages",
    async (stageCount) => {
      const document = fixture();
      if (stageCount === 2)
        document.stages.push({
          ...structuredClone(document.stages[0]),
          id: "second-stage",
          order: 1,
        });
      document.presentation.scenes = [
        {
          id: "private-scene",
          type: "introduction",
          title: "Private name",
          text: "Private text",
          duration: 10,
          participantIds: [document.participants[1].id],
          matchId: "private-match",
        },
      ];
      document.presentation.overlay = {
        ...defaultOverlay,
        matchId: "private-match",
      };
      document.theme.design = { bracketLayout: "centered", cardStyle: "glass" };
      const code = await encodeRecipe(document);
      const payload = await decodeTransport(
        stageCount === 1 ? "TSR1" : "TSR2",
        code,
      );
      expect(JSON.stringify(payload)).not.toContain(
        document.participants[1].id,
      );
      expect(JSON.stringify(payload)).not.toContain("private-match");
      expect(JSON.stringify(payload)).not.toContain("Private name");
      const restored = await decodeRecipe(code);
      expect(restored.presentation.scenes[0].participantIds).toEqual([
        restored.participants[1].id,
      ]);
      expect(restored.presentation.scenes[0].matchId).toBeUndefined();
      expect(restored.presentation.overlay?.matchId).toBeUndefined();
      expect(restored.theme.design).toEqual(document.theme.design);
    },
  );
});

describe("revision comparison", () => {
  it("reports fields and ordering while excluding private referee data unless requested", () => {
    const before = fixture();
    before.revision = 1;
    before.metadata.privateNote = "Referee secret";
    const after = structuredClone(before);
    after.revision = 2;
    after.revisionHash = "different";
    after.title = "Changed title";
    after.metadata.privateNote = "Changed secret";
    after.participants[0].name = "Changed team";
    after.participants.reverse();
    const publicDiff = compareRevisions(before, after);
    expect(publicDiff.map((entry) => entry.path)).toContain("title");
    expect(publicDiff.map((entry) => entry.path)).toContain(
      "participants / order",
    );
    expect(JSON.stringify(publicDiff)).not.toContain("secret");
    expect(JSON.stringify(compareRevisions(before, after, true))).toContain(
      "Changed secret",
    );
    expect(compareRevisions(before, before)).toEqual([]);
    expect(() => compareRevisions(before, { ...after, id: "other" })).toThrow(
      "same tournament",
    );
  });
});

describe("backup reminder settings", () => {
  const entry = {
    id: "example",
    title: "Protected tournament",
    sport: "",
    status: "draft" as const,
    updatedAt: "2026-10-20T00:00:00Z",
    revision: 2,
    protected: true,
    favorite: false,
  };
  const now = Date.parse("2026-10-21T00:00:00Z");
  it("persists opt-in settings and handles corrupt preferences safely", async () => {
    expect(await loadBackupReminders()).toEqual(defaultBackupReminders);
    const value = { ...defaultBackupReminders, enabled: true, days: 3 };
    await saveBackupReminders(value);
    expect(await loadBackupReminders()).toEqual(value);
    await db.preferences.put({
      key: "backup-reminders-v1",
      value: "malformed",
    });
    expect(await loadBackupReminders()).toEqual(defaultBackupReminders);
    await expect(saveBackupReminders({ ...value, days: 0 })).rejects.toThrow();
  });
  it("records the exported revision without marking concurrent edits as backed up", async () => {
    const first = await repository.create(fixture());
    const second = await repository.save(
      { ...first, subtitle: "Later result" },
      first.revision,
    );
    await repository.markBackup(first.id, first.revision);
    expect((await repository.list())[0]).toMatchObject({
      revision: second.revision,
      lastBackupRevision: first.revision,
    });
    await repository.markBackup(first.id, second.revision);
    await repository.markBackup(first.id, first.revision);
    expect((await repository.list())[0].lastBackupRevision).toBe(
      second.revision,
    );
    await expect(
      repository.markBackup(first.id, second.revision + 1),
    ).rejects.toThrow("backup revision");
    await expect(repository.markBackup(first.id, 0)).rejects.toThrow(
      "backup revision",
    );
    const third = await repository.save(
      { ...second, subtitle: "Another result" },
      second.revision,
    );
    expect((await repository.list())[0]).toMatchObject({
      revision: third.revision,
      lastBackupRevision: second.revision,
    });
  });
  it("includes missing or changed overdue backups, excludes trash, and supports snooze", () => {
    const settings = { ...defaultBackupReminders, enabled: true };
    expect(dueBackups([entry], settings, now)).toHaveLength(1);
    expect(
      dueBackups(
        [{ ...entry, lastBackupAt: "2026-10-01T00:00:00Z" }],
        settings,
        now,
      ),
    ).toHaveLength(1);
    expect(
      dueBackups(
        [{ ...entry, lastBackupAt: "2026-10-20T12:00:00Z" }],
        settings,
        now,
      ),
    ).toEqual([]);
    expect(
      dueBackups(
        [
          {
            ...entry,
            lastBackupAt: "2026-10-01T00:00:00Z",
            lastBackupRevision: 2,
          },
        ],
        settings,
        now,
      ),
    ).toEqual([]);
    expect(
      dueBackups([{ ...entry, trashedAt: entry.updatedAt }], settings, now),
    ).toEqual([]);
    expect(
      dueBackups(
        [entry],
        { ...settings, snoozedUntil: "2026-10-22T00:00:00Z" },
        now,
      ),
    ).toEqual([]);
    expect(dueBackups([entry], defaultBackupReminders, now)).toEqual([]);
  });
});

describe("local transfer recommendations", () => {
  it("prepares encrypted history backups and refuses an absent transfer secret", async () => {
    const first = await repository.create(fixture());
    const next = await repository.save(
      { ...first, title: "Changed event" },
      first.revision,
      "Change title",
    );
    const request = {
      purpose: "backup" as const,
      method: "file" as const,
      privateData: true,
      baseRevision: 1,
    };
    await expect(prepareTransfer(next, request)).rejects.toThrow(
      "Use a secret",
    );
    const prepared = await prepareTransfer(next, {
      ...request,
      secret: "test-only-transfer-secret",
    });
    expect(prepared.kind).toBe("archive");
    if (prepared.kind !== "archive") throw new Error("Expected archive");
    await expect(importArchiveBundle(prepared.bytes)).rejects.toThrow(
      "separate secret",
    );
    const restored = await importArchiveBundle(
      prepared.bytes,
      "test-only-transfer-secret",
    );
    expect(restored.revisions).toHaveLength(2);
    expect(restored.tournament.title).toBe(next.title);
    expect(prepared.backupRevision).toBe(next.revision);
  });
  it("prepares large public files without private organizer data", async () => {
    const document = createTournament(
      "Public transfer",
      Array.from({ length: 128 }, (_, index) =>
        createParticipant(
          Array.from({ length: 6 }, () =>
            crypto.randomUUID().replaceAll("-", ""),
          ).join(""),
          index + 1,
        ),
      ),
    );
    document.description = "Private organizer details";
    document.metadata.refereeSecret = "Hidden position";
    expect(planTransfer(document, "snapshot", false).method).toBe("file");
    const prepared = await prepareTransfer(document, {
      purpose: "snapshot",
      method: "link",
      privateData: false,
      baseRevision: 1,
    });
    expect(prepared.kind).toBe("archive");
    if (prepared.kind !== "archive") throw new Error("Expected archive");
    const restored = await importArchiveBundle(prepared.bytes);
    expect(restored.tournament.description).toBe("");
    expect(restored.tournament.metadata).toEqual({});
    expect(prepared.backupRevision).toBeUndefined();
  });
  it("chooses private encrypted files, history backups and compact recipes without changing the document", () => {
    const document = fixture(),
      before = structuredClone(document);
    expect(planTransfer(document, "snapshot", true)).toMatchObject({
      method: "file",
      reason: "private",
      requiresSecret: true,
    });
    expect(planTransfer(document, "backup", false)).toMatchObject({
      method: "file",
      reason: "history",
      requiresSecret: true,
    });
    expect(planTransfer(document, "recipe", false)).toMatchObject({
      method: "code",
      reason: "recipe",
      requiresSecret: false,
    });
    expect(planTransfer(document, "update", true)).toMatchObject({
      method: "code",
      reason: "update",
      requiresSecret: true,
    });
    expect(
      planTransfer(document, "snapshot", false).estimatedBytes,
    ).toBeGreaterThan(0);
    expect(document).toEqual(before);
  });
});
