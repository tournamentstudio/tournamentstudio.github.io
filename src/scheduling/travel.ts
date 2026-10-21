import type { Tournament } from "../domain/types";
import { hasMatchEvidence } from "../engine/match-evidence";
import { greatCircleDistanceKm } from "../engine/geographic-distance";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import { validateTournament } from "../domain/validate";
import { detectConflicts } from "./index";
import { legCount } from "./legs";

export interface TravelAssumptions {
  routeFactor: number;
  speedKmh: number;
  costPerKm: number;
}
export interface TravelAssignment {
  matchId: string;
  resourceId: string;
  km: number;
  minutes: number;
  cost: number;
}
export interface TravelPlan {
  tournament: Tournament;
  assignments: TravelAssignment[];
  explored: number;
  optimal: boolean;
  totalKm: number;
  totalMinutes: number;
  totalCost: number;
  conflicts: string[];
}
export function planTravel(
  input: Tournament,
  matchIds: string[],
  assumptions: TravelAssumptions,
  maxNodes = 50000,
): TravelPlan {
  const { routeFactor, speedKmh, costPerKm } = assumptions;
  if (
    ![routeFactor, speedKmh, costPerKm].every(Number.isFinite) ||
    routeFactor < 1 ||
    routeFactor > 5 ||
    speedKmh < 1 ||
    speedKmh > 1000 ||
    costPerKm < 0 ||
    costPerKm > 10000
  )
    throw new Error(
      "Use a route factor from 1 to 5, speed from 1 to 1000 and cost from 0 to 10000.",
    );
  if (
    !matchIds.length ||
    matchIds.length > 12 ||
    new Set(matchIds).size !== matchIds.length
  )
    throw new Error(
      "Select between 1 and 12 distinct matches for travel planning.",
    );
  const selected = new Set(matchIds);
  const entries = matchIds
    .map((id) => {
      const match = input.matches.find((m) => m.id === id);
      if (match && legCount(input, match) > 1)
        throw new Error(
          "Edit individual aggregate legs in the leg schedule editor.",
        );
      if (
        !match?.scheduledAt ||
        hasMatchEvidence(match) ||
        ["bye", "canceled"].includes(match.status) ||
        match.slots.some((s) => !s.participantId)
      )
        throw new Error(
          "Travel planning needs scheduled unplayed matches with confirmed entrants.",
        );
      const entrants = match.slots.map((s) =>
        input.participants.find((p) => p.id === s.participantId)!,
      );
      if (entrants.some((p) => !p.location))
        throw new Error(
          "Add coordinates for every entrant in the selected matches.",
        );
      const at = Date.parse(match.scheduledAt);
      const end =
        at + (match.durationMinutes ?? input.schedule.matchMinutes) * 60000;
      const stage = input.stages.find((s) => s.id === match.stageId)!;
      const fixed = assignedKnockoutVenue(stage, match);
      const options = input.schedule.resources
        .filter(
          (r) =>
            r.location &&
            (!fixed || r.id === fixed) &&
            (!r.availableFrom || at >= Date.parse(r.availableFrom)) &&
            (!r.availableUntil || end <= Date.parse(r.availableUntil)),
        )
        .filter(
          (r) =>
            !input.matches.some(
              (m) =>
                !selected.has(m.id) &&
                m.scheduledAt &&
                m.resourceId === r.id &&
                !["bye", "canceled"].includes(m.status) &&
                at <
                  Date.parse(m.scheduledAt) +
                    (m.durationMinutes ?? input.schedule.matchMinutes) *
                      60000 &&
                Date.parse(m.scheduledAt) < end,
            ),
        )
        .map((r) => ({
          resourceId: r.id,
          km: entrants.reduce(
            (sum, p) =>
              sum +
              greatCircleDistanceKm(p.location!, r.location!) * routeFactor,
            0,
          ),
        }))
        .sort(
          (a, b) => a.km - b.km || a.resourceId.localeCompare(b.resourceId),
        );
      if (!options.length)
        throw new Error("No located available venue can fit a selected match.");
      return { match, at, end, options };
    })
    .sort(
      (a, b) =>
        a.options.length - b.options.length ||
        a.at - b.at ||
        a.match.id.localeCompare(b.match.id),
    );
  let bestCost = Infinity;
  let best: TravelAssignment[] | undefined;
  let explored = 0;
  let limited = false;
  const chosen: TravelAssignment[] = [];
  const lowerBounds = Array.from({ length: entries.length + 1 }, () => 0);
  for (let i = entries.length - 1; i >= 0; i--)
    lowerBounds[i] = lowerBounds[i + 1] + entries[i].options[0].km;
  function visit(index: number, cost: number) {
    if (explored >= maxNodes) {
      limited = true;
      return;
    }
    explored++;
    if (cost + lowerBounds[index] >= bestCost - 1e-9) return;
    if (index === entries.length) {
      bestCost = cost;
      best = structuredClone(chosen);
      return;
    }
    const entry = entries[index];
    for (const option of entry.options) {
      if (
        chosen.some(
          (prior, i) =>
            prior.resourceId === option.resourceId &&
            entry.at < entries[i].end &&
            entries[i].at < entry.end,
        )
      )
        continue;
      chosen.push({
        matchId: entry.match.id,
        resourceId: option.resourceId,
        km: option.km,
        minutes: (option.km / speedKmh) * 60,
        cost: option.km * costPerKm,
      });
      visit(index + 1, cost + option.km);
      chosen.pop();
      if (limited) break;
    }
  }
  visit(0, 0);
  if (!best)
    throw new Error(
      limited
        ? "Travel search reached its limit before finding a valid assignment. Select fewer matches."
        : "No venue assignment can avoid overlap for these matches.",
    );
  const assignments = best as TravelAssignment[];
  const tournament = structuredClone(input);
  for (const choice of assignments)
    tournament.matches.find((m) => m.id === choice.matchId)!.resourceId =
      choice.resourceId;
  return {
    tournament: validateTournament(tournament),
    assignments,
    explored,
    optimal: !limited,
    totalKm: bestCost,
    totalMinutes: assignments.reduce((n, a) => n + a.minutes, 0),
    totalCost: assignments.reduce((n, a) => n + a.cost, 0),
    conflicts: detectConflicts(tournament),
  };
}
