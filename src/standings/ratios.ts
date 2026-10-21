import type { Match } from "../domain/types";

type Evidence = {
  matches: number;
  sets: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  validPoints: boolean;
  fairPlay: number;
  sanctions: number;
};
export type StandingEvidence = {
  setsWon: number;
  setsLost: number;
  setRatio: number | null;
  pointRatio: number | null;
  fairPlay: number | null;
};
export function ratio(numerator: number, denominator: number) {
  if (denominator === 0) return numerator > 0 ? Infinity : 1;
  return numerator / denominator;
}
export function standingEvidence(
  matches: Match[],
  participantIds: string[],
): Map<string, StandingEvidence> {
  const rows = new Map<string, Evidence>(
    participantIds.map((id) => [
      id,
      {
        matches: 0,
        sets: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        validPoints: true,
        fairPlay: 0,
        sanctions: 0,
      } satisfies Evidence,
    ]),
  );
  for (const match of matches) {
    if (match.status !== "completed" || !match.result) continue;
    const result = match.result;
    match.slots.forEach((slot, index) => {
      const row = rows.get(slot.participantId ?? "");
      if (!row) return;
      row.matches++;
      if (result.fairPlay?.[index] !== undefined) {
        row.fairPlay += result.fairPlay[index];
        row.sanctions++;
      }
      const validSets =
        match.slots.length === 2 &&
        result.sets?.length &&
        result.sets.every(
          (set) =>
            set.length === 2 &&
            set.every((value) => value >= 0 && Number.isFinite(value)) &&
            set[0] !== set[1],
        );
      if (validSets) {
        row.sets++;
        for (const set of result.sets!) {
          const won = set[index] > set[1 - index];
          row.won += won ? 1 : 0;
          row.lost += won ? 0 : 1;
          row.pointsFor += set[index];
          row.pointsAgainst += set[1 - index];
        }
      } else {
        if (
          result.scores.length !== match.slots.length ||
          result.scores.some((score) => score < 0)
        )
          row.validPoints = false;
        row.pointsFor += result.scores[index] ?? 0;
        row.pointsAgainst += result.scores.reduce(
          (sum, value, i) => sum + (i === index ? 0 : value),
          0,
        );
      }
    });
  }
  return new Map(
    [...rows].map(([id, row]) => [
      id,
      {
        setsWon: row.won,
        setsLost: row.lost,
        setRatio:
          row.matches && row.sets === row.matches
            ? ratio(row.won, row.lost)
            : null,
        pointRatio:
          row.matches && row.validPoints
            ? ratio(row.pointsFor, row.pointsAgainst)
            : null,
        fairPlay:
          row.matches && row.sanctions === row.matches ? row.fairPlay : null,
      },
    ]),
  );
}
