import { shuffle } from "./random";
import type { SeparationRule } from "./knockout-separation";
import { canMeetInThirdPlace, type ThirdPlaceRule } from "./finals-separation";
import type { DistanceConstraint } from "./geographic-distance";

export interface KnockoutPathsInput {
  slots: (string | null)[];
  participantIds: string[];
  byes: Set<string>;
  keysById: Map<string, string[]>;
  preferredSlot: Map<string, number>;
  separation: SeparationRule[];
  losersSeparation: SeparationRule[];
  thirdPlaceSeparation?: ThirdPlaceRule[];
  distance?: DistanceConstraint;
  venueAllowed?: Map<string, Uint8Array>;
  encounters: Uint8Array;
  seed: string;
  nodeLimit: number;
  workLimit: number;
  onWork?: (work: number) => void;
}

/** Joint assignment keeps lower-path, upper-block, pot, and pinned-slot rules. */
export function solveKnockoutPaths(input: KnockoutPathsInput): {
  slots: (string | null)[] | null;
  exploredNodes: number;
  exhausted: boolean;
} {
  const {
    participantIds,
    byes,
    keysById,
    preferredSlot,
    seed,
    nodeLimit,
    workLimit,
  } = input;
  const slots = [...input.slots];
  const size = slots.length;
  const matches = size / 2;
  const occupants = Array.from({ length: matches }, (_, index) =>
    slots
      .slice(index * 2, index * 2 + 2)
      .filter((id): id is string => id !== null),
  );
  const placed = new Map<string, number>();
  occupants.forEach((ids, match) => ids.forEach((id) => placed.set(id, match)));
  const entrants = participantIds.filter((id) => !placed.has(id));
  const rules = [
    ...input.separation.map((rule) => ({
      labels: rule.labels,
      conflicts: (_a: string, first: number, _b: string, second: number) =>
        Math.floor(first / 2 ** (rule.throughRound - 1)) ===
        Math.floor(second / 2 ** (rule.throughRound - 1)),
    })),
    ...input.losersSeparation.map((rule) => ({
      labels: rule.labels,
      conflicts: (a: string, first: number, b: string, second: number) => {
        const round =
          input.encounters[
            (first * 2 + Number(byes.has(a))) * size +
              second * 2 +
              Number(byes.has(b))
          ];
        return round > 0 && round <= rule.throughRound;
      },
    })),
    ...(input.thirdPlaceSeparation ?? []).map((rule) => ({
      labels: rule.labels,
      conflicts: (a: string, first: number, b: string, second: number) =>
        canMeetInThirdPlace(size, byes, a, first, b, second),
    })),
  ].map((rule) => {
    const members = new Map<string, number[]>();
    entrants.forEach((id, index) => {
      const label = rule.labels.get(id)!;
      const values = members.get(label) ?? [];
      values.push(index);
      members.set(label, values);
    });
    return { ...rule, members };
  });
  const keys = new Map(
    participantIds.map((id) => [id, new Set(keysById.get(id)!)]),
  );
  let work = 0;
  let exploredNodes = 0;
  let exhausted = false;
  const finish = (value: {
    slots: (string | null)[] | null;
    exploredNodes: number;
    exhausted: boolean;
  }) => {
    input.onWork?.(work);
    return value;
  };
  const openingAllowed = (id: string, match: number): boolean => {
    const current = occupants[match];
    return (
      current.length < 2 &&
      (!current.length ||
        (!byes.has(id) &&
          !byes.has(current[0]) &&
          !keysById.get(current[0])!.some((key) => keys.get(id)!.has(key))))
    );
  };
  const allowed = (id: string, match: number): boolean => {
    if (input.venueAllowed && !input.venueAllowed.get(id)![match]) return false;
    if (!openingAllowed(id, match)) return false;
    for (const [other, position] of placed)
      for (const rule of rules) {
        work++;
        if (
          rule.labels.get(id) === rule.labels.get(other) &&
          rule.conflicts(id, match, other, position)
        )
          return false;
      }
    if (input.distance)
      for (const [other, position] of placed) {
        work++;
        if (
          input.distance.incompatible.get(id)!.has(other) &&
          input.distance.conflicts(id, match, other, position)
        )
          return false;
      }
    return true;
  };
  const domains = new Uint8Array(entrants.length * matches);
  const counts = new Int16Array(entrants.length);
  const active = entrants.map(() => true);
  for (let index = 0; index < entrants.length; index++) {
    for (let match = 0; match < matches; match++) {
      if (work >= workLimit)
        return finish({ slots: null, exploredNodes, exhausted: true });
      work++;
      if (allowed(entrants[index], match)) {
        domains[index * matches + match] = 1;
        counts[index]++;
      }
    }
  }
  const candidateOrder = entrants.map((id) => {
    const preferred = Math.floor(preferredSlot.get(id)! / 2);
    return shuffle(
      Array.from({ length: matches }, (_, index) => index),
      `${seed}|paths|${id}`,
    ).sort((a, b) => Number(b === preferred) - Number(a === preferred));
  });
  const rarity = entrants.map((id) =>
    rules.reduce(
      (total, rule) => total + rule.members.get(rule.labels.get(id)!)!.length,
      input.distance?.incompatible.get(id)?.size ?? 0,
    ),
  );
  const removed: number[] = [];
  const remove = (index: number, match: number) => {
    work++;
    const offset = index * matches + match;
    if (active[index] && domains[offset]) {
      domains[offset] = 0;
      counts[index]--;
      removed.push(offset);
    }
  };
  const search = (remaining: number): boolean => {
    if (work >= workLimit || exploredNodes >= nodeLimit) {
      exhausted = true;
      return false;
    }
    if (!remaining) return true;
    exploredNodes++;
    let chosen = -1;
    for (let index = 0; index < entrants.length; index++) {
      work++;
      if (
        active[index] &&
        (chosen < 0 ||
          counts[index] < counts[chosen] ||
          (counts[index] === counts[chosen] && rarity[index] > rarity[chosen]))
      )
        chosen = index;
    }
    if (!counts[chosen]) return false;
    const id = entrants[chosen];
    for (const match of candidateOrder[chosen]) {
      work++;
      if (!domains[chosen * matches + match]) continue;
      const checkpoint = removed.length;
      active[chosen] = false;
      occupants[match].push(id);
      for (const rule of rules)
        for (const other of rule.members.get(rule.labels.get(id)!)!)
          if (active[other])
            for (let position = 0; position < matches; position++) {
              work++;
              if (rule.conflicts(id, match, entrants[other], position))
                remove(other, position);
            }
      if (input.distance)
        for (let other = 0; other < entrants.length; other++)
          if (
            active[other] &&
            input.distance.incompatible.get(id)!.has(entrants[other])
          ) {
            if (input.distance.openingOnly) {
              work++;
              if (input.distance.conflicts(id, match, entrants[other], match))
                remove(other, match);
            } else
              for (let position = 0; position < matches; position++) {
                work++;
                if (
                  input.distance.conflicts(id, match, entrants[other], position)
                )
                  remove(other, position);
              }
          }
      for (let other = 0; other < entrants.length; other++)
        if (active[other] && !openingAllowed(entrants[other], match))
          remove(other, match);
      if (search(remaining - 1)) return true;
      occupants[match].pop();
      active[chosen] = true;
      while (removed.length > checkpoint) {
        const offset = removed.pop()!;
        domains[offset] = 1;
        counts[Math.floor(offset / matches)]++;
      }
      if (exhausted) return false;
    }
    return false;
  };
  if (!search(entrants.length))
    return finish({ slots: null, exploredNodes, exhausted });
  for (let match = 0; match < matches; match++)
    for (const id of occupants[match]) {
      if (placed.has(id)) continue;
      const preferred = match * 2 + (preferredSlot.get(id)! % 2);
      slots[slots[preferred] === null ? preferred : preferred ^ 1] = id;
    }
  return finish({ slots, exploredNodes, exhausted });
}
