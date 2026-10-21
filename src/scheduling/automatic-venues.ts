import type { Tournament } from "../domain/types";
import { generateStage } from "../engine";
import {
  previewAutomaticKnockoutVenues,
  type AutomaticVenuePreview,
  type AutomaticVenueRequest,
} from "../engine/automatic-venues";
import { autoSchedule } from "./index";

export interface ScheduledVenuePreview extends AutomaticVenuePreview {
  availabilityChecked: boolean;
  schedulePreview?: {
    matchCount: number;
    startsAt: string;
    endsAt: string;
  };
}

/** Find a scheduling witness on a disposable copy, without reserving any time. */
export function previewScheduledKnockoutVenues(
  tournament: Tournament,
  stageId: string,
  request: AutomaticVenueRequest,
  checkAvailability = true,
): ScheduledVenuePreview {
  let schedulePreview: ScheduledVenuePreview["schedulePreview"];
  const proposal = previewAutomaticKnockoutVenues(
    tournament,
    stageId,
    request,
    {
      ...(checkAvailability
        ? {
            accept(draw) {
              try {
                const draft = structuredClone(tournament);
                draft.stages.find(
                  (stage) => stage.id === stageId,
                )!.config.knockoutDraw = draw;
                const scheduled = autoSchedule(generateStage(draft, stageId));
                const matches = scheduled.matches.filter(
                  (match) => match.stageId === stageId && match.scheduledAt,
                );
                if (!matches.length) return false;
                schedulePreview = {
                  matchCount: matches.length,
                  startsAt: new Date(
                    Math.min(
                      ...matches.map((match) => Date.parse(match.scheduledAt!)),
                    ),
                  ).toISOString(),
                  endsAt: new Date(
                    Math.max(
                      ...matches.map(
                        (match) =>
                          Date.parse(match.scheduledAt!) +
                          (match.durationMinutes ??
                            scheduled.schedule.matchMinutes) *
                            60000,
                      ),
                    ),
                  ).toISOString(),
                };
                return true;
              } catch {
                return false;
              }
            },
          }
        : {}),
    },
  );
  return {
    ...proposal,
    availabilityChecked: checkAvailability,
    ...(proposal.ready && schedulePreview ? { schedulePreview } : {}),
  };
}
