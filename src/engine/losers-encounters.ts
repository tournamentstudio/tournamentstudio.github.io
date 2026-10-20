import type { Stage } from "../domain/types";
import { singleElimination } from "./elimination";

/**
 * Earliest possible lower meeting for two opening-match positions.
 * Index 2 * match is a playing entrant; index 2 * match + 1 is a BYE recipient.
 * Zero means the pair cannot meet in the lower bracket.
 */
export function losersEncounterRounds(stage: Stage, size: number): Uint8Array {
  const ids = Array.from({ length: size }, (_, index) => `slot-${index}`);
  const matches = singleElimination(
    stage,
    ids,
    true,
    ids.map((participantId, index) => ({ participantId, slot: index + 1 })),
  );
  const upper = matches.filter((match) => match.bracket === "winners");
  const lower = matches.filter((match) => match.bracket === "losers");
  const incoming = new Map<string, string>();
  const next = new Map<string, string>();
  for (const match of lower)
    for (const slot of match.slots)
      if (slot.source)
        (slot.source.result === "loser" ? incoming : next).set(
          slot.source.matchId,
          match.id,
        );
  const lowerRounds = new Map(lower.map((match) => [match.id, match.round]));
  const paths = upper.map((match) => {
    const path: string[] = [];
    let current = incoming.get(match.id);
    while (current) {
      path.push(current);
      current = next.get(current);
    }
    return path;
  });
  const common = paths.map((first) =>
    paths.map((second) => {
      const shared = first.find((id) => second.includes(id));
      return shared ? lowerRounds.get(shared)! : 0;
    }),
  );
  const rounds = Math.log2(size);
  const upperByPosition = Array.from({ length: size / 2 }, (_, position) =>
    Array.from({ length: rounds }, (_, round) =>
      upper.findIndex(
        (match) =>
          match.round === round + 1 &&
          match.index === Math.floor(position / 2 ** round),
      ),
    ),
  );
  const encounters = new Uint8Array(size * size);
  for (let first = 0; first < size; first++)
    for (let second = first; second < size; second++) {
      const a = Math.floor(first / 2);
      const b = Math.floor(second / 2);
      const lca = a === b ? 1 : 2 + Math.floor(Math.log2(a ^ b));
      let earliest = 0;
      for (let lossA = 1 + (first % 2); lossA <= rounds; lossA++)
        for (let lossB = 1 + (second % 2); lossB <= rounds; lossB++) {
          // Above their shared match, only one entrant can remain undefeated.
          if (
            lossA >= lca &&
            lossB >= lca &&
            !((lossA === lca && lossB > lca) || (lossB === lca && lossA > lca))
          )
            continue;
          const round =
            common[upperByPosition[a][lossA - 1]][
              upperByPosition[b][lossB - 1]
            ];
          if (round && (!earliest || round < earliest)) earliest = round;
        }
      encounters[first * size + second] = earliest;
      encounters[second * size + first] = earliest;
    }
  return encounters;
}
