import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Tournament,
} from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { db, repository } from "../persistence";
import { canonicalize, sha256 } from "../security/codec";
import {
  createPatch,
  decodePatch,
  decodeRecipe,
  decodeTransport,
  encodePatch,
  encodeRecipe,
  encodeTransport,
  exportArchive,
  hashDocument,
  importArchive,
  importArchiveBundle,
  sealDocument,
} from "./index";
import { previewSelectivePatch, reviewPatch } from "./merge";

function fixture(count = 4) {
  const tournament = createTournament(
    "جام تابستان",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Private name ${index}`, index + 1),
    ),
  );
  tournament.revision = 1;
  return tournament;
}
function result(document: Tournament, id: string, winner = 0) {
  const match = document.matches.find((item) => item.id === id)!;
  return recordResult(
    document,
    id,
    {
      scores: winner === 0 ? [3, 1] : [1, 3],
      winnerIds: [match.slots[winner].participantId!],
      outcome: "played",
      recordedAt: "2026-10-21T12:00:00Z",
    },
    true,
  );
}
afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
});

describe("complete stage recipes", () => {
  it("recreates parallel stages, wildcard progression and fixed slots without identities", async () => {
    const original = fixture(16);
    original.stages[0].format = "groups";
    original.stages[0].config.groupCount = 4;
    original.stages.push({
      id: "finals-private",
      name: "Private event finals",
      format: "single-elimination",
      formatVersion: 1,
      order: 1,
      config: { ...DEFAULT_CONFIG, seed: "fixed" },
      participantIds: [],
      status: "draft",
      metadata: {},
      sources: [
        {
          stageId: original.stages[0].id,
          count: 1,
          perGroup: true,
          bracketSlots: [1, 3, 5, 7],
        },
        {
          stageId: original.stages[0].id,
          count: 4,
          perGroup: false,
          selection: {
            kind: "wildcard",
            rank: 2,
            comparison: "per-match",
            tieBreakers: ["points", "seed"],
          },
          bracketSlots: [2, 4, 6, 8],
        },
      ],
    });
    original.stages.push({
      ...structuredClone(original.stages[0]),
      id: "parallel",
      order: 2,
      participantIds: original.participants
        .slice(0, 4)
        .map((participant) => participant.id),
      config: { ...DEFAULT_CONFIG, groupCount: 1 },
    });
    const code = await encodeRecipe(original);
    expect(code.startsWith("TSR2:")).toBe(true);
    const payload = canonicalize(await decodeTransport("TSR2", code));
    expect(payload).not.toContain("Private name");
    expect(payload).not.toContain("finals-private");
    const restored = await decodeRecipe(code);
    expect(restored.stages).toHaveLength(3);
    expect(restored.stages[1].sources[1].selection).toEqual(
      original.stages[1].sources[1].selection,
    );
    expect(restored.stages[1].sources[0].stageId).toBe(restored.stages[0].id);
    expect(restored.stages[2].participantIds).toEqual(
      restored.participants.slice(0, 4).map((participant) => participant.id),
    );
    expect(restored.matches).toEqual([]);
    expect(restored.stages.every((stage) => stage.status === "draft")).toBe(
      true,
    );
    expect(
      generateStage(restored, restored.stages[0].id).matches.length,
    ).toBeGreaterThan(0);
  });
  it("rejects dangling, duplicate and cyclic stage references", async () => {
    const original = fixture();
    original.stages.push({
      ...structuredClone(original.stages[0]),
      id: "second",
      order: 1,
    });
    const payload = (await decodeTransport(
      "TSR2",
      await encodeRecipe(original),
    )) as { stages: Tournament["stages"] };
    payload.stages[1].sources = [
      { stageId: "missing", count: 1, perGroup: false },
    ];
    await expect(
      decodeRecipe(await encodeTransport("TSR2", payload)),
    ).rejects.toThrow("undefined structure");
    payload.stages[1].sources = [
      { stageId: payload.stages[0].id, count: 1, perGroup: false },
    ];
    payload.stages[0].sources = [
      { stageId: payload.stages[1].id, count: 1, perGroup: false },
    ];
    await expect(
      decodeRecipe(await encodeTransport("TSR2", payload)),
    ).rejects.toThrow(/cycle/i);
    payload.stages[1].id = payload.stages[0].id;
    await expect(
      decodeRecipe(await encodeTransport("TSR2", payload)),
    ).rejects.toThrow("duplicate");
  });
  it("retains the legacy recipe transport for one-stage recipes", async () => {
    const code = await encodeRecipe(fixture());
    expect(code.startsWith("TSR1:")).toBe(true);
    expect((await decodeRecipe(code)).participants).toHaveLength(4);
  });
});

describe("encrypted update packets", () => {
  it("roundtrips Unicode patches, rejects the wrong secret, and keeps plaintext out of the envelope", async () => {
    const base = await sealDocument(fixture());
    const patch = await createPatch(base, {
      ...base,
      revision: 2,
      title: "نام خصوصی پنهان",
    });
    const secret = "sample-transfer-secret";
    const code = await encodePatch(patch, secret);
    expect(canonicalize(await decodeTransport("TSP1", code))).not.toContain(
      "نام خصوصی پنهان",
    );
    expect(await decodePatch(code, secret)).toEqual(patch);
    await expect(decodePatch(code)).rejects.toThrow("separate secret");
    await expect(decodePatch(code, "different-test-secret")).rejects.toThrow(
      "Incorrect secret",
    );
    const envelope = (await decodeTransport("TSP1", code)) as {
      ciphertext: string;
    };
    envelope.ciphertext =
      (envelope.ciphertext[0] === "A" ? "B" : "A") +
      envelope.ciphertext.slice(1);
    await expect(
      decodePatch(await encodeTransport("TSP1", envelope), secret),
    ).rejects.toThrow("damaged");
  });
});

describe("revision-table backups", () => {
  it("rolls back the current document when revision storage fails", async () => {
    const base = await sealDocument(fixture());
    vi.spyOn(db.snapshots, "bulkPut").mockRejectedValueOnce(
      new DOMException("Test quota", "QuotaExceededError"),
    );
    await expect(
      repository.createWithHistory(base, [
        { action: "Imported", tournament: base },
      ]),
    ).rejects.toThrow("storage is full");
    expect(await db.documents.count()).toBe(0);
    expect(await db.snapshots.count()).toBe(0);
  });
  it("restores all saved revisions transactionally on a fresh profile and supports protected forks", async () => {
    const first = await repository.create(fixture());
    const second = await repository.save(
      { ...first, title: "Second revision" },
      first.revision,
    );
    const third = await repository.save(
      { ...second, title: "Third revision" },
      second.revision,
    );
    const revisions = await repository.exportHistory(third.id, third.revision);
    const archive = await exportArchive(
      third,
      "sample-archive-secret",
      revisions,
    );
    await expect(
      importArchiveBundle(archive, "wrong-test-secret"),
    ).rejects.toThrow();
    const bundle = await importArchiveBundle(archive, "sample-archive-secret");
    expect(bundle.revisions).toHaveLength(3);
    expect(await importArchive(archive, "sample-archive-secret")).toEqual(
      third,
    );
    await db.documents.clear();
    await db.snapshots.clear();
    const restored = await repository.createWithHistory(
      bundle.tournament,
      bundle.revisions,
      "sample-vault-secret",
    );
    expect(
      (
        await repository.loadRevision(
          restored.id,
          first.revision,
          "sample-vault-secret",
        )
      ).title,
    ).toBe(first.title);
    expect(await repository.revisions(restored.id)).toHaveLength(3);
    const stored = await db.snapshots.toArray();
    expect(stored.every((snapshot) => snapshot.protected)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("Second revision");
    expect((await repository.list())[0].formats).toBeUndefined();
    const fork = await repository.createWithHistory(
      bundle.tournament,
      bundle.revisions,
      undefined,
      true,
    );
    expect(fork.id).not.toBe(restored.id);
    expect((await repository.loadRevision(fork.id, first.revision)).title).toBe(
      first.title,
    );
    await expect(
      repository.createWithHistory(bundle.tournament, bundle.revisions),
    ).rejects.toThrow("already exists");
    expect(await repository.revisions(restored.id)).toHaveLength(3);
  });
  it("rejects corrupted, duplicate, unrelated and future history before any write", async () => {
    const base = await sealDocument(fixture());
    const good = { action: "Saved", tournament: base };
    await expect(exportArchive(base, undefined, [good, good])).rejects.toThrow(
      "duplicate",
    );
    await expect(
      exportArchive(base, undefined, [
        { ...good, tournament: { ...base, title: "Tampered" } },
      ]),
    ).rejects.toThrow("integrity");
    await expect(
      repository.createWithHistory(base, [
        { ...good, tournament: await sealDocument({ ...base, id: "other" }) },
      ]),
    ).rejects.toThrow("unrelated");
    await expect(
      repository.createWithHistory(base, [
        { ...good, tournament: await sealDocument({ ...base, revision: 9 }) },
      ]),
    ).rejects.toThrow("future");
    expect(await repository.list()).toEqual([]);
    expect(await db.snapshots.count()).toBe(0);
  });
  it("rejects stale export requests and retains legacy archives", async () => {
    const base = await repository.create(fixture());
    await repository.save({ ...base, title: "New title" }, base.revision);
    await expect(
      repository.exportHistory(base.id, base.revision),
    ).rejects.toThrow("Another tab");
    expect(
      (await importArchiveBundle(await exportArchive(base))).revisions,
    ).toEqual([]);
    expect((await repository.list())[0].formats).toEqual([
      "single-elimination",
    ]);
  });
});

describe("selective divergent patch review", () => {
  it("merges chosen compatible and conflicting fields while keeping local data and rejecting repeats", async () => {
    const base = await repository.create(fixture());
    const packet = await createPatch(base, {
      ...base,
      revision: 2,
      title: "Remote title",
      subtitle: "Remote subtitle",
    });
    const local = await repository.save(
      { ...base, title: "Local title", description: "Keep local" },
      base.revision,
    );
    const review = await reviewPatch(local, base, packet);
    expect(review.entries.find((entry) => entry.path === "title")?.status).toBe(
      "conflict",
    );
    const selected = review.entries
      .filter((entry) => entry.path === "subtitle")
      .map((entry) => entry.index);
    const preview = await previewSelectivePatch(local, base, packet, selected);
    const merged = await repository.mergeUpdate(
      local.id,
      packet,
      selected,
      preview.currentHash,
      false,
    );
    expect(merged.title).toBe("Local title");
    expect(merged.subtitle).toBe("Remote subtitle");
    expect(merged.description).toBe("Keep local");
    expect(merged.revision).toBe(local.revision + 1);
    expect(
      (await repository.loadRevision(local.id, local.revision)).subtitle,
    ).toBe(local.subtitle);
    await expect(reviewPatch(merged, base, packet)).rejects.toThrow(
      "already reviewed",
    );
  });
  it("replays compatible results through the engine and preserves independent local results", async () => {
    const raw = fixture();
    const base = await sealDocument(generateStage(raw, raw.stages[0].id));
    const openers = base.matches.filter((match) => match.round === 1);
    const target = result(base, openers[0].id);
    target.revision = 2;
    const local = result(base, openers[1].id);
    local.revision = 2;
    const packet = await createPatch(base, target);
    const review = await reviewPatch(local, base, packet);
    const selected = review.entries
      .filter((entry) => entry.path === `matches / ${openers[0].id}`)
      .map((entry) => entry.index);
    const merged = await previewSelectivePatch(local, base, packet, selected);
    expect(
      merged.tournament.matches.filter((match) => match.result),
    ).toHaveLength(2);
    expect(
      merged.tournament.matches.find((match) => match.round === 2)?.status,
    ).toBe("ready");
    expect(merged.affected).toEqual([]);
  });
  it("requires confirmation for downstream played corrections and retains a recoverable revision", async () => {
    const raw = fixture();
    let played = generateStage(raw, raw.stages[0].id);
    for (const opener of played.matches.filter((match) => match.round === 1))
      played = result(played, opener.id);
    const finalId = played.matches.find((match) => match.round === 2)!.id;
    played = result(played, finalId);
    const base = await repository.create(played);
    const openingId = base.matches.find((match) => match.round === 1)!.id;
    const target = result(base, openingId, 1);
    target.revision = 2;
    const packet = await createPatch(base, target);
    const local = await repository.save(
      { ...base, title: "Local rename" },
      base.revision,
    );
    const review = await reviewPatch(local, base, packet);
    const selected = review.entries
      .filter((entry) => entry.path === `matches / ${openingId}`)
      .map((entry) => entry.index);
    const preview = await previewSelectivePatch(local, base, packet, selected);
    expect(preview.affected.map((match) => match.id)).toContain(finalId);
    await expect(
      repository.mergeUpdate(
        local.id,
        packet,
        selected,
        preview.currentHash,
        false,
      ),
    ).rejects.toThrow("Confirm");
    expect(
      (await repository.load(local.id)).matches.find(
        (match) => match.id === finalId,
      )?.result,
    ).toBeDefined();
    const merged = await repository.mergeUpdate(
      local.id,
      packet,
      selected,
      preview.currentHash,
      true,
    );
    expect(
      merged.matches.find((match) => match.id === finalId)?.result,
    ).toBeUndefined();
    expect(
      (await repository.loadRevision(local.id, local.revision)).matches.find(
        (match) => match.id === finalId,
      )?.result,
    ).toBeDefined();
  });
  it("rejects stale previews, invalid checksums and structure changes to generated matches", async () => {
    const raw = fixture();
    const base = await repository.create(generateStage(raw, raw.stages[0].id));
    const changed = structuredClone(base);
    changed.revision = 2;
    changed.matches[0].index = 99;
    const packet = await createPatch(base, changed);
    const local = await repository.save(
      { ...base, subtitle: "Local" },
      base.revision,
    );
    const review = await reviewPatch(local, base, packet);
    expect(
      review.entries.find((entry) => entry.path.startsWith("matches"))?.status,
    ).toBe("blocked");
    await expect(
      previewSelectivePatch(local, base, packet, [0]),
    ).rejects.toThrow();
    const rename = await createPatch(base, {
      ...base,
      revision: 2,
      title: "Remote",
    });
    const renamePreview = await previewSelectivePatch(local, base, rename, [0]);
    await repository.save({ ...local, description: "Later" }, local.revision);
    await expect(
      repository.mergeUpdate(
        local.id,
        rename,
        [0],
        renamePreview.currentHash,
        false,
      ),
    ).rejects.toThrow("changed after");
    const invalid = { ...rename, checksum: await sha256(canonicalize({})) };
    await expect(reviewPatch(local, base, invalid)).rejects.toThrow("checksum");
    expect(await hashDocument(base)).toBe(base.revisionHash);
  });
});
