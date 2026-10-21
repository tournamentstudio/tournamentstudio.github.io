import type { Tournament, KnockoutDrawPreview } from "../domain/types";
import type { AutomaticVenueRequest } from "../engine/automatic-venues";
import { previewKnockoutDraw } from "../engine/knockout-draw";
import { previewScheduledKnockoutVenues } from "../scheduling/automatic-venues";

export type DrawTask =
  | { kind: "knockout"; tournament: Tournament; stageId: string }
  | {
      kind: "automatic-venues";
      tournament: Tournament;
      stageId: string;
      request: AutomaticVenueRequest;
      checkAvailability: boolean;
    };
export interface DrawTaskResults {
  knockout: KnockoutDrawPreview;
  "automatic-venues": ReturnType<typeof previewScheduledKnockoutVenues>;
}

/** The same bounded, deterministic engine is used in the worker and fallback. */
export function performDrawTask<K extends DrawTask["kind"]>(
  task: Extract<DrawTask, { kind: K }>,
): DrawTaskResults[K] {
  const input: DrawTask = task;
  const result =
    input.kind === "knockout"
      ? previewKnockoutDraw(input.tournament, input.stageId)
      : previewScheduledKnockoutVenues(
          input.tournament,
          input.stageId,
          input.request,
          input.checkAvailability,
        );
  return result as DrawTaskResults[K];
}
