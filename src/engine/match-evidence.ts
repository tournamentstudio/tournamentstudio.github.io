import type { Match } from "../domain/types";
import { timingSchema } from "../timing/model";

/** A paused operating status does not erase evidence that play has started. */
export function hasMatchEvidence(match: Match): boolean {
  if (match.status === "bye") return false;
  if (
    match.result ||
    ["live", "contested"].includes(match.status) ||
    match.aggregateProgress?.length ||
    match.hands?.length ||
    match.liveScores?.some((score) => score !== 0) ||
    match.golState?.elapsedMs ||
    match.golState?.runningSince ||
    match.golState?.period ||
    match.private?.concealedPosition
  )
    return true;
  if (match.metadata.timing !== undefined) {
    const timers = timingSchema.safeParse(match.metadata.timing);
    if (!timers.success) return true;
    return Object.values(timers.data).some(
      (run) =>
        run.elapsedMs > 0 ||
        run.startedAt !== null ||
        run.splits.length > 0 ||
        !!run.evidence ||
        run.review !== "pending",
    );
  }
  return false;
}
