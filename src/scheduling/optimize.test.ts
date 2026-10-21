import { it, expect } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { detectConflicts } from "./index";
import { optimizeSchedule } from "./optimize";
function fixture() {
  let t = createTournament(
    "Small league",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Entrant ${i + 1}`, i + 1),
    ),
    "round-robin",
  );
  t.schedule.startAt = "2027-01-01T10:00:00Z";
  t.schedule.restMinutes = 0;
  t.schedule.resources = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  t = generateStage(t, t.stages[0].id);
  return t;
}
it("proves the minimum of a four-entrant league and preserves source data", () => {
  const t = fixture();
  const result = optimizeSchedule(t);
  expect(result.optimal).toBe(true);
  expect(result.minutes).toBe(60);
  expect(result.lowerBoundMinutes).toBe(60);
  expect(detectConflicts(result.tournament)).toEqual([]);
  expect(t.matches.every((m) => !m.scheduledAt)).toBe(true);
});
it("searches alternative orders when one late participant makes a greedy schedule longer", () => {
  const t = fixture();
  t.participants[0].metadata.availableFrom = "2027-01-01T11:00:00Z";
  const result = optimizeSchedule(t);
  expect(result.optimal).toBe(true);
  expect(result.minutes).toBe(120);
  expect(detectConflicts(result.tournament)).toEqual([]);
});
it("reports search limits without claiming proof and rejects played schedules", () => {
  const t = fixture();
  t.participants[0].metadata.availableFrom = "2027-01-01T11:00:00Z";
  expect(optimizeSchedule(t, 1).optimal).toBe(false);
  t.matches[0].status = "live";
  expect(() => optimizeSchedule(t)).toThrow(/before play/);
});
