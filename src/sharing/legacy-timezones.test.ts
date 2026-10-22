import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage } from "../engine";
import {
  applyLegacyTimezoneReview,
  createLegacyWallTimeResolver,
  LegacyTimezoneReviewError,
  listLegacyTimezoneFields,
  resolveLegacyWallTime,
} from "./legacy-timezones";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fixture() {
  let document = createTournament("زمان مسابقه", [
    createParticipant("تیم نخست", 1),
    createParticipant("Team Two", 2),
  ]);
  document.stages[0].config.aggregate = {
    version: 1,
    legs: 2,
    tieBreak: "extra-leg",
  };
  document = generateStage(document, document.stages[0].id);
  document.schedule.startAt = "2026-10-21T11:00";
  document.schedule.resources[0].availableFrom = "2026-10-21T10:00";
  document.schedule.resources[0].availableUntil = "2026-10-21T18:00";
  document.participants[0].metadata.availableFrom = "2026-10-21T10:30";
  document.participants[0].metadata.availableUntil = "2026-10-21T17:00";
  document.matches[0].scheduledAt = "2026-10-21T11:30";
  document.matches[0].legSchedule = [
    { leg: 1, scheduledAt: "2026-10-21T11:30" },
    { leg: 2, scheduledAt: "2026-10-21T13:30:00+03:30" },
  ];
  return document;
}

describe("legacy timezone field selection", () => {
  it("finds only the supported scheduling fields with stable entity references", () => {
    const document = fixture();
    document.createdAt = "2026-10-21T11:00";
    document.updatedAt = "2026-10-21T11:00";
    document.history = [
      {
        id: "old-edit",
        revision: 0,
        at: "2026-10-21T11:00",
        action: "Created",
      },
    ];
    document.metadata.customTime = "2026-10-21T11:00";
    document.participants[0].metadata.birthday = "2026-10-21T11:00";
    document.matches[0].private = {
      concealedPosition: "left",
      notes: "2026-10-21T11:00",
    };
    document.matches[0].metadata.customTime = "2026-10-21T11:00";
    const fields = listLegacyTimezoneFields(document);
    expect(fields.map((field) => field.kind)).toEqual([
      "schedule-start",
      "resource-from",
      "resource-until",
      "participant-from",
      "participant-until",
      "match-start",
      "leg-start",
    ]);
    expect(fields[1].resourceId).toBe(document.schedule.resources[0].id);
    expect(fields[3].participantId).toBe(document.participants[0].id);
    expect(fields[5].matchId).toBe(document.matches[0].id);
    expect(fields[6]).toMatchObject({
      matchId: document.matches[0].id,
      leg: 1,
    });
    expect(JSON.stringify(fields)).not.toContain("concealedPosition");
    expect(JSON.stringify(fields)).not.toContain("customTime");
    expect(new Set(fields.map((field) => field.id)).size).toBe(fields.length);
  });

  it("does not select dated instants, date-only values, arbitrary text, or nested custom data", () => {
    const document = fixture();
    document.schedule.startAt = "2026-10-21T11:00:00Z";
    document.schedule.resources[0].availableFrom = "2026-10-21T11:00:00+03:30";
    document.schedule.resources[0].availableUntil = "2026-10-21T11:00:00-07:00";
    document.participants[0].metadata.availableFrom = "2026-10-21";
    document.participants[0].metadata.availableUntil = {
      date: "2026-10-21T11:00",
    };
    document.matches[0].scheduledAt = "Wednesday at noon";
    document.matches[0].legSchedule![0].scheduledAt =
      "2026-10-21T11:00:00.000Z";
    expect(listLegacyTimezoneFields(document)).toEqual([]);
  });
});

