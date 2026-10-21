import type { ScheduleSettings, Tournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { hasMatchEvidence } from "../engine/match-evidence";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import { reconcileRouteNetwork } from "./route-network";

export function updateScheduleSettings(
  input: Tournament,
  settings: ScheduleSettings,
): Tournament {
  if (
    settings.matchMinutes !== input.schedule.matchMinutes &&
    input.matches.some(hasMatchEvidence)
  )
    throw new Error(
      "Default match duration is locked after play starts. Review individual unfinished bookings instead.",
    );
  return validateTournament(
    reconcileRouteNetwork(input, { ...input, schedule: settings }),
  );
}

export function updateDirectBooking(
  input: Tournament,
  matchId: string,
  change: { scheduledAt?: string; resourceId?: string },
): Tournament {
  const next = structuredClone(input);
  const match = next.matches.find((item) => item.id === matchId);
  const stage = next.stages.find((item) => item.id === match?.stageId);
  if (!match || !stage || hasMatchEvidence(match))
    throw new Error("Only unplayed matches can change their saved booking.");
  if (stage.config.aggregate)
    throw new Error(
      "Edit individual aggregate legs in the leg schedule editor.",
    );
  const fixed = assignedKnockoutVenue(stage, match);
  if ("resourceId" in change && fixed && change.resourceId !== fixed)
    throw new Error("The draw fixes this match to its assigned venue.");
  Object.assign(match, change);
  return validateTournament(next);
}
