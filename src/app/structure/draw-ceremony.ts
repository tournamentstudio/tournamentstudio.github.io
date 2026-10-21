export interface DrawReveal {
  participantId: string | null;
  destination: number;
  slot: number;
}
export function drawReveals(
  groups: readonly (readonly (string | null)[])[],
): DrawReveal[] {
  return groups.flatMap((group, destination) =>
    group.map((participantId, slot) => ({
      participantId,
      destination: destination + 1,
      slot: slot + 1,
    })),
  );
}
