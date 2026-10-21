import type { Tournament } from "../domain/types";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { canonicalize } from "../security/codec";
import { compareRevisions } from "../sharing/history-diff";
import { playerEventMatchIds } from "../players/model";

export function restorationImpact(current: Tournament, target: Tournament) {
  const changes = compareRevisions(current, target, true);
  const structural =
    canonicalize(current.rules) !== canonicalize(target.rules) ||
    canonicalize(current.stages) !== canonicalize(target.stages);
  const hasEvidence = tournamentMatchEvidence(current);
  const playerMatches = new Set(playerEventMatchIds(current));
  const playerRecordsChanged =
    canonicalize(current.metadata.playerStatistics ?? null) !==
    canonicalize(target.metadata.playerStatistics ?? null);
  const affected = current.matches.filter((match) => {
    if (!hasEvidence(match)) return false;
    if (playerRecordsChanged && playerMatches.has(match.id)) return true;
    const old = target.matches.find((entry) => entry.id === match.id);
    if (!old || structural) return true;
    const competitionState = (entry: typeof match) => ({
      result: entry.result ?? null,
      slots: entry.slots,
      status: entry.status,
      liveScores: entry.liveScores ?? null,
      aggregateProgress: entry.aggregateProgress ?? null,
      hands: entry.hands ?? [],
      golState: entry.golState ?? null,
      concealedPosition: entry.private?.concealedPosition ?? null,
      timing: entry.metadata.timing ?? null,
    });
    return (
      canonicalize(competitionState(match)) !==
      canonicalize(competitionState(old))
    );
  });
  return { changes, affected };
}
