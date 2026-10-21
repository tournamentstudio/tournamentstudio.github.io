import type { Match, Stage, Tournament } from "../domain/types";
import {
  ladderPolicy,
  readInvitations,
  saveInvitations,
} from "../domain/ladder";
import { entrant, newMatch, terminal } from "./formats";

export function ladderOrder(tournament: Tournament, stage: Stage): string[] {
  const order = [
    ...((stage.metadata.drawOrder ?? stage.participantIds) as string[]),
  ];
  const mode = ladderPolicy(stage).mode;
  for (const match of tournament.matches
    .filter((entry) => entry.stageId === stage.id)
    .sort((a, b) => a.round - b.round || a.index - b.index)) {
    if (match.status !== "completed" || !match.result) continue;
    const winner = match.result.winnerIds[0];
    const loser = match.slots.find(
      (slot) => slot.participantId && slot.participantId !== winner,
    )?.participantId;
    if (!loser || !order.includes(winner) || !order.includes(loser)) continue;
    if (mode === "king-of-hill") {
      const remaining = order.filter((id) => id !== winner && id !== loser);
      order.splice(0, order.length, winner, ...remaining, loser);
    } else if (order.indexOf(winner) > order.indexOf(loser)) {
      const first = order.indexOf(winner),
        second = order.indexOf(loser);
      [order[first], order[second]] = [order[second], order[first]];
    }
  }
  return order;
}
export function activeHillQueue(
  tournament: Tournament,
  stage: Stage,
): string[] {
  return ladderOrder(tournament, stage).filter(
    (id) =>
      tournament.participants.find((participant) => participant.id === id)
        ?.status === "active",
  );
}
export function hillRound(
  tournament: Tournament,
  stage: Stage,
  round: number,
): Match[] {
  const queue = activeHillQueue(tournament, stage);
  if (queue.length < 2)
    throw new Error(
      "King of the Hill needs two active entrants. Restore eligibility or close the stage.",
    );
  return [
    newMatch(stage, round, 0, [entrant(queue[0]), entrant(queue[1])], {
      metadata: { ladderChallenge: true, hillChallenge: true },
    }),
  ];
}
export function refreshLadderState(
  tournament: Tournament,
  stage: Stage,
  matches: Match[],
): boolean {
  const mode = ladderPolicy(stage).mode;
  stage.metadata.ladderOrder = ladderOrder(tournament, stage);
  const played = matches.filter((match) => match.status === "completed").length;
  const completed =
    played > 0 &&
    matches.every(terminal) &&
    (stage.metadata.challengeClosed === true || played >= stage.config.rounds);
  if (mode === "invitations") {
    saveInvitations(
      stage,
      readInvitations(stage).map((entry) => {
        if (!entry.matchId)
          return completed && ["pending", "invalidated"].includes(entry.status)
            ? { ...entry, status: "canceled" as const }
            : entry;
        const match = matches.find((item) => item.id === entry.matchId);
        if (!match) {
          const next = { ...entry, status: "invalidated" as const };
          delete next.matchId;
          return next;
        }
        if (match.status === "completed")
          return { ...entry, status: "resolved" as const };
        if (match.status === "canceled")
          return { ...entry, status: "canceled" as const };
        return { ...entry, status: "approved" as const };
      }),
    );
  }
  if (mode === "adjacent")
    return (
      matches.length > 0 &&
      matches.every(terminal) &&
      Math.max(...matches.map((match) => match.round)) >= stage.config.rounds
    );
  return completed;
}
