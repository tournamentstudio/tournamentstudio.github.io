/** Supplied ranks use competition ordering: ties occupy consecutive places. */
export function validatePlacements(
  placements: number[] | undefined,
  entrants: number,
): void {
  if (placements === undefined) return;
  if (
    placements.length !== entrants ||
    placements.some(
      (rank) => !Number.isInteger(rank) || rank < 1 || rank > entrants,
    )
  )
    throw new Error("Enter a valid placement for every entrant.");
  const ranks = [...placements].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (
      (i === 0 && ranks[i] !== 1) ||
      (i > 0 && ranks[i] !== ranks[i - 1] && ranks[i] !== i + 1)
    )
      throw new Error(
        "Use competition placements such as 1, 1, 3 when entrants tie.",
      );
  }
}
