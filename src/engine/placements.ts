import type { Match, Slot, Stage } from "../domain/types";
import { loser, newMatch, winner } from "./formats";

/** Each elimination cohort plays a classification tree; empty slots remain real byes. */
function classifyCohorts(
  stage: Stage,
  cohorts: { slots: Slot[]; firstPlace: number; round: number }[],
): Match[] {
  const matches: Match[] = [];
  const indices = new Map<number, number>();
  function classify(slots: Slot[], firstPlace: number, round: number) {
    if (slots.length < 2) return;
    const current: Match[] = [];
    for (let index = 0; index < slots.length; index += 2) {
      const matchIndex = indices.get(round) ?? 0;
      indices.set(round, matchIndex + 1);
      const match = newMatch(
        stage,
        round,
        matchIndex,
        slots.slice(index, index + 2),
        {
          bracket: "placement",
          label:
            slots.length === 2 && firstPlace === 3
              ? "Third place"
              : `Places ${firstPlace}-${firstPlace + slots.length - 1}`,
          metadata: {
            placementStart: firstPlace,
            placementEnd: firstPlace + slots.length - 1,
          },
        },
      );
      current.push(match);
      matches.push(match);
    }
    if (current.length > 1) {
      classify(
        current.map((match) => winner(match.id)),
        firstPlace,
        round + 1,
      );
      classify(
        current.map((match) => loser(match.id)),
        firstPlace + slots.length / 2,
        round + 1,
      );
    }
  }
  for (const cohort of cohorts)
    classify(cohort.slots, cohort.firstPlace, cohort.round);
  return matches;
}

export function classificationMatches(
  stage: Stage,
  winnersRounds: Match[][],
): Match[] {
  return classifyCohorts(
    stage,
    winnersRounds
      .slice(0, -1)
      .map((cohort, index) => ({
        slots: cohort.map((match) => loser(match.id)),
        firstPlace: cohort.length + 1,
        round: index + 2,
      }))
      .reverse(),
  );
}

/** Second-loss cohorts determine lower places without altering championship drop paths. */
export function doubleClassificationMatches(
  stage: Stage,
  matches: Match[],
): Match[] {
  const rounds = [
    ...new Set(
      matches
        .filter((match) => match.bracket === "losers")
        .map((match) => match.round),
    ),
  ].sort((a, b) => b - a);
  let firstPlace = 3;
  const cohorts: { slots: Slot[]; firstPlace: number; round: number }[] = [];
  for (const round of rounds) {
    const cohort = matches
      .filter((match) => match.bracket === "losers" && match.round === round)
      .sort((a, b) => a.index - b.index);
    if (cohort.length === 1) cohort[0].metadata.placementLossRank = firstPlace;
    else
      cohorts.push({
        slots: cohort.map((match) => loser(match.id)),
        firstPlace,
        round: round + 1,
      });
    firstPlace += cohort.length;
  }
  return classifyCohorts(stage, cohorts);
}

/** Nominal positions are compacted so irregular fields never leave rank gaps. */
export function completedPlacementOrder(matches: Match[]): string[] {
  const positions = new Map<string, number>();
  const final =
    matches.find(
      (match) => match.bracket === "reset" && match.status === "completed",
    ) ??
    matches.find(
      (match) =>
        match.bracket === "final" &&
        ["completed", "bye"].includes(match.status),
    ) ??
    matches.find(
      (match) =>
        match.metadata.championship &&
        ["completed", "bye"].includes(match.status),
    );
  for (const match of matches) {
    if (!["completed", "bye"].includes(match.status) || !match.result) continue;
    if (typeof match.metadata.placementLossRank === "number") {
      const eliminated = match.slots.find(
        (slot) =>
          slot.participantId &&
          !match.result!.winnerIds.includes(slot.participantId),
      );
      if (eliminated?.participantId)
        positions.set(
          eliminated.participantId,
          match.metadata.placementLossRank,
        );
    }
    const start = match === final ? 1 : match.metadata.placementStart;
    const end = match === final ? 2 : match.metadata.placementEnd;
    if (typeof start !== "number" || end !== start + 1) continue;
    for (const slot of match.slots) {
      if (slot.participantId)
        positions.set(
          slot.participantId,
          start + Number(!match.result.winnerIds.includes(slot.participantId)),
        );
    }
  }
  return [...positions]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}
