import type { Tournament } from "../domain/types";
import { legScheduleSchema, type LegSchedule } from "../domain/aggregate";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import { compareSchedules } from "./adjustments";

export function bookAggregateLegs(
  input: Tournament,
  matchId: string,
  bookings: LegSchedule,
) {
  const next = structuredClone(input);
  const match = next.matches.find((m) => m.id === matchId);
  const stage = next.stages.find((s) => s.id === match?.stageId);
  const policy = stage?.config.aggregate;
  if (!match || !stage || !policy || match.result || match.status === "live")
    throw new Error("Choose an unfinished aggregate tie that is not live.");
  const parsed = legScheduleSchema
    .parse(bookings)
    .sort((a, b) => a.leg - b.leg);
  if (
    parsed.length < policy.legs ||
    parsed.length > policy.legs + (policy.tieBreak === "extra-leg" ? 1 : 0) ||
    parsed.some((b, i) => b.leg !== i + 1)
  )
    throw new Error(
      "Book every regulation leg in order and only the permitted extra leg.",
    );
  const fixed = assignedKnockoutVenue(stage, match);
  for (let index = 0; index < (match.aggregateProgress?.length ?? 0); index++) {
    const old = match.legSchedule?.find((b) => b.leg === index + 1);
    const replacement = parsed.find((b) => b.leg === index + 1);
    if (
      old &&
      (!replacement || JSON.stringify(old) !== JSON.stringify(replacement))
    )
      throw new Error("A scored aggregate leg cannot be rescheduled.");
  }
  for (const booking of parsed) {
    if (!next.schedule.resources.some((r) => r.id === booking.resourceId))
      throw new Error("Choose a venue for every aggregate leg.");
    if (fixed && booking.resourceId !== fixed)
      throw new Error("The draw fixes this match to its assigned venue.");
    const old = match.legSchedule?.find((b) => b.leg === booking.leg);
    if (
      match.aggregateProgress?.[booking.leg - 1] &&
      JSON.stringify(old) !== JSON.stringify(booking)
    )
      throw new Error("A scored aggregate leg cannot be rescheduled.");
  }
  match.legSchedule = parsed;
  match.scheduledAt = parsed[0].scheduledAt;
  match.resourceId = parsed[0].resourceId;
  return compareSchedules(input, next);
}
