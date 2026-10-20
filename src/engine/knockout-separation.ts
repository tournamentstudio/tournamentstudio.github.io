import { shuffle } from "./random";

export interface SeparationRule {
  field: "region" | "organization";
  throughRound: number;
  labels: Map<string, string>;
}

interface SeparationInput {
  slots: (string | null)[];
  participantIds: string[];
  byes: Set<string>;
  keysById: Map<string, string[]>;
  preferredSlot: Map<string, number>;
  separation: SeparationRule[];
  seed: string;
  nodeLimit: number;
  workLimit: number;
}

/**
 * Assign entrants to initial matches while enforcing each protected subtree.
 * Pairing and subtree placement share one search, so an early pairing decision
 * can be undone when it prevents a later-round separation.
 */
export function solveKnockoutSeparation(input: SeparationInput): {
  slots: (string | null)[] | null;
  exploredNodes: number;
  exhausted: boolean;
} {
  const {
    participantIds,
    byes,
    keysById,
    preferredSlot,
    separation,
    seed,
    nodeLimit,
    workLimit,
  } = input;
  const slots = [...input.slots];
  const matches = slots.length / 2;
  const occupants = Array.from({ length: matches }, (_, index) =>
    slots
      .slice(index * 2, index * 2 + 2)
      .filter((id): id is string => id !== null),
  );
  const placed = new Set(slots.filter((id): id is string => id !== null));
  const entrants = participantIds.filter((id) => !placed.has(id));
  const indexById = new Map(entrants.map((id, index) => [id, index]));
  const keys = new Map(
    participantIds.map((id) => [id, new Set(keysById.get(id)!)]),
  );
  const blocks = separation.map((rule) => {
    const width = 2 ** (rule.throughRound - 1);
    const used = Array.from(
      { length: matches / width },
      () => new Set<string>(),
    );
    for (let match = 0; match < matches; match++)
      for (const id of occupants[match])
        used[Math.floor(match / width)].add(rule.labels.get(id)!);
    const members = new Map<string, number[]>();
    entrants.forEach((id, index) => {
      const label = rule.labels.get(id)!;
      const previous = members.get(label) ?? [];
      previous.push(index);
      members.set(label, previous);
    });
    return { ...rule, width, used, members };
  });
  const allowed = (id: string, match: number): boolean => {
    const current = occupants[match];
    if (current.length >= 2) return false;
    if (
      current.length &&
      (byes.has(id) ||
        byes.has(current[0]) ||
        keysById.get(current[0])!.some((key) => keys.get(id)!.has(key)))
    )
      return false;
    return blocks.every(
      (block) =>
        !block.used[Math.floor(match / block.width)].has(block.labels.get(id)!),
    );
  };
  const domains = new Uint8Array(entrants.length * matches);
  const counts = new Int16Array(entrants.length);
  const active = entrants.map(() => true);
  let work = 0;
  let exploredNodes = 0;
  let exhausted = false;
  entrants.forEach((id, index) => {
    for (let match = 0; match < matches; match++) {
      work++;
      if (allowed(id, match)) {
        domains[index * matches + match] = 1;
        counts[index]++;
      }
    }
  });
  const candidateOrder = entrants.map((id) => {
    const preferred = Math.floor(preferredSlot.get(id)! / 2);
    return shuffle(
      Array.from({ length: matches }, (_, index) => index),
      `${seed}|subtrees|${id}`,
    ).sort((a, b) => Number(b === preferred) - Number(a === preferred));
  });
  const rarity = entrants.map((id) =>
    blocks.reduce(
      (total, block) =>
        total + block.members.get(block.labels.get(id)!)!.length,
      0,
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
    if (!remaining) return true;
    if (exploredNodes >= nodeLimit || work >= workLimit) {
      exhausted = true;
      return false;
    }
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
    const equivalentEmpty = new Set<string>();
    for (const match of candidateOrder[chosen]) {
      work++;
      if (!domains[chosen * matches + match]) continue;
      if (!occupants[match].length) {
        // Empty matches within the same protected blocks have identical domains.
        const signature = blocks
          .map((block) => Math.floor(match / block.width))
          .join("|");
        if (equivalentEmpty.has(signature)) continue;
        equivalentEmpty.add(signature);
      }
      const checkpoint = removed.length;
      active[chosen] = false;
      occupants[match].push(id);
      for (const block of blocks) {
        const group = Math.floor(match / block.width);
        const label = block.labels.get(id)!;
        block.used[group].add(label);
        for (const other of block.members.get(label)!)
          for (
            let position = group * block.width;
            position < (group + 1) * block.width;
            position++
          )
            remove(other, position);
      }
      for (let other = 0; other < entrants.length; other++)
        if (active[other] && !allowed(entrants[other], match))
          remove(other, match);
      if (search(remaining - 1)) return true;
      for (const block of blocks)
        block.used[Math.floor(match / block.width)].delete(
          block.labels.get(id)!,
        );
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
    return { slots: null, exploredNodes, exhausted };
  for (let match = 0; match < matches; match++) {
    for (const id of occupants[match]) {
      if (!indexById.has(id)) continue;
      const preferred = match * 2 + (preferredSlot.get(id)! % 2);
      slots[slots[preferred] === null ? preferred : preferred ^ 1] = id;
    }
  }
  return { slots, exploredNodes, exhausted };
}
