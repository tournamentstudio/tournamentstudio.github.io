import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { simulate, generateStage } from "../engine";
import { db, repository } from "../persistence";
import { sealDocument } from "../sharing";
import {
  createCollection,
  linkCompetition,
  sealCollection,
  validateCollection,
} from "./model";
import { aggregateRankings, seasonMovement } from "./rankings";
import { collectionRepository, prepareCollection } from "./storage";
import { exportCollection, forkBundle, importCollection } from "./transport";
import { eventConflicts, eventSchedule } from "./schedule";
import { eventHTML, publicEvent } from "./public";

const fixture = () =>
  createTournament("University cup", [
    createParticipant("آفتاب", 1),
    createParticipant("North", 2),
    createParticipant("East", 3),
    createParticipant("West", 4),
  ]);
function linked() {
  const tournament = simulate(fixture());
  const event = createCollection("Games festival", "2026");
  return {
    tournament,
    event: linkCompetition(
      event,
      tournament,
      tournament.stages[0].id,
      event.divisions[0].id,
    ),
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await db.documents.clear();
  await db.snapshots.clear();
  await db.preferences.clear();
});

describe("event identities and standings", () => {
  it("does not merge equal names and rejects duplicate bindings", () => {
    const { tournament, event } = linked();
    const other = { ...tournament, id: crypto.randomUUID() };
    const next = linkCompetition(
      event,
      other,
      other.stages[0].id,
      event.divisions[0].id,
    );
    expect(next.directory).toHaveLength(8);
    next.competitions[1].bindings[1].directoryId =
      next.competitions[1].bindings[0].directoryId;
    expect(() => validateCollection(next)).toThrow(/twice/);
  });
  it("combines explicit identities with weights and preserves tied placement awards", () => {
    const { tournament, event } = linked();
    const second = { ...tournament, id: crypto.randomUUID() };
    const next = linkCompetition(
      event,
      second,
      second.stages[0].id,
      event.divisions[0].id,
    );
    next.competitions[1].bindings = structuredClone(
      next.competitions[0].bindings,
    );
    next.competitions[1].weight = 2;
    next.directory = next.directory.slice(0, 4);
    const { rows, pending } = aggregateRankings(
      next,
      [tournament, second],
      next.divisions[0].id,
    );
    expect(pending).toEqual([]);
    expect(rows[0].points).toBe(75);
    expect(rows[0].starts).toBe(2);
    expect(rows.slice(2).map((r) => r.points)).toEqual([40.5, 40.5]);
    expect(rows.slice(2).every((r) => r.tied && r.rank === 3)).toBe(true);
  });
  it("refuses incomplete competitions and a tie at a movement cutoff", () => {
    const { tournament, event } = linked();
    event.divisions[0].promote = 1;
    event.divisions[0].relegate = 1;
    expect(() =>
      seasonMovement(event, [tournament], event.divisions[0].id),
    ).toThrow(/tied/);
    event.divisions[0].relegate = 2;
    expect(
      seasonMovement(event, [tournament], event.divisions[0].id).relegate,
    ).toHaveLength(2);
    expect(() => seasonMovement(event, [], event.divisions[0].id)).toThrow(
      /Complete/,
    );
  });
  it("records explicit bonuses or penalties without altering match results", () => {
    const { tournament, event } = linked();
    const original = structuredClone(tournament);
    event.adjustments.push({
      id: crypto.randomUUID(),
      directoryId: event.directory[0].id,
      points: -20,
      reason: "Eligibility ruling",
    });
    const { rows } = aggregateRankings(
      event,
      [tournament],
      event.divisions[0].id,
    );
    expect(
      rows.find((r) => r.directoryId === event.directory[0].id)?.points,
    ).toBe(5);
    expect(tournament).toEqual(original);
  });
});

