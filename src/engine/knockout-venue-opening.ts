import type { KnockoutPathsInput } from "./knockout-paths";
import { shuffle } from "./random";

/** Pair entrants, then allocate complete pairs and BYEs through exact venue matching. */
export function solveKnockoutVenueOpening(input: KnockoutPathsInput): {
  slots: (string | null)[] | null;
  exploredNodes: number;
  exhausted: boolean;
} {
  const slots = [...input.slots];
  const matches = slots.length / 2;
  const words = Math.ceil(matches / 32);
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
  const free = Array.from(
    { length: matches },
    (_, match) => slots[2 * match] === null && slots[2 * match + 1] === null,
  );
  const domains = new Map(
    input.participantIds.map((id) => {
      const bits = new Uint32Array(words);
      for (let match = 0; match < matches; match++)
        if (free[match] && input.venueAllowed!.get(id)![match])
          bits[match >>> 5] |= 1 << (match % 32);
      return [id, bits];
    }),
  );
  const entrants = input.participantIds.filter(
    (id) => !input.byes.has(id) && !paired.has(id),
  );
  let work = input.participantIds.length * matches;
  let exploredNodes = 0;
  let exhausted = false;
  const hasPosition = (a: string, b: string) => {
    const anchored = fixed.has(a) ? a : fixed.has(b) ? b : undefined;
    if (anchored) {
      work++;
      return !!input.venueAllowed!.get(anchored === a ? b : a)![
        Math.floor(fixed.get(anchored)! / 2)
      ];
    }
    for (let word = 0; word < words; word++) {
      work++;
      if (domains.get(a)![word] & domains.get(b)![word]) return true;
    }
    return false;
  };
  const neighbors = entrants.map((id) => {
    const preferred = input.participantIds.find(
      (other) =>
        input.preferredSlot.get(other) === (input.preferredSlot.get(id)! ^ 1),
    );
    return shuffle(
      entrants.flatMap((other, index) => {
        work++;
        if (
          id === other ||
          (fixed.has(id) && fixed.has(other)) ||
          input.distance?.incompatible.get(id)!.has(other) ||
          input.keysById
            .get(id)!
            .some((key) => input.keysById.get(other)!.includes(key)) ||
          !hasPosition(id, other)
        )
          return [];
        return [index];
      }),
      `${input.seed}|venue-opponents|${id}`,
    ).sort(
      (a, b) =>
        Number(entrants[b] === preferred) - Number(entrants[a] === preferred),
    );
  });
  // Each shared position set has finite capacity, including unpaired entrants.
  const rawDomains = new Map(
    input.participantIds.map((id) => {
      const bits = new Uint32Array(words);
      for (let match = 0; match < matches; match++)
        if (
          input.venueAllowed!.get(id)![match] &&
          (!fixed.has(id) || Math.floor(fixed.get(id)! / 2) === match)
        )
          bits[match >>> 5] |= 1 << (match % 32);
      return [id, bits];
    }),
  );
  const subset = (a: Uint32Array, b: Uint32Array): boolean => {
    for (let word = 0; word < words; word++) {
      work++;
      if ((a[word] & b[word]) >>> 0 !== a[word]) return false;
    }
    return true;
  };
  const unique = new Map(
    [...rawDomains.values()].map((bits) => [bits.join(","), bits]),
  );
  const capacities = [...unique.values()].map((bits) => {
    let capacity = 0;
    for (let match = 0; match < matches; match++)
      if (bits[match >>> 5] & (1 << (match % 32))) capacity += 2;
    const members = new Set(
      input.participantIds.filter((id) => subset(rawDomains.get(id)!, bits)),
    );
    return {
      bits,
      capacity,
      members,
      used: [...members].reduce(
        (sum, id) => sum + (input.byes.has(id) ? 2 : 1),
        0,
      ),
    };
  });
  if (capacities.some((rule) => rule.used > rule.capacity))
    return { slots: null, exploredNodes, exhausted };
  const pairs: [number, number][] = [];
  const byes = input.participantIds.filter(
    (id) => input.byes.has(id) && !fixed.has(id),
  );
  const positions = (ids: string[]): number[] => {
    const anchored = ids.find((id) => fixed.has(id));
    if (anchored) return [Math.floor(fixed.get(anchored)! / 2)];
    const preferred = Math.floor(input.preferredSlot.get(ids[0])! / 2);
    return shuffle(
      Array.from({ length: matches }, (_, match) => match).filter((match) => {
        work++;
        return (
          free[match] &&
          ids.every((id) => !!input.venueAllowed!.get(id)![match])
        );
      }),
      `${input.seed}|venue-positions|${ids.join("|")}`,
    ).sort((a, b) => Number(b === preferred) - Number(a === preferred));
  };
  const candidates = byes.map((id) => positions([id]));
  const owners = new Int16Array(matches).fill(-1);
  const journal: { match: number; owner: number }[] = [];
  const claim = (match: number, block: number) => {
    journal.push({ match, owner: owners[match] });
    owners[match] = block;
  };
  const visit = (block: number, seen: Uint8Array): boolean => {
    for (const match of candidates[block]) {
      if (++work >= input.workLimit) {
        exhausted = true;
        return false;
      }
      if (!seen[match] && owners[match] === -1) {
        claim(match, block);
        return true;
      }
    }
    for (const match of candidates[block]) {
      if (++work >= input.workLimit) {
        exhausted = true;
        return false;
      }
      if (seen[match]) continue;
      seen[match] = 1;
      if (visit(owners[match], seen)) {
        claim(match, block);
        return true;
      }
    }
    return false;
  };
  for (const block of byes
    .map((_, index) => index)
    .sort((a, b) => candidates[a].length - candidates[b].length || a - b))
    if (!visit(block, new Uint8Array(matches)))
      return { slots: null, exploredNodes, exhausted };
  journal.length = 0;
  const active = entrants.map(() => true);
  const degrees = neighbors.map((values) => values.length);
  const setActive = (index: number, enabled: boolean) => {
    active[index] = enabled;
    for (const neighbor of neighbors[index]) {
      degrees[neighbor] += enabled ? 1 : -1;
      work++;
    }
  };
  const search = (remaining: number): boolean => {
    if (exploredNodes >= input.nodeLimit || work >= input.workLimit) {
      exhausted = true;
      return false;
    }
    if (!remaining) return true;
    exploredNodes++;
    let chosen = -1;
    for (let index = 0; index < entrants.length; index++) {
      work++;
      if (active[index] && (chosen < 0 || degrees[index] < degrees[chosen]))
        chosen = index;
    }
    if (!degrees[chosen]) return false;
    for (const other of neighbors[chosen]) {
      if (work >= input.workLimit) {
        exhausted = true;
        return false;
      }
      if (!active[other]) continue;
      const checkpoint = journal.length;
      candidates.push(positions([entrants[chosen], entrants[other]]));
      const candidateBits = new Uint32Array(words);
      for (const match of candidates.at(-1)!)
        candidateBits[match >>> 5] |= 1 << (match % 32);
      const changes = capacities.map(
        (rule) =>
          2 * Number(subset(candidateBits, rule.bits)) -
          Number(rule.members.has(entrants[chosen])) -
          Number(rule.members.has(entrants[other])),
      );
      capacities.forEach((rule, index) => (rule.used += changes[index]));
      if (capacities.some((rule) => rule.used > rule.capacity)) {
        capacities.forEach((rule, index) => (rule.used -= changes[index]));
        candidates.pop();
        continue;
      }
      const assigned = visit(candidates.length - 1, new Uint8Array(matches));
      setActive(chosen, false);
      setActive(other, false);
      pairs.push([chosen, other]);
      if (assigned && search(remaining - 2)) return true;
      pairs.pop();
      setActive(other, true);
      setActive(chosen, true);
      candidates.pop();
      capacities.forEach((rule, index) => (rule.used -= changes[index]));
      while (journal.length > checkpoint) {
        const previous = journal.pop()!;
        owners[previous.match] = previous.owner;
      }
      if (exhausted) return false;
    }
    return false;
  };
  if (!search(entrants.length))
    return { slots: null, exploredNodes, exhausted };
  const blocks = [
    ...byes.map((id) => [id]),
    ...pairs.map(([a, b]) => [entrants[a], entrants[b]]),
  ];
  const allocation = Array.from({ length: blocks.length }, () => -1);
  owners.forEach((block, match) => {
    if (block >= 0) allocation[block] = match;
  });
  blocks.forEach((ids, index) => {
    const match = allocation[index];
    for (const id of ids) {
      if (fixed.has(id)) continue;
      const preferred = match * 2 + (input.preferredSlot.get(id)! % 2);
      slots[slots[preferred] === null ? preferred : preferred ^ 1] = id;
    }
  });
  return { slots, exploredNodes, exhausted };
}
