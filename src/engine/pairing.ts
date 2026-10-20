import type { Match, Stage, Tournament } from "../domain/types";
import { getStandings } from "../standings";
import { entrant, newMatch } from "./formats";

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingError";
  }
}

function pairKey(first: string, second: string) {
  return [first, second].sort().join("\u0000");
}

export function swissRound(
  tournament: Tournament,
  stage: Stage,
  round: number,
): Match[] {
  const history = tournament.matches.filter(
    (match) => match.stageId === stage.id,
  );
  const previousPairs = new Set(
    history
      .filter(
        (match) =>
          match.slots.length === 2 &&
          match.slots.every((slot) => slot.participantId),
      )
      .map((match) =>
        pairKey(match.slots[0].participantId!, match.slots[1].participantId!),
      ),
  );
  const byes = new Set(
    history
      .filter((match) => match.status === "bye")
      .flatMap((match) => match.result?.winnerIds ?? []),
  );
  const active = new Set(
    tournament.participants
      .filter((participant) => participant.status === "active")
      .map((participant) => participant.id),
  );
  const standings = getStandings(tournament, stage.id).filter((row) =>
    active.has(row.participantId),
  );
  if (standings.length < 2)
    throw new PairingError(
      "Swiss pairing needs at least two active participants.",
    );
  const scores = new Map(
    standings.map((row) => [row.participantId, row.points]),
  );
  const ordered = standings.map((row) => row.participantId);
  const byeOptions =
    ordered.length % 2
      ? [...ordered].reverse().filter((id) => !byes.has(id))
      : [undefined];
  if (!byeOptions.length)
    throw new PairingError(
      "Every active entrant has already received a bye. Reduce the round count or explicitly allow repeated byes.",
    );
  const restrictions = Array.isArray(stage.config.forbiddenPairs)
    ? stage.config.forbiddenPairs
        .filter(Array.isArray)
        .map((pair) => pairKey(String(pair[0]), String(pair[1])))
    : [];
  const forbidden = new Set(restrictions);
  const maxVisits = 150000;
  let visits = 0;
  const find = (remaining: string[]): [string, string][] | undefined => {
    if (!remaining.length) return [];
    if (++visits > maxVisits) return undefined;
    const first = remaining[0];
    const candidates = remaining
      .slice(1)
      .filter(
        (id) =>
          !previousPairs.has(pairKey(first, id)) &&
          !forbidden.has(pairKey(first, id)),
      )
      .sort(
        (a, b) =>
          Math.abs(scores.get(first)! - scores.get(a)!) -
            Math.abs(scores.get(first)! - scores.get(b)!) ||
          remaining.indexOf(a) - remaining.indexOf(b),
      );
    for (const second of candidates) {
      const rest = remaining.filter((id) => id !== first && id !== second);
      if (
        rest.some(
          (id) =>
            !rest.some(
              (other) =>
                id !== other &&
                !previousPairs.has(pairKey(id, other)) &&
                !forbidden.has(pairKey(id, other)),
            ),
        )
      )
        continue;
      const tail = find(rest);
      if (tail) return [[first, second], ...tail];
    }
    return undefined;
  };
  for (const bye of byeOptions) {
    const pairs = find(ordered.filter((id) => id !== bye));
    if (!pairs) continue;
    const matches = pairs.map((pair, index) =>
      newMatch(
        stage,
        round,
        index,
        (round % 2 ? pair : [...pair].reverse()).map(entrant),
      ),
    );
    if (bye)
      matches.push(
        newMatch(stage, round, matches.length, [entrant(bye), entrant()], {
          metadata: { pairingBye: true },
        }),
      );
    return matches;
  }
  throw new PairingError(
    visits > maxVisits
      ? "The pairing search reached its safety limit. Reduce restrictions, reduce the field, or end the stage at its current round."
      : "No pairing avoids all rematches and restrictions. Remove a restriction or finish the stage at its current round.",
  );
}

/** Progressive three-loss policy: pair by loss count, then prior meetings. */
export function tripleRound(
  tournament: Tournament,
  stage: Stage,
  round: number,
): Match[] {
  const history = tournament.matches.filter(
    (match) => match.stageId === stage.id,
  );
  const losses = new Map(stage.participantIds.map((id) => [id, 0]));
  const byes = new Map(stage.participantIds.map((id) => [id, 0]));
  const meetings = new Map<string, number>();
  for (const match of history) {
    if (match.status === "bye") {
      for (const id of match.result?.winnerIds ?? [])
        byes.set(id, (byes.get(id) ?? 0) + 1);
    }
    if (match.status !== "completed" || !match.result) continue;
    for (const slot of match.slots)
      if (
        slot.participantId &&
        !match.result.winnerIds.includes(slot.participantId)
      )
        losses.set(
          slot.participantId,
          (losses.get(slot.participantId) ?? 0) + 1,
        );
    if (match.slots[0].participantId && match.slots[1].participantId) {
      const key = pairKey(
        match.slots[0].participantId,
        match.slots[1].participantId,
      );
      meetings.set(key, (meetings.get(key) ?? 0) + 1);
    }
  }
  const seeds = new Map(
    tournament.participants.map((participant) => [
      participant.id,
      participant.seed,
    ]),
  );
  const ids = stage.participantIds
    .filter(
      (id) =>
        losses.get(id)! < 3 &&
        tournament.participants.find((participant) => participant.id === id)
          ?.status === "active",
    )
    .sort(
      (a, b) =>
        losses.get(a)! - losses.get(b)! ||
        seeds.get(a)! - seeds.get(b)! ||
        a.localeCompare(b),
    );
  if (ids.length < 2) return [];
  let bye: string | undefined;
  if (ids.length % 2) {
    bye = [...ids].sort(
      (a, b) =>
        byes.get(a)! - byes.get(b)! ||
        losses.get(b)! - losses.get(a)! ||
        seeds.get(b)! - seeds.get(a)!,
    )[0];
    ids.splice(ids.indexOf(bye), 1);
  }
  const result: Match[] = [];
  while (ids.length) {
    const first = ids.shift()!;
    const second = [...ids].sort(
      (a, b) =>
        Math.abs(losses.get(first)! - losses.get(a)!) -
          Math.abs(losses.get(first)! - losses.get(b)!) ||
        (meetings.get(pairKey(first, a)) ?? 0) -
          (meetings.get(pairKey(first, b)) ?? 0) ||
        seeds.get(a)! - seeds.get(b)!,
    )[0];
    ids.splice(ids.indexOf(second), 1);
    result.push(
      newMatch(stage, round, result.length, [entrant(first), entrant(second)]),
    );
  }
  if (bye)
    result.push(
      newMatch(stage, round, result.length, [entrant(bye), entrant()], {
        metadata: { pairingBye: true },
      }),
    );
  return result;
}

export function ladderRound(stage: Stage, round: number): Match[] {
  const ids = (stage.metadata.ladderOrder ?? stage.participantIds) as string[];
  const result: Match[] = [];
  const offset = ids.length > 2 && round % 2 === 0 ? 1 : 0;
  for (let index = offset; index < ids.length - 1; index += 2) {
    result.push(
      newMatch(
        stage,
        round,
        result.length,
        [entrant(ids[index]), entrant(ids[index + 1])],
        { metadata: { ladderChallenge: true } },
      ),
    );
  }
  return result;
}
