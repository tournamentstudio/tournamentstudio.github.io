import type { Tournament } from "../domain/types";
import type { EventCollection } from "./model";

export interface EventSlot {
  tournamentId: string;
  matchId: string;
  title: string;
  label: string;
  starts: number;
  ends: number;
  restEnds: number;
  venue: string;
  referee: string;
  entrants: string[];
}
export function eventSchedule(
  collection: EventCollection,
  documents: Tournament[],
): EventSlot[] {
  const index = new Map(documents.map((t) => [t.id, t]));
  const slots: EventSlot[] = [];
  for (const link of collection.competitions) {
    const tournament = index.get(link.tournamentId);
    if (!tournament) continue;
    const directory = new Map(
      link.bindings.map((b) => [b.participantId, b.directoryId]),
    );
    const matches = new Map(tournament.matches.map((m) => [m.id, m]));
    const memo = new Map<string, Set<string>>();
    const visiting = new Set<string>();
    const entrants = (id: string): Set<string> => {
      if (memo.has(id)) return memo.get(id)!;
      if (visiting.has(id))
        throw new Error("Cyclic event schedule dependency.");
      visiting.add(id);
      const ids = new Set<string>();
      for (const slot of matches.get(id)?.slots ?? []) {
        if (slot.participantId) {
          const mapped = directory.get(slot.participantId);
          if (mapped) ids.add(mapped);
        } else if (slot.source)
          for (const mapped of entrants(slot.source.matchId)) ids.add(mapped);
      }
      visiting.delete(id);
      memo.set(id, ids);
      return ids;
    };
    for (const match of tournament.matches) {
      if (!match.scheduledAt || ["bye", "canceled"].includes(match.status))
        continue;
      const starts = Date.parse(match.scheduledAt);
      if (!Number.isFinite(starts)) continue;
      const ends =
        starts +
        (match.durationMinutes ?? tournament.schedule.matchMinutes) * 60000;
      slots.push({
        tournamentId: tournament.id,
        matchId: match.id,
        title: tournament.title,
        label: match.label,
        starts,
        ends,
        restEnds: ends + tournament.schedule.restMinutes * 60000,
        venue:
          link.resources
            .find((r) => r.resourceId === match.resourceId)
            ?.sharedName.trim()
            .normalize("NFKC")
            .toLocaleLowerCase() ?? "",
        referee:
          match.referee?.trim().normalize("NFKC").toLocaleLowerCase() ?? "",
        entrants: [...entrants(match.id)],
      });
    }
  }
  return slots.sort(
    (a, b) => a.starts - b.starts || a.matchId.localeCompare(b.matchId),
  );
}
export function eventConflicts(slots: EventSlot[]) {
  const sorted = [...slots].sort((a, b) => a.starts - b.starts);
  const conflicts: {
    left: EventSlot;
    right: EventSlot;
    reasons: ("venue" | "referee" | "entrant-rest")[];
  }[] = [];
  const active = new Map<string, EventSlot[]>();
  for (const right of sorted) {
    for (const [tournamentId, previous] of active) {
      if (tournamentId === right.tournamentId) continue;
      const candidates = previous.filter((s) => s.restEnds > right.starts);
      active.set(tournamentId, candidates);
      for (const left of candidates) {
        const reasons: ("venue" | "referee" | "entrant-rest")[] = [];
        if (left.ends > right.starts) {
          if (left.venue && left.venue === right.venue) reasons.push("venue");
          if (left.referee && left.referee === right.referee)
            reasons.push("referee");
        }
        if (left.entrants.some((id) => right.entrants.includes(id)))
          reasons.push("entrant-rest");
        if (reasons.length) conflicts.push({ left, right, reasons });
        if (conflicts.length >= 1000) return conflicts;
      }
    }
    if (!active.has(right.tournamentId)) active.set(right.tournamentId, []);
    active.get(right.tournamentId)!.push(right);
  }
  return conflicts;
}