describe("timezone wall-time resolution", () => {
  it.each([
    [
      "America/Los_Angeles",
      "2026-10-21T11:00",
      "2026-10-21T18:00:00.000Z",
      -420,
    ],
    [
      "America/Los_Angeles",
      "2026-12-21T11:00",
      "2026-12-21T19:00:00.000Z",
      -480,
    ],
    ["Asia/Tehran", "2026-10-21T11:00", "2026-10-21T07:30:00.000Z", 210],
    ["Asia/Kathmandu", "2026-10-21T11:00", "2026-10-21T05:15:00.000Z", 345],
    ["UTC", "2026-10-21T11:00:05.123", "2026-10-21T11:00:05.123Z", 0],
    ["UTC", "2026-10-21 11:00:05.1", "2026-10-21T11:00:05.100Z", 0],
    ["UTC", "0099-10-21T11:00", "0099-10-21T11:00:00.000Z", 0],
    ["Asia/Tehran", "2020-12-21T00:00", "2020-12-20T20:30:00.000Z", 210],
    [
      "America/Los_Angeles",
      "2026-11-01T00:00",
      "2026-11-01T07:00:00.000Z",
      -420,
    ],
  ])("resolves %s wall time %s", (zone, wallTime, iso, offsetMinutes) => {
    expect(resolveLegacyWallTime(wallTime, zone)).toEqual({
      status: "unique",
      candidates: [{ iso, offsetMinutes }],
    });
  });

  it("offers both autumn clock-change candidates in chronological order", () => {
    expect(
      resolveLegacyWallTime("2026-11-01T01:30", "America/Los_Angeles"),
    ).toEqual({
      status: "ambiguous",
      candidates: [
        { iso: "2026-11-01T08:30:00.000Z", offsetMinutes: -420 },
        { iso: "2026-11-01T09:30:00.000Z", offsetMinutes: -480 },
      ],
    });
  });

  it("supports a half-hour clock change", () => {
    expect(
      resolveLegacyWallTime("2026-04-05T01:45", "Australia/Lord_Howe"),
    ).toEqual({
      status: "ambiguous",
      candidates: [
        { iso: "2026-04-04T14:45:00.000Z", offsetMinutes: 660 },
        { iso: "2026-04-04T15:15:00.000Z", offsetMinutes: 630 },
      ],
    });
  });

  it.each([
    ["America/Los_Angeles", "2026-03-08T02:30"],
    ["Pacific/Apia", "2011-12-30T12:00"],
    ["Asia/Tehran", "2021-03-22T00:30"],
  ])("rejects nonexistent wall times in %s", (zone, wallTime) => {
    expect(resolveLegacyWallTime(wallTime, zone)).toEqual({
      status: "nonexistent",
      candidates: [],
    });
  });

  it.each([
    "2026-02-30T11:00",
    "2026-13-01T11:00",
    "2026-00-21T11:00",
    "2026-10-00T11:00",
    "2026-10-21T24:00",
    "2026-10-21T11:60",
    "2026-10-21T11:00:60",
    "2026-10-21T11:00:00.0001",
    "0000-10-21T11:00",
    "2026-10-21T11:00Z",
    "2026-10-21T11:00:00+03:30",
    "2026-10-21",
    "invalid",
  ])("rejects invalid or already-zoned wall input %s", (value) => {
    expect(resolveLegacyWallTime(value, "UTC")).toEqual({
      status: "invalid-date",
      candidates: [],
    });
  });

  it.each(["", "Unknown/Timezone", "x".repeat(101)])(
    "rejects invalid timezone %s",
    (zone) => {
      expect(resolveLegacyWallTime("2026-10-21T11:00", zone)).toEqual({
        status: "invalid-timezone",
        candidates: [],
      });
    },
  );

  it("resolves independently of the importing device timezone", () => {
    vi.stubEnv("TZ", "Asia/Tehran");
    const tehranDevice = resolveLegacyWallTime(
      "2026-10-21T11:00",
      "America/Los_Angeles",
    );
    vi.stubEnv("TZ", "America/New_York");
    expect(
      resolveLegacyWallTime("2026-10-21T11:00", "America/Los_Angeles"),
    ).toEqual(tehranDevice);
  });

  it("shares bounded day probes within a review without caching private field values", () => {
    const format = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    const resolve = createLegacyWallTimeResolver();
    for (let minute = 0; minute < 60; minute++) {
      const padded = minute.toString().padStart(2, "0");
      expect(resolve(`2026-10-21T11:${padded}`, "Asia/Tehran")).toEqual({
        status: "unique",
        candidates: [
          {
            iso: new Date(
              Date.UTC(2026, 9, 21, 11, minute) - 210 * 60_000,
            ).toISOString(),
            offsetMinutes: 210,
          },
        ],
      });
    }
    expect(format).toHaveBeenCalledTimes(85);
    expect(resolve("2026-11-01T01:30", "America/Los_Angeles").status).toBe(
      "ambiguous",
    );
    expect(resolve("2026-03-08T02:30", "America/Los_Angeles").status).toBe(
      "nonexistent",
    );
  });
});

