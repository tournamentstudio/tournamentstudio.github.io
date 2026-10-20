/** Mulberry32 with an FNV-1a seed. The identifier is part of exported draws. */
export const DRAW_ALGORITHM = "fnv1a-mulberry32-v1";

export function randomSource(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++)
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  const random = randomSource(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Conventional seed positions keep the two highest seeds in opposite halves. */
export function seedPositions(size: number): number[] {
  if (size <= 1) return [1];
  let positions = [1, 2];
  while (positions.length < size) {
    const complement = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, complement - seed]);
  }
  return positions;
}
