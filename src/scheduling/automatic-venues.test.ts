import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type KnockoutVenueTarget,
} from "../domain/types";
import { generateStage, previewKnockoutDraw, recordResult } from "../engine";
import { autoSchedule, detectConflicts } from "./index";
import { previewScheduledKnockoutVenues } from "./automatic-venues";

const opening = (index: number): KnockoutVenueTarget => ({
  bracket: "winners",
  round: 1,
  index,
});

function fixture(count = 4) {
  const tournament = createTournament(
    "Venue selection",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      location: { latitude: 0, longitude: 0 },
    })),
  );
  tournament.schedule = {
    startAt: "2026-10-21T12:00:00Z",
    matchMinutes: 20,
    restMinutes: 5,
    resources: [
      { id: "near", name: "Near", location: { latitude: 0, longitude: 0 } },
      { id: "far", name: "Far", location: { latitude: 0, longitude: 1 } },
    ],
  };
  return tournament;
}

const request = {
  resourceIds: ["near", "far"],
  targets: [opening(0), opening(1)],
  maxKm: 500,
};

describe("automatic venue availability", () => {
  it("backtracks from a closed nearer venue without mutating the document", () => {
    const tournament = fixture();
    tournament.schedule.resources[0].availableUntil = "2026-10-21T12:10:00Z";
    const before = structuredClone(tournament);
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      request,
    );
    expect(proposal.ready).toBe(true);
    expect(proposal.availabilityChecked).toBe(true);
    expect(proposal.scheduleRejected).toBeGreaterThan(0);
    expect(proposal.assignments.map((item) => item.resourceId)).toEqual([
      "far",
      "far",
    ]);
    expect(proposal.schedulePreview).toEqual({
      matchCount: 3,
      startsAt: "2026-10-21T12:00:00.000Z",
      endsAt: "2026-10-21T13:05:00.000Z",
    });
    expect(tournament).toEqual(before);
  });

  it("splits simultaneous opening matches between short venue windows", () => {
    const tournament = fixture();
    tournament.schedule.resources.forEach((resource) => {
      resource.availableUntil = "2026-10-21T12:20:00Z";
    });
    tournament.schedule.resources.push({
      id: "final",
      name: "Final court",
      location: { latitude: 0, longitude: 2 },
      availableFrom: "2026-10-21T12:30:00Z",
    });
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
          resourceId: "final",
          maxKm: 500,
          targets: [{ bracket: "winners", round: 2, index: 0 }],
        },
      ],
    };
    const existingRule = structuredClone(
      tournament.stages[0].config.knockoutDraw.venueRules[0],
    );
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      request,
    );
    expect(proposal.ready).toBe(true);
    expect(
      new Set(proposal.assignments.map((item) => item.resourceId)).size,
    ).toBe(2);
    expect(proposal.draw?.venueRules[0]).toEqual(existingRule);
    expect(proposal.schedulePreview?.endsAt).toBe("2026-10-21T12:50:00.000Z");
    tournament.stages[0].config.knockoutDraw = proposal.draw;
    const scheduled = autoSchedule(
      generateStage(tournament, tournament.stages[0].id),
    );
    expect(detectConflicts(scheduled)).toEqual([]);
  });

  it("can skip availability explicitly and reports no scheduling witness", () => {
    const tournament = fixture();
    tournament.schedule.resources[0].availableUntil = "2026-10-21T12:10:00Z";
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      request,
      false,
    );
    expect(proposal.ready).toBe(true);
    expect(proposal.availabilityChecked).toBe(false);
    expect(proposal.schedulePreview).toBeUndefined();
    expect(
      proposal.assignments.every((item) => item.resourceId === "near"),
    ).toBe(true);
  });

  it("reports a missing scheduling witness rather than proven infeasibility", () => {
    const tournament = fixture();
    tournament.schedule.resources.forEach((resource) => {
      resource.availableUntil = "2026-10-21T12:10:00Z";
    });
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      request,
    );
    expect(proposal.ready).toBe(false);
    expect(proposal.exhausted).toBe(false);
    expect(proposal.issueDetails.map((issue) => issue.code)).toEqual([
      "autoVenueSchedule",
    ]);
    expect(proposal.schedulePreview).toBeUndefined();
  });

  it.each(["invalid", "participant-window"])(
    "rejects unavailable schedule %s",
    (kind) => {
      const tournament = fixture();
      if (kind === "invalid") tournament.schedule.startAt = "invalid";
      else
        tournament.participants[0].metadata.availableUntil =
          "2026-10-21T12:05:00Z";
      const before = structuredClone(tournament);
      const proposal = previewScheduledKnockoutVenues(
        tournament,
        tournament.stages[0].id,
        request,
      );
      expect(proposal.ready).toBe(false);
      expect(proposal.issueDetails.map((issue) => issue.code)).toEqual([
        "autoVenueSchedule",
      ]);
      expect(tournament).toEqual(before);
    },
  );

  it("does not require playing time for a BYE at a closed venue", () => {
    const tournament = fixture(3);
    tournament.schedule.resources[0].availableUntil = "2026-10-21T12:10:00Z";
    const initial = previewKnockoutDraw(tournament, tournament.stages[0].id);
    const byeIndex = Math.floor(
      initial.slots.findIndex((id) => id === null) / 2,
    );
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      { ...request, resourceIds: ["near"], targets: [opening(byeIndex)] },
    );
    expect(proposal.ready).toBe(true);
    expect(proposal.schedulePreview?.matchCount).toBe(2);
    expect(proposal.assignments[0].resourceId).toBe("near");
  });

  it("keeps results, referee assignments and saved times in other stages intact", () => {
    let tournament = fixture();
    const upstream = {
      ...structuredClone(tournament.stages[0]),
      id: "upstream",
      order: 0,
      participantIds: tournament.participants
        .slice(0, 2)
        .map((item) => item.id),
    };
    tournament.stages[0].order = 1;
    tournament.stages.unshift(upstream);
    tournament = generateStage(tournament, upstream.id);
    const match = tournament.matches[0];
    tournament = recordResult(tournament, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-10-21T11:00:00Z",
    });
    tournament.matches[0].scheduledAt = "2026-10-21T10:00:00Z";
    tournament.matches[0].referee = "Referee A";
    const before = structuredClone(tournament);
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[1].id,
      request,
    );
    expect(proposal.ready).toBe(true);
    expect(tournament).toEqual(before);
  });

  it("refuses an already generated target stage", () => {
    const draft = fixture();
    const tournament = generateStage(draft, draft.stages[0].id);
    const before = structuredClone(tournament);
    const proposal = previewScheduledKnockoutVenues(
      tournament,
      tournament.stages[0].id,
      request,
    );
    expect(proposal.ready).toBe(false);
    expect(proposal.issueDetails.map((issue) => issue.code)).toEqual([
      "autoVenueLocked",
    ]);
    expect(tournament).toEqual(before);
  });
});
