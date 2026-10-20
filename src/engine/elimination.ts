import type { Match, Stage } from "../domain/types";
import { entrant, loser, newMatch, winner } from "./formats";
import { seedPositions } from "./random";

export function singleElimination(
  stage: Stage,
  ids: string[],
  double = false,
): Match[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, ids.length)));
  const seeded = seedPositions(size).map((seed) => ids[seed - 1]);
  const rounds: Match[][] = [];
  let current: Match[] = [];
  for (let i = 0; i < size / 2; i++)
    current.push(
      newMatch(stage, 1, i, seeded.slice(i * 2, i * 2 + 2).map(entrant), {
        bracket: "winners",
      }),
    );
  rounds.push(current);
  while (current.length > 1) {
    const next: Match[] = [];
    for (let i = 0; i < current.length / 2; i++)
      next.push(
        newMatch(
          stage,
          rounds.length + 1,
          i,
          [winner(current[i * 2].id), winner(current[i * 2 + 1].id)],
          { bracket: "winners" },
        ),
      );
    current = next;
    rounds.push(current);
  }
  const matches = rounds.flat();
  const final = rounds.at(-1)![0];
  if (!double) {
    final.metadata.championship = true;
    if (stage.config.thirdPlace && rounds.length > 1) {
      const semifinals = rounds.at(-2)!;
      matches.push(
        newMatch(
          stage,
          rounds.length,
          0,
          semifinals.map((match) => loser(match.id)),
          { bracket: "placement", label: "Third place" },
        ),
      );
    }
    return matches;
  }
  let lower: Match[] = [];
  if (size > 2) {
    for (let i = 0; i < rounds[0].length / 2; i++) {
      lower.push(
        newMatch(
          stage,
          1,
          i,
          [loser(rounds[0][i * 2].id), loser(rounds[0][i * 2 + 1].id)],
          { bracket: "losers" },
        ),
      );
    }
    matches.push(...lower);
    for (let upperRound = 1; upperRound < rounds.length; upperRound++) {
      const dropped = rounds[upperRound];
      const incoming = lower.map((match, index) =>
        newMatch(
          stage,
          upperRound * 2,
          index,
          [winner(match.id), loser(dropped[dropped.length - 1 - index].id)],
          { bracket: "losers" },
        ),
      );
      matches.push(...incoming);
      lower = incoming;
      if (lower.length > 1) {
        const reduced: Match[] = [];
        for (let i = 0; i < lower.length / 2; i++)
          reduced.push(
            newMatch(
              stage,
              upperRound * 2 + 1,
              i,
              [winner(lower[i * 2].id), winner(lower[i * 2 + 1].id)],
              { bracket: "losers" },
            ),
          );
        matches.push(...reduced);
        lower = reduced;
      }
    }
  }
  const grandFinal = newMatch(
    stage,
    rounds.length * 2,
    0,
    [winner(final.id), size === 2 ? loser(final.id) : winner(lower[0].id)],
    {
      bracket: "final",
      label: "Grand final",
      metadata: { championship: !stage.config.grandFinalReset },
    },
  );
  matches.push(grandFinal);
  if (stage.config.grandFinalReset)
    matches.push(
      newMatch(
        stage,
        rounds.length * 2 + 1,
        0,
        [winner(grandFinal.id), loser(grandFinal.id)],
        {
          bracket: "reset",
          label: "Grand final reset",
          metadata: {
            championship: true,
            conditionalReset: grandFinal.id,
            undefeatedFinalist: final.id,
          },
        },
      ),
    );
  return matches;
}

export function gauntlet(stage: Stage, ids: string[]): Match[] {
  const reversed = [...ids].reverse();
  const result = [newMatch(stage, 1, 0, reversed.slice(0, 2).map(entrant))];
  for (let index = 2; index < reversed.length; index++) {
    result.push(
      newMatch(stage, index, 0, [
        winner(result.at(-1)!.id),
        entrant(reversed[index]),
      ]),
    );
  }
  result.at(-1)!.metadata.championship = true;
  return result;
}

export function gsl(stage: Stage, groups: string[][]): Match[] {
  return groups.flatMap((ids, groupIndex) => {
    const group = String.fromCharCode(65 + groupIndex);
    const slots = [ids[0], ids[3], ids[1], ids[2]];
    const first = newMatch(stage, 1, 0, slots.slice(0, 2).map(entrant), {
      group,
    });
    const second = newMatch(stage, 1, 1, slots.slice(2, 4).map(entrant), {
      group,
    });
    const upper = newMatch(stage, 2, 0, [winner(first.id), winner(second.id)], {
      group,
      metadata: { qualifier: 1 },
    });
    const lower = newMatch(stage, 2, 1, [loser(first.id), loser(second.id)], {
      group,
    });
    const decider = newMatch(stage, 3, 0, [loser(upper.id), winner(lower.id)], {
      group,
      metadata: { qualifier: 2 },
    });
    return [first, second, upper, lower, decider];
  });
}
