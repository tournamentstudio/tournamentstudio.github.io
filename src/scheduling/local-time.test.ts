import { afterEach, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { dateTimeInputToIso, localDateTime } from "./local-time";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it.each([
  ["America/Los_Angeles", "2026-10-21T18:00:00.000Z", "2026-10-21T11:00"],
  ["America/Los_Angeles", "2026-12-21T18:00:00.000Z", "2026-12-21T10:00"],
  ["America/Los_Angeles", "2026-03-08T09:30:00.000Z", "2026-03-08T01:30"],
  ["America/Los_Angeles", "2026-03-08T10:30:00.000Z", "2026-03-08T03:30"],
  ["Asia/Tehran", "2026-10-21T18:00:00.000Z", "2026-10-21T21:30"],
  ["Asia/Tehran", "2026-12-21T18:00:00.000Z", "2026-12-21T21:30"],
])(
  "preserves an instant through the %s input at %s",
  (zone, instant, local) => {
    vi.stubEnv("TZ", zone);
    expect(localDateTime(instant)).toBe(local);
    expect(dateTimeInputToIso(local)).toBe(instant);
    expect(localDateTime(local)).toBe(local);
  },
);

it.each(["America/Los_Angeles", "Asia/Tehran"])(
  "creates the same schedule instant in %s",
  (zone) => {
    vi.stubEnv("TZ", zone);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T18:00:42.000Z"));
    const document = createTournament("Start time", [
      createParticipant("North", 1),
      createParticipant("South", 2),
    ]);
    expect(document.schedule.startAt).toBe("2026-10-21T18:00:00.000Z");
  },
);

it("keeps empty optional time inputs empty and handles invalid imported values", () => {
  expect(localDateTime()).toBe("");
  expect(localDateTime("invalid")).toBe("");
  expect(dateTimeInputToIso("")).toBe("");
  expect(dateTimeInputToIso("invalid")).toBe("");
});
