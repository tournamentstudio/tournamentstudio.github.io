import type { Tournament } from "../domain/types";
import { getStandings } from "../standings";
import { validateCollection, type EventCollection } from "./model";

export interface EventStanding {
  directoryId: string;
  name: string;
  points: number;
  starts: number;
  wins: number;
  rank: number;
  tied: boolean;
  adjustment: number;
  contributions: { tournamentId: string; rank: number; points: number }[];
}

/** Tied positions share the mean award for the occupied places. */
export function aggregateRankings(
  input: EventCollection,
  documents: Tournament[],
  divisionId: string,
): { rows: EventStanding[]; pending: string[] } {
  const collection = validateCollection(input);
  const index = new Map(documents.map((t) => [t.id, t]));
  const assigned = new Set(
    collection.competitions.flatMap((c) =>
      c.bindings.map((b) => b.directoryId),
    ),
  );
  for (const adjustment of collection.adjustments)
    assigned.add(adjustment.directoryId);
  const rows = new Map(
    collection.directory
      .filter((p) => p.divisionId === divisionId && assigned.has(p.id))
      .map((p) => [
        p.id,
        {
          directoryId: p.id,
          name: p.name,
          points: 0,
          starts: 0,
          wins: 0,
          rank: 0,
          tied: false,
          adjustment: 0,
          contributions: [],
        } as EventStanding,
      ]),
  );
  const pending: string[] = [];
  for (const link of collection.competitions.filter(
    (c) => c.divisionId === divisionId,
  )) {
    const tournament = index.get(link.tournamentId);
    const stage = tournament?.stages.find((s) => s.id === link.stageId);
    if (!tournament || !stage || stage.status !== "completed") {
      pending.push(link.tournamentId);
      continue;
    }
    // Group positions are not a final event ranking. Choose a playoff/final stage.
    if (stage.format === "groups" || stage.format === "gsl") {
      pending.push(link.tournamentId);
      continue;
    }
    const standings = getStandings(tournament, stage.id);
    const ties = new Map<number, number>();
    for (const standing of standings)
      ties.set(standing.rank, (ties.get(standing.rank) ?? 0) + 1);
    for (const standing of standings) {
      const binding = link.bindings.find(
        (b) => b.participantId === standing.participantId,
      );
      const row = binding && rows.get(binding.directoryId);
      if (!row) continue;
      const count = ties.get(standing.rank)!;
      let award = 0;
      for (let offset = 0; offset < count; offset++)
        award += collection.placementPoints[standing.rank - 1 + offset] ?? 0;
      const points = (award / count) * link.weight;
      row.starts++;
      row.points += points;
      if (standing.rank === 1 && count === 1) row.wins++;
      row.contributions.push({
        tournamentId: tournament.id,
        rank: standing.rank,
        points,
      });
    }
  }
  for (const change of collection.adjustments) {
    const row = rows.get(change.directoryId);
    if (row) {
      row.adjustment += change.points;
      row.points += change.points;
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || a.directoryId.localeCompare(b.directoryId),
  );
  let previous: EventStanding | undefined;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    row.rank =
      previous && Math.abs(previous.points - row.points) < 1e-9
        ? previous.rank
        : i + 1;
    if (previous && row.rank === previous.rank) {
      previous.tied = true;
      row.tied = true;
    }
    previous = row;
  }
  return { rows: sorted, pending };
}

export function seasonMovement(
  collection: EventCollection,
  documents: Tournament[],
  divisionId: string,
) {
  const division = collection.divisions.find((d) => d.id === divisionId);
  if (!division) throw new Error("Division not found.");
  const { rows, pending } = aggregateRankings(
    collection,
    documents,
    divisionId,
  );
  if (pending.length)
    throw new Error(
      "Complete every linked final stage before planning promotion or relegation.",
    );
  if (division.promote + division.relegate > rows.length)
    throw new Error("Promotion and relegation places overlap.");
  const cutoffs = [division.promote, rows.length - division.relegate].filter(
    (n) => n > 0 && n < rows.length,
  );
  if (cutoffs.some((n) => rows[n - 1].rank === rows[n].rank))
    throw new Error(
      "A tied ranking crosses a promotion or relegation cutoff. Resolve it with an explicit points adjustment and reason.",
    );
  return {
    promote: rows.slice(0, division.promote).map((r) => r.directoryId),
    relegate: division.relegate
      ? rows.slice(-division.relegate).map((r) => r.directoryId)
      : [],
  };
}
