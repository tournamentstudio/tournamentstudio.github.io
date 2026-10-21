import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { planTravel } from "./travel";
function fixture() {
  let t = createTournament(
    "Local cup",
    Array.from({ length: 4 }, (_, i) => ({
      ...createParticipant(`Entrant ${i + 1}`, i + 1),
      location: { latitude: 0, longitude: i < 2 ? 0 : 2 },
    })),
  );
  t = generateStage(t, t.stages[0].id);
  t.schedule.resources = [
    { id: "west", name: "West", location: { latitude: 0, longitude: 0 } },
    { id: "east", name: "East", location: { latitude: 0, longitude: 2 } },
  ];
  t.matches
    .slice(0, 2)
    .forEach((m) => (m.scheduledAt = "2027-01-01T10:00:00Z"));
  return t;
}
const assumptions = { routeFactor: 1.2, speedKmh: 50, costPerKm: 0.4 };
it("minimizes estimated home-to-venue distance while avoiding simultaneous court use", () => {
  const t = fixture();
  const ids = t.matches.slice(0, 2).map((m) => m.id);
  const result = planTravel(t, ids, assumptions);
  expect(result.optimal).toBe(true);
  expect(new Set(result.assignments.map((a) => a.resourceId)).size).toBe(2);
  expect(result.totalMinutes).toBeCloseTo((result.totalKm / 50) * 60);
  expect(result.totalCost).toBeCloseTo(result.totalKm * 0.4);
  expect(result.conflicts).toEqual([]);
  expect(t.matches[0].resourceId).toBeUndefined();
});
it("respects an occupied venue and reports infeasible assignments", () => {
  const t = fixture();
  t.schedule.resources = t.schedule.resources.slice(0, 1);
  expect(() =>
    planTravel(
      t,
      t.matches.slice(0, 2).map((m) => m.id),
      assumptions,
    ),
  ).toThrow(/avoid overlap/);
});
it("does not imply road routing or silently invent missing coordinates", () => {
  const t = fixture();
  delete t.participants[0].location;
  expect(() =>
    planTravel(
      t,
      t.matches.slice(0, 2).map((m) => m.id),
      assumptions,
    ),
  ).toThrow(/coordinates/);
  expect(() => planTravel(fixture(), [], assumptions)).toThrow(/between/);
  expect(() => planTravel(fixture(), ["bad"], assumptions)).toThrow(
    /confirmed entrants/,
  );
});
