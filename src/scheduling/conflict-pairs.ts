export interface ConflictInterval {
  index: number;
  start: number;
  end: number;
  resourceId?: string;
  referee?: string;
  entrantIds: ReadonlySet<string>;
}

/** Candidate pairs are exact for shared resources, referees, or entrant rest. */
export function schedulingConflictPairs(
  intervals: readonly ConflictInterval[],
  restMilliseconds: number,
): Map<number, number[]> {
  if (!Number.isFinite(restMilliseconds) || restMilliseconds < 0)
    throw new RangeError("Invalid rest duration");
  const pairs = new Map<number, Set<number>>();
  const resources = new Map<string, ConflictInterval[]>();
  const referees = new Map<string, ConflictInterval[]>();
  const entrants = new Map<string, ConflictInterval[]>();
  function assign(
    bucket: Map<string, ConflictInterval[]>,
    key: string,
    item: ConflictInterval,
  ) {
    const group = bucket.get(key);
    if (group) group.push(item);
    else bucket.set(key, [item]);
  }
  for (const item of intervals) {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
    if (item.resourceId) assign(resources, item.resourceId, item);
    if (item.referee) assign(referees, item.referee, item);
    for (const id of item.entrantIds) assign(entrants, id, item);
  }
  function connect(first: ConflictInterval, second: ConflictInterval) {
    const low = Math.min(first.index, second.index),
      high = Math.max(first.index, second.index);
    if (low === high) return;
    const existing = pairs.get(low);
    if (existing) existing.add(high);
    else pairs.set(low, new Set([high]));
  }
  function overlaps(groups: Map<string, ConflictInterval[]>, padding: number) {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const ordered = [...group].sort(
        (a, b) => a.start - b.start || a.index - b.index,
      );
      let active: ConflictInterval[] = [];
      for (const item of ordered) {
        active = active.filter(
          (previous) => previous.end + padding > item.start,
        );
        for (const previous of active)
          if (previous.start < item.end + padding) connect(previous, item);
        active.push(item);
      }
    }
  }
  overlaps(resources, 0);
  overlaps(referees, 0);
  overlaps(entrants, restMilliseconds);
  return new Map(
    [...pairs]
      .sort(([a], [b]) => a - b)
      .map(([key, values]) => [key, [...values].sort((a, b) => a - b)]),
  );
}
