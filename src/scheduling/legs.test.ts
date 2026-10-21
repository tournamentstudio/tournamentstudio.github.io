import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { changeMatchState, generateStage } from "../engine";
import { saveAggregateProgress } from "../engine/aggregate";
import { autoSchedule, detectConflicts, estimateDuration } from "./index";
import { scheduleOccurrences } from "./legs";
import { bookAggregateLegs } from "./leg-adjustments";
import { moveScheduledMatch, propagateDelay } from "./adjustments";
import { optimizeSchedule } from "./optimize";
import { tournamentCalendar, tournamentCSV, printableHTML } from "../export";
import { createCollection, linkCompetition } from "../collections/model";
import { eventSchedule } from "../collections/schedule";
function fixture(count = 4) {
  let t = createTournament(
    "Two leg cup",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`Team ${i + 1}`, i + 1),
    ),
  );
  t.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "extra-leg" };
  t.schedule.startAt = "2027-01-01T10:00:00Z";
  t.schedule.resources = [
    { id: "a", name: "Arena A" },
    { id: "b", name: "Arena B" },
  ];
  t = generateStage(t, t.stages[0].id);
  return autoSchedule(t);
}
it("schedules every leg before downstream ties and includes rest", () => {
  const t = fixture();
  expect(t.matches.every((m) => m.legSchedule?.length === 2)).toBe(true);
  expect(detectConflicts(t)).toEqual([]);
  expect(validateTournament(t)).toEqual(t);
  const final = t.matches.at(-1)!;
  for (const semifinal of t.matches.slice(0, 2)) {
    expect(Date.parse(final.scheduledAt!)).toBeGreaterThanOrEqual(
      Date.parse(semifinal.legSchedule![1].scheduledAt) +
        (t.schedule.matchMinutes + t.schedule.restMinutes) * 60000,
    );
  }
  expect(estimateDuration(t).matches).toBe(6);
});
it("keeps temporary leg identities distinct from imported match identifiers", () => {
  const t = fixture();
  const old = t.matches[1].id;
  t.matches[1].id = `${t.matches[0].id}~leg~1`;
  for (const m of t.matches)
    for (const slot of m.slots)
      if (slot.source?.matchId === old) slot.source.matchId = t.matches[1].id;
  const occurrences = scheduleOccurrences(t);
  expect(new Set(occurrences.map((m) => m.id)).size).toBe(6);
  const scheduled = autoSchedule(t);
  expect(detectConflicts(scheduled)).toEqual([]);
  expect(validateTournament(scheduled)).toEqual(scheduled);
});
it("finds conflicts on the second leg and previews manual bookings without mutation", () => {
  const t = fixture();
  const first = t.matches[0],
    second = t.matches[1];
  const bookings = structuredClone(second.legSchedule!);
  bookings[1] = {
    ...bookings[1],
    scheduledAt: first.legSchedule![1].scheduledAt,
    resourceId: first.legSchedule![1].resourceId,
  };
  const review = bookAggregateLegs(t, second.id, bookings);
  expect(review.conflicts.some((s) => s.includes("overlap"))).toBe(true);
  expect(t.matches[1].legSchedule).not.toEqual(bookings);
  expect(review.changes.map((c) => c.matchId)).toEqual([`${second.id}~leg~2`]);
});
it("delays a later leg and downstream matches without moving earlier legs", () => {
  const t = fixture();
  const leg = scheduleOccurrences(t)[1];
  const changed = propagateDelay(t, leg.id, 10);
  expect(changed.conflicts).toEqual([]);
  expect(changed.tournament.matches[0].legSchedule![0]).toEqual(
    t.matches[0].legSchedule![0],
  );
  expect(
    Date.parse(changed.tournament.matches[0].legSchedule![1].scheduledAt) -
      Date.parse(t.matches[0].legSchedule![1].scheduledAt),
  ).toBe(600000);
  expect(changed.tournament.matches.at(-1)!.scheduledAt).not.toBe(
    t.matches.at(-1)!.scheduledAt,
  );
});
it("moves individual legs and blocks changes to scored legs", () => {
  const t = fixture(2),
    leg = scheduleOccurrences(t)[1];
  const changed = moveScheduledMatch(
    t,
    leg.id,
    new Date(Date.parse(leg.scheduledAt!) + 600000).toISOString(),
    "b",
  );
  expect(changed.conflicts).toEqual([]);
  expect(changed.tournament.matches[0].legSchedule![1].resourceId).toBe("b");
  t.matches[0].aggregateProgress = [[2, 1]];
  expect(() =>
    moveScheduledMatch(t, scheduleOccurrences(t)[0].id, leg.scheduledAt!, "b"),
  ).toThrow(/scored/);
});
it("optimizes expanded jobs and keeps original competition identities", () => {
  const t = fixture();
  const ids = t.matches.map((m) => m.id);
  const result = optimizeSchedule(t);
  expect(result.optimal).toBe(true);
  expect(result.tournament.matches.map((m) => m.id)).toEqual(ids);
  expect(detectConflicts(result.tournament)).toEqual([]);
  expect(
    result.tournament.matches.every((m) => m.legSchedule?.length === 2),
  ).toBe(true);
});
it("keeps scored leg evidence while moving the postponed unplayed return leg", () => {
  let t = fixture(2);
  const id = t.matches[0].id;
  t = saveAggregateProgress(t, id, [[2, 1]]);
  t = changeMatchState(t, id, "postponed");
  const leg = scheduleOccurrences(t)[1];
  const preview = moveScheduledMatch(t, leg.id, "2027-01-01T12:00:00Z", "b");
  expect(preview.conflicts).toEqual([]);
  expect(preview.tournament.matches[0].aggregateProgress).toEqual([[2, 1]]);
  expect(preview.tournament.matches[0].legSchedule![0]).toEqual(
    t.matches[0].legSchedule![0],
  );
  expect(preview.tournament.matches[0].legSchedule![1].resourceId).toBe("b");
  expect(() => optimizeSchedule(t)).toThrow(/before play starts/);
});
it("exports separate calendar, CSV, print and event entries for every leg", () => {
  const t = fixture();
  expect(tournamentCalendar(t).match(/BEGIN:VEVENT/g)).toHaveLength(6);
  expect(tournamentCSV(t).split("\r\n")).toHaveLength(7);
  expect(printableHTML(t)).toContain("Leg 2");
  const event = createCollection("Weekend", "2027");
  const linked = linkCompetition(
    event,
    t,
    t.stages[0].id,
    event.divisions[0].id,
  );
  const slots = eventSchedule(linked, [t]);
  expect(slots).toHaveLength(6);
  expect(slots.every((s) => s.label.includes("Leg"))).toBe(true);
  expect(new Set(slots.map((s) => s.matchId)).size).toBe(6);
});
it("books a provisional extra leg only for the configured policy", () => {
  const t = fixture(2);
  const m = t.matches[0];
  const extra = {
    leg: 3,
    scheduledAt: "2027-01-01T12:00:00Z",
    resourceId: "a",
    durationMinutes: 20,
  };
  const result = bookAggregateLegs(t, m.id, [...m.legSchedule!, extra]);
  expect(result.conflicts).toEqual([]);
  expect(scheduleOccurrences(result.tournament)).toHaveLength(3);
  const removed = bookAggregateLegs(result.tournament, m.id, m.legSchedule!);
  expect(removed.changes).toHaveLength(1);
  expect(removed.changes[0].after).toBe("");
  expect(scheduleOccurrences(removed.tournament)).toHaveLength(2);
  t.stages[0].config.aggregate!.tieBreak = "manual";
  expect(() => bookAggregateLegs(t, m.id, [...m.legSchedule!, extra])).toThrow(
    /permitted extra/,
  );
});
it("protects scored legs from bulk regeneration and extra booking removal", () => {
  const t = fixture(2),
    m = t.matches[0];
  m.legSchedule!.push({
    leg: 3,
    scheduledAt: "2027-01-01T12:00:00Z",
    resourceId: "a",
    durationMinutes: 20,
  });
  m.aggregateProgress = [
    [1, 0],
    [0, 1],
    [2, 0],
  ];
  m.liveScores = [3, 1];
  m.status = "postponed";
  expect(() => bookAggregateLegs(t, m.id, m.legSchedule!.slice(0, 2))).toThrow(
    /scored aggregate leg/,
  );
  expect(() => autoSchedule(t)).toThrow(/locked after play/);
  expect(m.legSchedule).toHaveLength(3);
});
