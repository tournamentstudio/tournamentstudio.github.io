import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult } from "../engine";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { db, repository } from "../persistence";
import { restorationImpact } from "../persistence/restoration";
import { publicProjection } from "../sharing";
import {
  countedPlayerEvents,
  deletePlayerEvent,
  readPlayerStatistics,
  savePlayerEvent,
  savePlayerMetric,
} from "./model";
import { playerMetricTemplates } from "./templates";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});
function setup() {
  const participants = Array.from({ length: 4 }, (_, i) => ({
    ...createParticipant(`Team ${i + 1}`, i + 1),
    roster: [
      { id: `player-${i}`, name: `Roster ${i + 1}`, role: "captain" as const },
    ],
  }));
  let doc = createTournament("Player evidence", participants);
  doc = generateStage(doc, doc.stages[0].id);
  return savePlayerMetric(doc, playerMetricTemplates("football")[0]);
}
function event(doc: Tournament, matchId: string) {
  const match = doc.matches.find((m) => m.id === matchId)!,
    teamId = match.slots[0].participantId!;
  return savePlayerEvent(doc, {
    matchId,
    teamId,
    playerId: doc.participants.find((p) => p.id === teamId)!.roster[0].id,
    metricId: "goals",
    value: 1,
    elapsedSeconds: 30,
    period: "First",
    notes: "Private player note",
  });
}
function win(doc: Tournament, matchId: string, slot = 0, confirm = false) {
  const match = doc.matches.find((m) => m.id === matchId)!;
  return recordResult(
    doc,
    matchId,
    {
      scores: slot ? [0, 1] : [1, 0],
      winnerIds: [match.slots[slot].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    },
    confirm,
  );
}
describe("player evidence integration", () => {
  it("rejects ambiguous duplicate roster identities while allowing team-scoped IDs", () => {
    const doc = setup();
    doc.participants[1].roster[0].id = doc.participants[0].roster[0].id;
    expect(validateTournament(doc)).toEqual(doc);
    doc.participants[0].roster.push({
      ...doc.participants[0].roster[0],
      name: "Another person",
    });
    expect(() => validateTournament(doc)).toThrow("unique within each team");
  });
  it("requires correction review for downstream player events before scores exist", () => {
    let doc = setup();
    const openers = doc.matches.filter((m) => m.round === 1);
    for (const match of openers) doc = win(doc, match.id);
    const final = doc.matches.find((m) => m.round === 2)!;
    doc = event(doc, final.id);
    expect(tournamentMatchEvidence(doc)(final)).toBe(true);
    expect(() => win(doc, openers[0].id, 1)).toThrow();
    const corrected = win(doc, openers[0].id, 1, true);
    expect(countedPlayerEvents(corrected)).toHaveLength(0);
    expect(readPlayerStatistics(corrected).events[0]).toMatchObject({
      status: "quarantined",
      notes: "Private player note",
    });
    expect(validateTournament(corrected)).toEqual(corrected);
  });
  it("retains first-result events and quarantines corrected results with recoverable revisions", async () => {
    const source = setup(),
      matchId = source.matches[0].id;
    const first = await repository.create(event(source, matchId));
    const completed = await repository.save(
      win(first, matchId),
      first.revision,
      "Record match",
    );
    expect(countedPlayerEvents(completed)).toHaveLength(1);
    const corrected = await repository.save(
      win(completed, matchId, 1),
      completed.revision,
      "Correct match",
    );
    expect(
      readPlayerStatistics(await repository.load(corrected.id)).events[0]
        .status,
    ).toBe("quarantined");
    expect(
      countedPlayerEvents(
        await repository.loadRevision(corrected.id, completed.revision),
      ),
    ).toHaveLength(1);
    expect(
      publicProjection(corrected).metadata.playerStatistics,
    ).toBeUndefined();
    expect(JSON.stringify(publicProjection(corrected))).not.toContain(
      "Private player note",
    );
  });
  it("quarantines removed roster references at save without discarding event evidence", async () => {
    const source = setup(),
      initial = await repository.create(event(source, source.matches[0].id));
    const changed = structuredClone(initial);
    const teamId = readPlayerStatistics(changed).events[0].teamId;
    changed.participants.find((p) => p.id === teamId)!.roster = [];
    expect(() => validateTournament(changed)).toThrow(
      "no longer in this team roster",
    );
    const saved = await repository.save(
      changed,
      initial.revision,
      "Remove roster player",
    );
    expect(readPlayerStatistics(saved).events[0].status).toBe("quarantined");
    expect(readPlayerStatistics(saved).events[0].playerName).toMatch(/^Roster/);
    expect(validateTournament(saved)).toEqual(saved);
  });
  it("keeps evidence after event deletion and reviews history restoration", async () => {
    const source = setup(),
      matchId = source.matches[0].id;
    const first = await repository.create(source);
    const current = await repository.save(
      event(first, matchId),
      first.revision,
      "Record player event",
    );
    expect(restorationImpact(current, first).affected.map((m) => m.id)).toEqual(
      [matchId],
    );
    await expect(
      repository.restoreReviewed(
        current.id,
        first.revision,
        current.revision,
        current.revisionHash,
        false,
        "Restore earlier state",
      ),
    ).rejects.toThrow("affected played matches");
    const deleted = deletePlayerEvent(
      current,
      readPlayerStatistics(current).events[0].id,
      "Mistaken entry",
    );
    expect(tournamentMatchEvidence(deleted)(deleted.matches[0])).toBe(true);
    expect(() => generateStage(deleted, deleted.stages[0].id)).toThrow(
      "played or live",
    );
    expect(countedPlayerEvents(deleted)).toHaveLength(0);
  });
});
