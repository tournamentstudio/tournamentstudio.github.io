import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { changeMatchState, generateStage, recordResult } from "../engine";
import { saveAggregateProgress } from "../engine/aggregate";
import { newRun } from "../timing/model";
import { autoSchedule } from "./index";
import { scheduleOccurrences } from "./legs";
import { updateDirectBooking, updateScheduleSettings } from "./settings";

function fixture(aggregate = false) {
  const doc = createTournament("Booking safety", [
    createParticipant("One", 1),
    createParticipant("Two", 2),
  ]);
  if (aggregate)
    doc.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
    };
  return autoSchedule(generateStage(doc, doc.stages[0].id));
}

it("locks inherited duration for a postponed scored leg while allowing other settings", () => {
  let doc = fixture(true);
  doc = changeMatchState(
    saveAggregateProgress(doc, doc.matches[0].id, [[0, 0]]),
    doc.matches[0].id,
    "postponed",
  );
  const before = structuredClone(doc);
  expect(doc.matches[0].legSchedule![0].durationMinutes).toBeUndefined();
  expect(() =>
    updateScheduleSettings(doc, { ...doc.schedule, matchMinutes: 90 }),
  ).toThrow(/Default match duration is locked/);
  const changed = updateScheduleSettings(doc, {
    ...doc.schedule,
    restMinutes: 12,
  });
  expect(changed.schedule.restMinutes).toBe(12);
  expect(changed.schedule.matchMinutes).toBe(before.schedule.matchMinutes);
  expect(scheduleOccurrences(changed)).toEqual(scheduleOccurrences(before));
  expect(doc).toEqual(before);
});

it("locks default and direct booking changes for a ready match with stopped timer evidence", () => {
  const doc = fixture();
  const match = doc.matches[0];
  match.metadata.timing = {
    [match.slots[0].participantId!]: { ...newRun(), elapsedMs: 4000 },
  };
  const before = structuredClone(doc);
  expect(match.status).toBe("ready");
  expect(() =>
    updateScheduleSettings(doc, { ...doc.schedule, matchMinutes: 90 }),
  ).toThrow(/Default match duration is locked/);
  expect(() =>
    updateDirectBooking(doc, match.id, { scheduledAt: undefined }),
  ).toThrow(/Only unplayed/);
  expect(() =>
    updateDirectBooking(doc, match.id, { resourceId: undefined }),
  ).toThrow(/Only unplayed/);
  expect(doc).toEqual(before);
});

it("locks direct bookings for an official completed match", () => {
  let doc = fixture();
  const match = doc.matches[0];
  doc = recordResult(doc, match.id, {
    outcome: "played",
    scores: [1, 0],
    winnerIds: [match.slots[0].participantId!],
    recordedAt: doc.updatedAt,
  });
  expect(() =>
    updateDirectBooking(doc, match.id, { scheduledAt: undefined }),
  ).toThrow(/Only unplayed/);
});

it("permits default and direct booking edits before play without mutating the source", () => {
  const doc = fixture();
  const before = structuredClone(doc);
  const changed = updateScheduleSettings(doc, {
    ...doc.schedule,
    matchMinutes: 45,
  });
  expect(changed.schedule.matchMinutes).toBe(45);
  const moved = updateDirectBooking(doc, doc.matches[0].id, {
    scheduledAt: "2027-01-01T12:00:00.000Z",
    resourceId: undefined,
  });
  expect(moved.matches[0].scheduledAt).toBe("2027-01-01T12:00:00.000Z");
  expect(moved.matches[0].resourceId).toBeUndefined();
  expect(doc).toEqual(before);
});

it("requires the leg editor for an aggregate booking", () => {
  const doc = fixture(true);
  expect(() =>
    updateDirectBooking(doc, doc.matches[0].id, { scheduledAt: undefined }),
  ).toThrow(/individual aggregate legs/);
});
