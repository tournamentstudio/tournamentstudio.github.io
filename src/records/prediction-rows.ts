import type { Match, Tournament } from "../domain/types";
import { formats } from "../engine/formats";
import {
  scopedMatches,
  validPlacementRanks,
  type PredictionChoices,
  type PredictionPick,
  type PredictionScope,
} from "./prediction-model";

export interface PredictionRow {
  match: Match;
  entrants: string[];
  winnerId?: string;
  automatic: boolean;
  waiting: boolean;
  placement: boolean;
  allowDraw: boolean;
  pick?: PredictionPick;
}

/** Resolve source slots from predictions only, never from recorded scores. */
export function predictionRows(
  document: Tournament,
  stageId: string,
  choices: PredictionChoices,
  scope?: PredictionScope,
): PredictionRow[] {
  const { stage, matches } = scopedMatches(document, stageId, scope);
  const format = formats.find((entry) => entry.id === stage.format)!;
  const indexed = new Map(matches.map((match) => [match.id, match]));
  const resolved = new Map<string, PredictionRow>(),
    visiting = new Set<string>();
  function resolve(matchId: string): PredictionRow {
    if (resolved.has(matchId)) return resolved.get(matchId)!;
    if (visiting.has(matchId))
      throw new Error("The prediction bracket contains a dependency cycle.");
    if (visiting.size > 1024)
      throw new Error(
        "The prediction dependency chain exceeds the supported limit.",
      );
    const match = indexed.get(matchId);
    if (!match)
      throw new Error("The prediction bracket references a missing match.");
    visiting.add(matchId);
    let waiting = false;
    const slots = match.slots.map((slot) => {
      if (!slot.source) return slot.participantId;
      const source = resolve(slot.source.matchId);
      if (!source.winnerId && !source.automatic) waiting = true;
      if (!source.winnerId) return undefined;
      if (slot.source.result === "loser")
        return source.entrants.find((entrant) => entrant !== source.winnerId);
      return (slot.source.position ?? 0) === 0 ? source.winnerId : undefined;
    });
    const entrants = slots.filter((entrant): entrant is string =>
      Boolean(entrant),
    );
    if (new Set(entrants).size !== entrants.length)
      throw new Error("A prediction match contains duplicate entrants.");
    const placement = format.multiEntrant || match.slots.length > 2;
    const allowDraw = format.draws && document.rules.allowDraws && !placement;
    let automatic = !waiting && entrants.length < 2;
    let pick: PredictionPick | undefined;
    let winnerId = automatic ? entrants[0] : undefined;
    if (match.metadata.conditionalReset) {
      const final = resolve(String(match.metadata.conditionalReset));
      if (!final.winnerId) waiting = true;
      else if (final.winnerId === final.entrants[0]) {
        pick = { matchId, outcome: "not-played" };
        automatic = false;
      }
    }
    const chosen = choices[matchId];
    if (!waiting && !automatic && !pick) {
      if (
        placement &&
        typeof chosen === "object" &&
        chosen.outcome === "placements" &&
        validPlacementRanks(entrants, chosen.ranks)
      ) {
        pick = {
          matchId,
          outcome: "placements",
          ranks: [...chosen.ranks].sort((a, b) =>
            a.participantId.localeCompare(b.participantId),
          ),
        };
      } else if (
        !placement &&
        typeof chosen === "string" &&
        entrants.includes(chosen)
      ) {
        winnerId = chosen;
        pick = { matchId, outcome: "winner", winnerId };
      } else if (
        allowDraw &&
        typeof chosen === "object" &&
        chosen.outcome === "draw"
      )
        pick = { matchId, outcome: "draw" };
    }
    const row = {
      match,
      entrants,
      automatic,
      waiting,
      placement,
      allowDraw,
      winnerId,
      pick,
    };
    resolved.set(matchId, row);
    visiting.delete(matchId);
    return row;
  }
  return matches
    .map((match) => resolve(match.id))
    .sort(
      (a, b) =>
        a.match.round - b.match.round ||
        a.match.index - b.match.index ||
        a.match.id.localeCompare(b.match.id),
    );
}

export function choicesFromPicks(picks: PredictionPick[]): PredictionChoices {
  return Object.fromEntries(
    picks.flatMap((pick) =>
      pick.outcome === "not-played"
        ? []
        : [
            [
              pick.matchId,
              pick.outcome === "winner"
                ? pick.winnerId
                : pick.outcome === "draw"
                  ? { outcome: "draw" }
                  : { outcome: "placements", ranks: pick.ranks },
            ],
          ],
    ),
  );
}
