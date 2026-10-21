import type { KnockoutPathsInput } from "./knockout-paths";
import { shuffle } from "./random";

/** Match entrant pairs first when every remaining constraint concerns the opening round. */
export function solveKnockoutDistanceOpening(input: KnockoutPathsInput): {
  slots: (string | null)[] | null;
  exploredNodes: number;
  exhausted: boolean;
} {
  const slots = [...input.slots];
  const fixed = new Map<string, number>();
  slots.forEach((id, index) => {
    if (id) fixed.set(id, index);
  });
  const paired = new Set<string>();
  for (let index = 0; index < slots.length; index += 2)
    if (slots[index] && slots[index + 1]) {
      paired.add(slots[index]!);
      paired.add(slots[index + 1]!);
    }
  const entrants = input.participantIds.filter(
    (id) => !input.byes.has(id) && !paired.has(id),
  );
  const neighbors = entrants.map((id) => {
    const preferred = input.participantIds.find(
      (other) =>
        input.preferredSlot.get(other) === (input.preferredSlot.get(id)! ^ 1),
    );
    return shuffle(
      entrants.flatMap((other, index) => {
        if (
          id === other ||
          (fixed.has(id) && fixed.has(other)) ||
          input.distance!.incompatible.get(id)!.has(other) ||
          input.keysById
            .get(id)!
            .some((key) => input.keysById.get(other)!.includes(key))
        )
          return [];
        return [index];
      }),
      `${input.seed}|distance-opponents|${id}`,
    ).sort(
      (a, b) =>
        Number(entrants[b] === preferred) - Number(entrants[a] === preferred),
    );
  });
  const active = entrants.map(() => true);
  const degrees = neighbors.map((values) => values.length);
  const pairs: [number, number][] = [];
  let exploredNodes = 0;
  let work = entrants.length * entrants.length;
  let exhausted = false;
  const setActive = (index: number, enabled: boolean) => {
    active[index] = enabled;
    for (const neighbor of neighbors[index]) {
      degrees[neighbor] += enabled ? 1 : -1;
      work++;
    }
  };
  const search = (remaining: number): boolean => {
    if (!remaining) return true;
    if (exploredNodes >= input.nodeLimit || work >= input.workLimit) {
      exhausted = true;
      return false;
    }
    exploredNodes++;
    let chosen = -1;
    for (let index = 0; index < entrants.length; index++) {
      work++;
      if (active[index] && (chosen < 0 || degrees[index] < degrees[chosen]))
        chosen = index;
    }
    if (!degrees[chosen]) return false;
    for (const other of neighbors[chosen]) {
      if (!active[other]) continue;
      setActive(chosen, false);
      setActive(other, false);
      pairs.push([chosen, other]);
      if (search(remaining - 2)) return true;
      pairs.pop();
      setActive(other, true);
      setActive(chosen, true);
      if (exhausted) return false;
    }
    return false;
  };
  if (!search(entrants.length))
    return { slots: null, exploredNodes, exhausted };
  const emptyMatch = (preferred: number) => {
    const first = preferred - (preferred % 2);
    if (slots[first] === null && slots[first + 1] === null) return first;
    return slots.findIndex(
      (id, index) =>
        index % 2 === 0 && id === null && slots[index + 1] === null,
    );
  };
  for (const id of input.participantIds.filter((id) => input.byes.has(id))) {
    if (fixed.has(id)) continue;
    const preferred = input.preferredSlot.get(id)!;
    slots[emptyMatch(preferred) + (preferred % 2)] = id;
  }
  for (const [firstIndex, secondIndex] of pairs) {
    const first = entrants[firstIndex];
    const second = entrants[secondIndex];
    const anchored = fixed.has(first)
      ? first
      : fixed.has(second)
        ? second
        : null;
    if (anchored)
      slots[fixed.get(anchored)! ^ 1] = anchored === first ? second : first;
    else {
      const preferred = input.preferredSlot.get(first)!;
      const slot = emptyMatch(preferred) + (preferred % 2);
      slots[slot] = first;
      slots[slot ^ 1] = second;
    }
  }
  return { slots, exploredNodes, exhausted };
}
