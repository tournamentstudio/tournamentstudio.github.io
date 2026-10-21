import type { Match, Tournament } from "../domain/types";
import { playerEventMatchIds } from "../players/model";
import { recoveredMatches } from "../domain/validate";
import { timingSchema } from "../timing/model";

/** Recovery entries include untouched descendants, so inspect each saved match. */
function recoveredMatchEvidence(tournament: Tournament): Set<string> {
  const recovered = new Set<string>();
  const currentIds = new Set(tournament.matches.map((match) => match.id));
  for (const match of recoveredMatches(tournament))
    if (currentIds.has(match.id) && hasMatchEvidence(match))
      recovered.add(match.id);
  return recovered;
}

export function tournamentMatchEvidence(
  tournament: Tournament,
): (match: Match) => boolean {
  const events = new Set(playerEventMatchIds(tournament));
  const recovered = recoveredMatchEvidence(tournament);
  return (match) =>
    hasMatchEvidence(match) || events.has(match.id) || recovered.has(match.id);
}

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
