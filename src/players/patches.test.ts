import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { db, repository } from "../persistence";
import { createPatch, hashDocument, sealDocument } from "../sharing";
import { previewSelectivePatch, reviewPatch } from "../sharing/merge";
import { playerMetricTemplates } from "./templates";
import {
  readPlayerStatistics,
  reconcilePlayerStatistics,
  savePlayerEvent,
  savePlayerMetric,
} from "./model";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});
function fixture() {
  const doc = createTournament(
    "Player merge",
    Array.from({ length: 4 }, (_, index) => ({
      ...createParticipant(`Team ${index}`, index + 1),
      roster: [
        { id: `p-${index}`, name: `Player ${index}`, role: "player" as const },
      ],
    })),
  );
  return savePlayerMetric(
    generateStage(doc, doc.stages[0].id),
    playerMetricTemplates("football")[0],
  );
}
function observation(
  doc: Tournament,
  matchId = doc.matches.find((m) => m.status === "ready")!.id,
) {
  const match = doc.matches.find((m) => m.id === matchId)!;
  const team = doc.participants.find(
    (p) => p.id === match.slots[0].participantId,
  )!;
  return savePlayerEvent(doc, {
    matchId,
    teamId: team.id,
    playerId: team.roster[0].id,
    metricId: "goals",
    value: 1,
    notes: "Local private observation",
    period: "1",
  });
}
function score(doc: Tournament, matchId: string, second = false) {
  const match = doc.matches.find((m) => m.id === matchId)!;
  return recordResult(
    doc,
    matchId,
    {
      scores: second ? [0, 1] : [1, 0],
      winnerIds: [match.slots[second ? 1 : 0].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    },
    true,
  );
}
it("selective result corrections preserve local observations and preview their quarantine", async () => {
  let base = observation(fixture());
  const matchId = readPlayerStatistics(base).events[0].matchId;
  base = await sealDocument({ ...score(base, matchId), revision: 1 });
  const target = await sealDocument({
    ...score(base, matchId, true),
    revision: 2,
  });
  const local = await sealDocument({
    ...base,
    title: "Local title",
    revision: 3,
  });
  const patch = await createPatch(base, target),
    review = await reviewPatch(local, base, patch);
  expect(
    review.entries.find((entry) => entry.path === "metadata")?.status,
  ).toBe("blocked");
  const selection = patch.operations.findIndex(
    (op) => op.path[0] === "matches" && op.path[1] === matchId,
  );
  const preview = await previewSelectivePatch(local, base, patch, [selection]);
  expect(preview.affected.map((m) => m.id)).toContain(matchId);
  expect(preview.tournament.title).toBe("Local title");
  expect(readPlayerStatistics(preview.tournament).events[0]).toMatchObject({
    status: "quarantined",
    notes: "Local private observation",
  });
});
it("selective roster removal quarantines retained local player history instead of rejecting or dropping it", async () => {
  const base = await sealDocument({ ...observation(fixture()), revision: 1 });
  const event = readPlayerStatistics(base).events[0];
  const removed = structuredClone(base);
  removed.participants.find((p) => p.id === event.teamId)!.roster = [];
  const target = await sealDocument({
    ...reconcilePlayerStatistics(base, removed),
    revision: 2,
  });
  const patch = await createPatch(base, target);
  const selection = patch.operations.findIndex(
    (op) => op.path[0] === "participants" && op.path[1] === event.teamId,
  );
  const preview = await previewSelectivePatch(
    { ...base, title: "Diverged", revision: 3 },
    base,
    patch,
    [selection],
  );
  expect(preview.affected.map((m) => m.id)).toContain(event.matchId);
  expect(readPlayerStatistics(preview.tournament).events[0]).toMatchObject({
    playerName: event.playerName,
    status: "quarantined",
  });
});
it("selective upstream corrections warn about ready dependent matches with player-only evidence", async () => {
  let base = fixture();
  const opening = base.matches
    .filter((m) => m.status === "ready")
    .map((m) => m.id);
  for (const id of opening) base = score(base, id);
  const final = base.matches.find((m) => m.status === "ready")!;
  base = await sealDocument({ ...observation(base, final.id), revision: 1 });
  const target = await sealDocument({
    ...score(base, opening[0], true),
    revision: 2,
  });
  const patch = await createPatch(base, target);
  const selection = patch.operations.findIndex(
    (op) => op.path[0] === "matches" && op.path[1] === opening[0],
  );
  const preview = await previewSelectivePatch(
    { ...base, title: "Local", revision: 3 },
    base,
    patch,
    [selection],
  );
  expect(preview.affected).toContainEqual({
    id: final.id,
    label: final.label,
    status: "ready",
  });
  expect(readPlayerStatistics(preview.tournament).events[0].status).toBe(
    "quarantined",
  );
});
it("blocks selective rule replacement after player evidence has been entered", async () => {
  const base = await sealDocument({ ...fixture(), revision: 1 });
  const target = await sealDocument({
    ...base,
    rules: { ...base.rules, pointsWin: 5 },
    revision: 2,
  });
  const local = { ...observation(base), revision: 3 };
  const review = await reviewPatch(
    local,
    base,
    await createPatch(base, target),
  );
  expect(review.entries.find((entry) => entry.path === "rules")).toMatchObject({
    status: "blocked",
    reason: "played-rules",
  });
});
it("exact private updates preserve the sender's reconciled document hash without a hidden transform", async () => {
  let before = observation(fixture());
  const matchId = readPlayerStatistics(before).events[0].matchId;
  before = await repository.create(score(before, matchId));
  const target = await sealDocument({
    ...score(before, matchId, true),
    revision: before.revision + 1,
  });
  const patch = await createPatch(before, target);
  const applied = await repository.applyUpdate(before.id, patch);
  expect(await hashDocument(applied)).toBe(patch.targetHash);
  expect(applied).toEqual(target);
  expect(await repository.load(before.id)).toEqual(target);
  expect(readPlayerStatistics(applied).events[0].status).toBe("quarantined");
  await expect(repository.applyUpdate(before.id, patch)).rejects.toThrow(
    /already applied/,
  );
});
