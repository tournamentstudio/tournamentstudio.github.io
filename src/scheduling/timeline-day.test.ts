import { afterEach, expect, it, vi } from "vitest";
import { timelineDay } from "./timeline-day";

afterEach(() => vi.unstubAllEnvs());

it.each([
  [
    "America/Los_Angeles",
    "2026-03-08",
    46,
    "2026-03-08T08:00:00.000Z",
    "2026-03-09T07:00:00.000Z",
  ],
  [
    "America/Los_Angeles",
    "2026-11-01",
    50,
    "2026-11-01T07:00:00.000Z",
    "2026-11-02T08:00:00.000Z",
  ],
  [
    "Australia/Lord_Howe",
    "2026-10-04",
    47,
    "2026-10-03T13:30:00.000Z",
    "2026-10-04T13:00:00.000Z",
  ],
  [
    "Australia/Lord_Howe",
    "2026-04-05",
    49,
    "2026-04-04T13:00:00.000Z",
    "2026-04-05T13:30:00.000Z",
  ],
  [
    "Asia/Tehran",
    "2026-03-08",
    48,
    "2026-03-07T20:30:00.000Z",
    "2026-03-08T20:30:00.000Z",
  ],
])(
  "covers the actual local day in %s on %s",
  (zone, day, count, start, end) => {
    vi.stubEnv("TZ", zone);
    const timeline = timelineDay(day, "en")!;
    expect(timeline.slots).toHaveLength(count);
    expect(timeline.start).toBe(Date.parse(start));
    expect(timeline.end).toBe(Date.parse(end));
    expect(timeline.slots[0].at).toBe(start);
    expect(Date.parse(timeline.slots.at(-1)!.at) + 30 * 60_000).toBe(
      timeline.end,
    );
    expect(new Set(timeline.slots.map((slot) => slot.at)).size).toBe(count);
    expect(
      new Set(
        timeline.slots.map((slot) => `${slot.clock} ${slot.offset ?? ""}`),
      ).size,
    ).toBe(count);
  },
);

it("skips nonexistent clocks and labels both occurrences of repeated clocks", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  const spring = timelineDay("2026-03-08", "en")!;
  expect(spring.slots.slice(2, 6).map((slot) => slot.clock)).toEqual([
    "01:00",
    "01:30",
    "03:00",
    "03:30",
  ]);
  const autumn = timelineDay("2026-11-01", "en")!;
  expect(autumn.slots.filter((slot) => slot.clock === "01:30")).toEqual([
    { at: "2026-11-01T08:30:00.000Z", clock: "01:30", offset: "UTC-7" },
    { at: "2026-11-01T09:30:00.000Z", clock: "01:30", offset: "UTC-8" },
  ]);
});

it("localizes the complete clock label while retaining unambiguous offset labels", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  const timeline = timelineDay("2026-11-01", "fa")!;
  expect(timeline.slots[3]).toEqual({
    at: "2026-11-01T08:30:00.000Z",
    clock: "۰۱:۳۰",
    offset: "UTC-7",
  });
});

it("bounds a day whose clocks skip midnight without leaking into the next day", () => {
  vi.stubEnv("TZ", "America/Santiago");
  const timeline = timelineDay("2026-09-06", "en")!;
  expect(timeline.slots).toHaveLength(46);
  expect(timeline.slots[0].clock).toBe("01:00");
  expect(timeline.slots.at(-1)!.clock).toBe("23:30");
});

it.each(["", "invalid", "2026-02-30", "2026-13-01"])(
  "omits slots for invalid input %s",
  (day) => {
    expect(timelineDay(day, "en")).toBeUndefined();
  },
);

it("does not turn a skipped local calendar date into the following day", () => {
  vi.stubEnv("TZ", "Pacific/Apia");
  expect(timelineDay("2011-12-30", "en")).toBeUndefined();
});
