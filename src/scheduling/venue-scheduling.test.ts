import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import { autoSchedule, detectConflicts } from "./index";

function fixture() {
  const tournament = createTournament(
    "Two venues",
    Array.from({ length: 8 }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      location: { latitude: 0, longitude: index < 4 ? index : 100 + index - 4 },
    })),
    "single-elimination",
  );
  tournament.schedule = {
    startAt: "2026-10-20T12:00:00Z",
    matchMinutes: 20,
    restMinutes: 5,
    resources: [
      {
        id: "west",
        name: "West court",
        location: { latitude: 0, longitude: 0 },
      },
      {
        id: "east",
        name: "East court",
        location: { latitude: 0, longitude: 100 },
      },
    ],
  };
  tournament.stages[0].config.knockoutDraw = {
    version: 6,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    venueRules: [
      {
        resourceId: "west",
        maxKm: 500,
        targets: [{ bracket: "winners", round: 2, index: 0 }],
      },
      {
        resourceId: "east",
        maxKm: 500,
        targets: [{ bracket: "winners", round: 2, index: 1 }],
      },
    ],
  };
  return generateStage(tournament, tournament.stages[0].id);
}

describe("venue-restricted scheduling", () => {
  it("uses the selected interface language for new venue conflicts", () => {
    const tournament = fixture();
    delete tournament.schedule.resources[0].location;
    expect(tournament.locale).toBe("en");
    expect(
      detectConflicts(tournament, "fa").some(
        (issue) => issue.includes("مختصات") || issue.includes("جغرافیایی"),
      ),
    ).toBe(true);
    expect(() => autoSchedule(tournament, "fa")).toThrow(/جغرافیایی/);
  });
  it("retains each draw venue while allocating times, rest and resources", () => {
    const tournament = fixture();
    const scheduled = autoSchedule(tournament);
    for (const match of scheduled.matches) {
      const assigned = assignedKnockoutVenue(scheduled.stages[0], match);
      if (assigned) expect(match.resourceId).toBe(assigned);
    }
    expect(detectConflicts(scheduled)).toEqual([]);
    expect(scheduled.matches.every((match) => !!match.scheduledAt)).toBe(true);
    expect(tournament.matches.every((match) => !match.scheduledAt)).toBe(true);
  });

  it("detects a changed or missing assignment before any time is scheduled and repairs it", () => {
    const tournament = fixture();
    const target = tournament.matches.find(
      (match) => match.round === 2 && match.index === 0,
    )!;
    target.resourceId = "east";
    expect(
      detectConflicts(tournament).some((issue) => issue.includes("West court")),
    ).toBe(true);
    delete target.resourceId;
    expect(detectConflicts(tournament).length).toBeGreaterThan(0);
    expect(
      autoSchedule(tournament).matches.find((match) => match.id === target.id)
        ?.resourceId,
    ).toBe("west");
  });

  it("does not substitute another venue when the assigned one has no time window", () => {
    const tournament = fixture();
    tournament.schedule.resources[0].availableUntil = "2026-10-20T12:10:00Z";
    expect(() => autoSchedule(tournament)).toThrow(/No available resource/);
    expect(tournament.matches.every((match) => !match.scheduledAt)).toBe(true);
  });

  it("rechecks edited entrant and venue locations against every original path", () => {
    const tournament = fixture();
    tournament.participants[0].location!.longitude = -100;
    expect(detectConflicts(tournament).length).toBeGreaterThan(0);
    expect(() => autoSchedule(tournament)).toThrow();
    const movedVenue = fixture();
    movedVenue.schedule.resources[0].location!.longitude = -100;
    expect(() => autoSchedule(movedVenue)).toThrow();
  });

  it("blocks scheduling without required coordinates while retaining recorded results", () => {
    const tournament = fixture();
    const match = tournament.matches.find((item) => item.status === "ready")!;
    const scored = recordResult(tournament, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-10-20T12:00:00Z",
    });
    delete scored.schedule.resources[0].location;
    expect(() => autoSchedule(scored)).toThrow();
    expect(
      scored.matches.find((item) => item.id === match.id)?.result?.scores,
    ).toEqual([2, 1]);
  });

  it("retains the assigned venue on an opening walkover without giving it playing time", () => {
    let tournament = createTournament(
      "BYE venue",
      Array.from({ length: 3 }, (_, index) => ({
        ...createParticipant(`Team ${index + 1}`, index + 1),
        location: { latitude: 0, longitude: 0 },
      })),
      "single-elimination",
    );
    tournament.schedule.resources = [
      { id: "court", name: "Court", location: { latitude: 0, longitude: 0 } },
    ];
    tournament.stages[0].config.knockoutDraw = {
      version: 6,
      pots: [],
      restrictions: [],
      protectedSeeds: 0,
      separation: [],
      losersSeparation: [],
      finalsSeparation: [],
      venueRules: [
        {
          resourceId: "court",
          maxKm: 0,
          targets: [
            { bracket: "winners", round: 1, index: 0 },
            { bracket: "winners", round: 1, index: 1 },
          ],
        },
      ],
    };
    tournament = generateStage(tournament, tournament.stages[0].id);
    const bye = tournament.matches.find((match) => match.status === "bye")!;
    const scheduled = autoSchedule(tournament).matches.find(
      (match) => match.id === bye.id,
    )!;
    expect(scheduled.resourceId).toBe("court");
    expect(scheduled.scheduledAt).toBeUndefined();
  });
});
