import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { autoSchedule } from "./index";
import { moveScheduledMatch, propagateDelay } from "./adjustments";
import { optimizeSchedule } from "./optimize";
import { planTravel } from "./travel";
import { newRun } from "../timing/model";

function fixture() {
  let t = createTournament(
    "Cup",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Team ${i + 1}`, i + 1),
    ),
  );
  t.schedule.startAt = "2027-01-01T10:00:00Z";
  t = generateStage(t, t.stages[0].id);
  return autoSchedule(t);
}
describe("reviewed schedule adjustments", () => {
  it("protects recorded timer evidence even when the operating status is ready", () => {
    const t = fixture();
    const match = t.matches[0];
    match.metadata.timing = {
      [match.slots[0].participantId!]: { ...newRun(), elapsedMs: 5000 },
    };
    const original = JSON.stringify(t);
    expect(() => autoSchedule(t)).toThrow(/locked after play/);
    expect(() => optimizeSchedule(t)).toThrow(/before play starts/);
    expect(() =>
      moveScheduledMatch(t, match.id, match.scheduledAt!, match.resourceId!),
    ).toThrow(/unplayed/);
    expect(() => propagateDelay(t, match.id, 5)).toThrow(/duration/);
    expect(() =>
      planTravel(t, [match.id], { routeFactor: 1, speedKmh: 50, costPerKm: 1 }),
    ).toThrow(/unplayed/);
    expect(
      propagateDelay(t, match.id, 5, true).tournament.matches[0]
        .durationMinutes,
    ).toBe(25);
    expect(JSON.stringify(t)).toBe(original);
  });
  it("propagates delays through resources and advancement rest without changing scores", () => {
    const t = fixture();
    const before = JSON.stringify(t);
    const result = propagateDelay(t, t.matches[0].id, 15);
    expect(result.conflicts).toEqual([]);
    expect(result.changes).toHaveLength(3);
    result.tournament.matches.forEach((m, i) =>
      expect(
        Date.parse(m.scheduledAt!) - Date.parse(t.matches[i].scheduledAt!),
      ).toBe(15 * 60000),
    );
    expect(JSON.stringify(t)).toBe(before);
  });
  it("extends a live match and refuses moving already started downstream play", () => {
    const t = fixture();
    t.matches[0].status = "live";
    expect(() => propagateDelay(t, t.matches[0].id, 10)).toThrow(/duration/);
    const result = propagateDelay(t, t.matches[0].id, 10, true);
    expect(result.tournament.matches[0].durationMinutes).toBe(30);
    expect(result.conflicts).toEqual([]);
    t.matches[1].status = "live";
    expect(() => propagateDelay(t, t.matches[0].id, 10, true)).toThrow(
      /played or live/,
    );
  });
  it("previews conflicting moves without applying or hiding the conflicts", () => {
    const t = fixture();
    const moved = moveScheduledMatch(
      t,
      t.matches[1].id,
      t.matches[0].scheduledAt!,
      t.schedule.resources[0].id,
    );
    expect(moved.conflicts.some((s) => s.includes("overlap"))).toBe(true);
    expect(t.matches[1].scheduledAt).not.toBe(
      moved.tournament.matches[1].scheduledAt,
    );
    expect(() => propagateDelay(moved.tournament, t.matches[0].id, 10)).toThrow(
      /existing schedule conflicts/,
    );
  });
  it("reports availability exhaustion and validates delay limits", () => {
    const t = fixture();
    t.schedule.resources[0].availableUntil = t.matches
      .at(-1)!
      .scheduledAt!.replace("11:00", "11:20");
    // Explicitly set the resource to the original final's end.
    t.schedule.resources[0].availableUntil = new Date(
      Date.parse(t.matches.at(-1)!.scheduledAt!) + 20 * 60000,
    ).toISOString();
    expect(
      propagateDelay(t, t.matches[0].id, 30).conflicts.some((s) =>
        s.includes("availability"),
      ),
    ).toBe(true);
    expect(() => propagateDelay(t, t.matches[0].id, 0)).toThrow(/between/);
  });
});
