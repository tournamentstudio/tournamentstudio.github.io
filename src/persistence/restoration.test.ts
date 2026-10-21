import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { generateStage } from "../engine";
import { saveAggregateProgress } from "../engine/aggregate";
import { newRun } from "../timing/model";
import { db, repository } from "./index";
import { restorationImpact } from "./restoration";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});

function fixture(format: "single-elimination" | "time-trial") {
  const doc = createTournament(
    "Restoration review",
    [createParticipant("First", 1), createParticipant("Second", 2)],
    format,
  );
  if (format === "single-elimination")
    doc.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
    };
  return generateStage(doc, doc.stages[0].id);
}

async function verifyReviewedRestore(first: Tournament, edited: Tournament) {
  const current = await repository.save(edited, first.revision, "Record progress");
  expect(restorationImpact(current, first).affected).toHaveLength(1);
  const restore = (confirmed: boolean) =>
    repository.restoreReviewed(
      current.id,
      first.revision,
      current.revision,
      current.revisionHash,
      confirmed,
      "Restore progress",
    );
  await expect(restore(false)).rejects.toThrow("affected played matches");
  expect(await repository.load(current.id)).toEqual(current);
  expect(await repository.revisions(current.id)).toHaveLength(2);
  const restored = await restore(true);
  expect(restored.matches).toEqual(first.matches);
  expect(restored.revision).toBe(current.revision + 1);
  expect(await repository.loadRevision(current.id, current.revision)).toEqual(
    current,
  );
}

it.each(["live", "ready", "postponed"] as const)(
  "reviews changed aggregate legs with identical totals while %s",
  async (status) => {
    const doc = fixture("single-elimination");
    const id = doc.matches[0].id;
    const initial = saveAggregateProgress(doc, id, [
      [2, 0],
      [0, 2],
    ]);
    initial.matches[0].status = status;
    const first = await repository.create(initial);
    const edited = saveAggregateProgress(first, id, [
      [1, 1],
      [1, 1],
    ]);
    edited.matches[0].status = status;
    expect(edited.matches[0].liveScores).toEqual(first.matches[0].liveScores);
    await verifyReviewedRestore(first, edited);
  },
);

it.each(["split", "evidence", "review"] as const)(
  "reviews private run %s changes without a result or status change",
  async (field) => {
    const doc = fixture("time-trial");
    const participantId = doc.matches[0].slots[0].participantId!;
    const run = {
      ...newRun(),
      elapsedMs: 2500,
      splits: [{ label: "First lap", elapsedMs: 1000 }],
    };
    doc.matches[0].metadata.timing = { [participantId]: run };
    const first = await repository.create(doc);
    const edited = structuredClone(first);
    const changedRun = structuredClone(run);
    if (field === "split") changedRun.splits[0].elapsedMs = 1200;
    if (field === "evidence")
      changedRun.evidence = "https://example.com/run-evidence";
    if (field === "review") changedRun.review = "accepted";
    edited.matches[0].metadata.timing = { [participantId]: changedRun };
    expect(edited.matches[0].status).toBe("ready");
    expect(changedRun.elapsedMs).toBe(run.elapsedMs);
    await verifyReviewedRestore(first, edited);
  },
);

it("reviews a running timer before its first split or elapsed score", async () => {
  const first = await repository.create(fixture("time-trial"));
  const edited = structuredClone(first);
  const participantId = edited.matches[0].slots[0].participantId!;
  edited.matches[0].metadata.timing = {
    [participantId]: { ...newRun(), startedAt: new Date().toISOString() },
  };
  await verifyReviewedRestore(first, edited);
});

it("does not require played confirmation for an unrelated title change", async () => {
  const doc = fixture("single-elimination");
  const progress = saveAggregateProgress(doc, doc.matches[0].id, [[2, 0]]);
  const first = await repository.create(progress);
  const current = await repository.save(
    { ...first, title: "New title" },
    first.revision,
  );
  expect(restorationImpact(current, first).affected).toHaveLength(0);
  await expect(
    repository.restoreReviewed(
      current.id,
      first.revision,
      current.revision,
      current.revisionHash,
      false,
      "Restore title",
    ),
  ).resolves.toMatchObject({ title: first.title });
});
