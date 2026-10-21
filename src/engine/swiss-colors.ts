import type { Match, Stage } from "../domain/types";
import { swissPolicy } from "../domain/swiss";

/** Balances first/second slots after opponent selection; preferences break equal costs. */
export function orientSwissPair(pair: [string, string], history: Match[], stage: Stage, round: number): [string, string] {
  const fallback = (round % 2 ? pair : [...pair].reverse()) as [string, string];
  const policy = swissPolicy(stage);
  if (policy.colorPolicy === "alternating") return fallback;
  const sides = new Map<string, number[]>();
  for (const match of [...history].sort((a, b) => a.round - b.round || a.index - b.index)) {
    if (match.status === "bye" || match.status === "canceled" || match.slots.filter((slot) => slot.participantId).length !== 2) continue;
    match.slots.forEach((slot, index) => {
      const values = sides.get(slot.participantId!) ?? [];
      values.push(index === 0 ? 1 : -1);
      sides.set(slot.participantId!, values);
    });
  }
  function cost(ids: [string, string]) {
    return ids.reduce((total, id, index) => {
      const side = index === 0 ? 1 : -1, previous = sides.get(id) ?? [];
      const balance = previous.reduce((sum, side) => sum + side, 0);
      const repeated = previous.length >= 2 && previous.slice(-2).every((value) => value === side);
      const preference = policy.preferences[id];
      return total + Math.abs(balance + side) * 10 + Number(repeated) * 100 +
        Number(!!preference && !previous.length && preference !== (index === 0 ? "first" : "second"));
    }, 0);
  }
  const reversed = [...fallback].reverse() as [string, string];
  return cost(reversed) < cost(fallback) ? reversed : fallback;
}
