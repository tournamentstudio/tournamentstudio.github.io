import type { FormatDefinition, Match, Slot, Stage } from "../domain/types";

export const formats: FormatDefinition[] = [
  ["single-elimination", 1, 512, false, false, false],
  ["double-elimination", 2, 512, false, false, false],
  ["triple-elimination", 2, 512, true, false, false],
  ["round-robin", 2, 128, false, true, false],
  ["groups", 2, 512, false, true, false],
  ["swiss", 2, 512, true, true, false],
  ["gsl", 4, 512, false, false, false],
  ["free-for-all", 2, 512, false, true, true],
  ["gauntlet", 2, 512, false, false, false],
  ["ladder", 2, 512, true, false, false],
  ["time-trial", 2, 512, false, true, true],
  ["grand-prix", 2, 512, false, true, true],
].map(
  ([id, minParticipants, maxParticipants, dynamic, draws, multiEntrant]) => ({
    id,
    version: 1,
    minParticipants,
    maxParticipants,
    dynamic,
    draws,
    multiEntrant,
  }),
) as FormatDefinition[];

export const terminal = (match: Match) =>
  match.status === "completed" ||
  match.status === "bye" ||
  match.status === "canceled";
export const winner = (matchId: string, position = 0): Slot => ({
  source: { matchId, result: "winner", position },
});
export const loser = (matchId: string): Slot => ({
  source: { matchId, result: "loser" },
});
export const entrant = (participantId?: string): Slot =>
  participantId ? { participantId } : {};

export function newMatch(
  stage: Stage,
  round: number,
  index: number,
  slots: Slot[],
  options: Partial<Match> = {},
): Match {
  return {
    id: `${stage.id}:${options.group ?? ""}:${options.bracket ?? "main"}:${round}:${index}`,
    stageId: stage.id,
    round,
    index,
    label: `R${round} M${index + 1}`,
    slots,
    status: "pending",
    metadata: {},
    ...options,
  };
}

export function roundRobin(
  stage: Stage,
  ids: string[],
  group?: string,
): Match[] {
  if (ids.length < 2) return [];
  const circle: (string | undefined)[] = [...ids];
  if (circle.length % 2) circle.push(undefined);
  const result: Match[] = [];
  const rounds = circle.length - 1;
  for (let cycle = 0; cycle < stage.config.meetings; cycle++) {
    const rotation = [...circle];
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < circle.length / 2; i++) {
        const pair = [rotation[i], rotation[circle.length - 1 - i]];
        if (pair.some((id) => !id)) continue;
        if ((round + cycle) % 2) pair.reverse();
        result.push(
          newMatch(stage, cycle * rounds + round + 1, i, pair.map(entrant), {
            group,
          }),
        );
      }
      rotation.splice(1, 0, rotation.pop());
    }
  }
  return result;
}

export function distributeGroups(ids: string[], count: number): string[][] {
  const groups: string[][] = Array.from({ length: count }, () => []);
  ids.forEach((id, index) => {
    const group =
      Math.floor(index / count) % 2
        ? count - 1 - (index % count)
        : index % count;
    groups[group].push(id);
  });
  return groups;
}