describe("legacy timezone corrections", () => {
  it("corrects selected fields while preserving all other document contents and the original", () => {
    const document = fixture();
    const before = structuredClone(document);
    const fields = listLegacyTimezoneFields(document);
    const corrected = applyLegacyTimezoneReview(
      document,
      fields.map((field) => ({
        fieldId: field.id,
        timeZone: "Asia/Tehran",
      })),
    );
    expect(document).toEqual(before);
    expect(corrected.schedule.startAt).toBe("2026-10-21T07:30:00.000Z");
    expect(corrected.schedule.resources[0].availableFrom).toBe(
      "2026-10-21T06:30:00.000Z",
    );
    expect(corrected.schedule.resources[0].availableUntil).toBe(
      "2026-10-21T14:30:00.000Z",
    );
    expect(corrected.participants[0].metadata.availableFrom).toBe(
      "2026-10-21T07:00:00.000Z",
    );
    expect(corrected.participants[0].metadata.availableUntil).toBe(
      "2026-10-21T13:30:00.000Z",
    );
    expect(corrected.matches[0].scheduledAt).toBe("2026-10-21T08:00:00.000Z");
    expect(corrected.matches[0].legSchedule![0].scheduledAt).toBe(
      "2026-10-21T08:00:00.000Z",
    );
    expect(corrected.matches[0].legSchedule![1]).toEqual(
      before.matches[0].legSchedule![1],
    );
    expect(validateTournament(corrected)).toEqual(corrected);
    expect(corrected.revision).toBe(before.revision);
    expect(corrected.revisionHash).toBe(before.revisionHash);
    expect(corrected.history).toEqual(before.history);
    expect(corrected.updatedAt).toBe(before.updatedAt);
    expect(corrected.timezone).toBe(before.timezone);
  });

  it("allows editing only the tournament start while leaving other legacy fields unchanged", () => {
    const document = fixture();
    document.matches[0].legSchedule![0].scheduledAt = "2026-10-21T11:30:00Z";
    const expected = structuredClone(document);
    expected.schedule.startAt = "2026-10-22T08:05:00.000Z";
    const corrected = applyLegacyTimezoneReview(document, [
      {
        fieldId: "/schedule/startAt",
        timeZone: "Asia/Tehran",
        wallTime: "2026-10-22T11:35",
      },
    ]);
    expect(corrected).toEqual(expected);
  });

  it("returns an independent identical document when no changes are selected", () => {
    const document = fixture();
    document.matches[0].legSchedule![0].scheduledAt = "2026-10-21T11:30:00Z";
    const corrected = applyLegacyTimezoneReview(document, []);
    expect(JSON.stringify(corrected)).toBe(JSON.stringify(document));
    expect(corrected).not.toBe(document);
  });

  it.each([
    ["earlier", "2026-11-01T08:30:00.000Z"],
    ["later", "2026-11-01T09:30:00.000Z"],
  ] as const)(
    "requires and applies the explicit %s clock-change choice",
    (disambiguation, expected) => {
      const document = createTournament("Repeated hour", []);
      document.schedule.startAt = "2026-11-01T01:30";
      const choice = {
        fieldId: "/schedule/startAt",
        timeZone: "America/Los_Angeles",
      };
      expect(() => applyLegacyTimezoneReview(document, [choice])).toThrow(
        LegacyTimezoneReviewError,
      );
      try {
        applyLegacyTimezoneReview(document, [choice]);
      } catch (error) {
        expect((error as LegacyTimezoneReviewError).issues).toEqual([
          { fieldId: choice.fieldId, code: "ambiguous" },
        ]);
      }
      expect(
        applyLegacyTimezoneReview(document, [{ ...choice, disambiguation }])
          .schedule.startAt,
      ).toBe(expected);
    },
  );

  it("reports each invalid selection and never partially mutates the source", () => {
    const document = fixture();
    const before = structuredClone(document);
    const choices = [
      { fieldId: "/schedule/startAt", timeZone: "UTC" },
      { fieldId: "/schedule/startAt", timeZone: "UTC" },
      { fieldId: "/__proto__/polluted", timeZone: "UTC" },
      {
        fieldId: "/matches/0/scheduledAt",
        timeZone: "America/Los_Angeles",
        wallTime: "2026-03-08T02:30",
      },
    ];
    try {
      applyLegacyTimezoneReview(document, choices);
    } catch (error) {
      expect(error).toBeInstanceOf(LegacyTimezoneReviewError);
      expect(
        (error as LegacyTimezoneReviewError).issues.map((issue) => issue.code),
      ).toEqual(["duplicate-field", "unknown-field", "nonexistent"]);
    }
    expect(() => applyLegacyTimezoneReview(document, choices)).toThrow();
    expect(document).toEqual(before);
  });

  it("rejects attempts to rewrite explicit offsets or unrelated metadata", () => {
    const document = createTournament("Offset backup", []);
    document.metadata.customTime = "2026-10-21T11:00";
    for (const fieldId of [
      "/schedule/startAt",
      "/metadata/customTime",
      "/createdAt",
    ])
      expect(() =>
        applyLegacyTimezoneReview(document, [{ fieldId, timeZone: "UTC" }]),
      ).toThrow(LegacyTimezoneReviewError);
  });

  it("validates the entire corrected document before returning it", () => {
    const document = createTournament("Invalid format", []);
    document.schedule.startAt = "2026-10-21T11:00";
    document.stages[0].participantIds = ["missing"];
    expect(() =>
      applyLegacyTimezoneReview(document, [
        { fieldId: "/schedule/startAt", timeZone: "UTC" },
      ]),
    ).toThrow("missing participant");
  });
});