describe("event sharing and persistence", () => {
  it("roundtrips an encrypted event and forks all tournament identities", async () => {
    const { tournament, event } = linked();
    event.description = "Private event notes";
    tournament.participants[0].metadata.privateMemo = "Private participant";
    const code = await exportCollection(event, [tournament], {
      private: true,
      secret: "event-test-secret",
    });
    await expect(importCollection(code, "wrong-secret")).rejects.toThrow();
    const imported = await importCollection(code, "event-test-secret");
    expect(imported.bundle.collection.description).toBe(event.description);
    const fork = await forkBundle(imported.bundle);
    expect(fork.collection.id).not.toBe(event.id);
    expect(fork.tournaments[0].id).not.toBe(tournament.id);
    expect(fork.collection.competitions[0].tournamentId).toBe(
      fork.tournaments[0].id,
    );
    expect(fork.tournaments[0].matches).toEqual(tournament.matches);
  });
  it("public event files, displays and HTML exclude private notes", async () => {
    const { tournament, event } = linked();
    event.description = "hidden-event-description";
    tournament.matches[0].private = {
      concealedPosition: "hidden-concealed-position",
    };
    event.adjustments.push({
      id: crypto.randomUUID(),
      directoryId: event.directory[0].id,
      points: 1,
      reason: "hidden-adjustment-reason",
    });
    tournament.title = '<img src=x onerror="alert(1)">';
    const imported = await importCollection(
      await exportCollection(event, [tournament], { private: false }),
    );
    expect(JSON.stringify(imported)).not.toMatch(/hidden-/);
    expect(JSON.stringify(publicEvent(event, [tournament]))).not.toMatch(
      /hidden-/,
    );
    const html = eventHTML(event, [tournament], "fa");
    expect(html).not.toMatch(/hidden-|<img src=x/);
    expect(html).toContain('dir="rtl"');
  });
  it("next season copies clear results and preserve independent source data", async () => {
    const { tournament, event } = linked();
    const source = {
      version: 1 as const,
      collection: await sealCollection(event),
      tournaments: [await sealDocument(tournament)],
    };
    const copied = await forkBundle(source, true);
    expect(copied.tournaments[0].matches).toEqual([]);
    expect(copied.tournaments[0].stages[0].status).toBe("draft");
    expect(source.tournaments[0].matches.length).toBeGreaterThan(0);
    expect(
      generateStage(copied.tournaments[0], copied.tournaments[0].stages[0].id)
        .matches.length,
    ).toBeGreaterThan(0);
  });
  it("stores private collection metadata only as authenticated ciphertext", async () => {
    const original = createCollection("Private festival");
    const saved = await collectionRepository.save(
      original,
      undefined,
      "event-test-secret",
    );
    const stored = await db.preferences.toArray();
    expect(JSON.stringify(stored)).not.toContain("Private festival");
    await expect(collectionRepository.load(saved.id)).rejects.toThrow(/secret/);
    await expect(
      collectionRepository.load(saved.id, "incorrect-secret"),
    ).rejects.toThrow();
    expect(
      await collectionRepository.load(saved.id, "event-test-secret"),
    ).toEqual(saved);
    expect((await collectionRepository.list())[0].title).toBe(
      "Protected event",
    );
  });
  it("rejects a racing event save and retains the last confirmed version", async () => {
    const saved = await collectionRepository.save(
      createCollection("Season"),
      undefined,
    );
    const results = await Promise.allSettled([
      collectionRepository.save({ ...saved, title: "First" }, saved.revision),
      collectionRepository.save({ ...saved, title: "Second" }, saved.revision),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await collectionRepository.load(saved.id)).revision).toBe(2);
  });
  it("imports event and tournaments atomically and rolls back a failed preference write", async () => {
    const { tournament, event } = linked();
    const prepared = await prepareCollection({ ...event, revision: 1 });
    const spy = vi
      .spyOn(db.preferences, "add")
      .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    await expect(
      repository.createMany([tournament], undefined, prepared.preference),
    ).rejects.toThrow(/full/);
    expect(await db.documents.count()).toBe(0);
    expect(await db.snapshots.count()).toBe(0);
    spy.mockRestore();
    await repository.createMany([tournament], undefined, prepared.preference);
    expect(await db.documents.count()).toBe(1);
    expect(await collectionRepository.load(event.id)).toEqual(
      prepared.document,
    );
    await expect(
      repository.createMany([tournament], undefined, prepared.preference),
    ).rejects.toThrow(/replace/);
    expect(await db.documents.count()).toBe(1);
  });
});

describe("shared event schedule", () => {
  it("detects shared venues, referees and explicit entrants including rest periods", () => {
    const { tournament, event } = linked();
    const second = structuredClone(tournament);
    second.id = crypto.randomUUID();
    const next = linkCompetition(
      event,
      second,
      second.stages[0].id,
      event.divisions[0].id,
    );
    next.competitions[1].bindings = structuredClone(
      next.competitions[0].bindings,
    );
    for (let i = 0; i < 2; i++) {
      const doc = [tournament, second][i];
      doc.matches = doc.matches.slice(0, 1);
      doc.matches[0].scheduledAt = `2026-10-21T09:${i ? "10" : "00"}:00Z`;
      doc.matches[0].resourceId = doc.schedule.resources[0].id;
      doc.matches[0].referee = "Official A";
      next.competitions[i].resources = [
        { resourceId: doc.schedule.resources[0].id, sharedName: "Main Hall" },
      ];
    }
    expect(
      eventConflicts(eventSchedule(next, [tournament, second]))[0].reasons,
    ).toEqual(["venue", "referee", "entrant-rest"]);
    second.matches[0].scheduledAt = "2026-10-21T09:25:00Z";
    expect(
      eventConflicts(eventSchedule(next, [tournament, second]))[0].reasons,
    ).toEqual(["entrant-rest"]);
    second.matches[0].scheduledAt = "2026-10-21T09:30:00Z";
    expect(eventConflicts(eventSchedule(next, [tournament, second]))).toEqual(
      [],
    );
  });
});
