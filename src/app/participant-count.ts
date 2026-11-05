export function parseParticipantCount(input: string): number | undefined {
  if (!input.trim()) return undefined;
  const count = Number(input);
  return Number.isInteger(count) && count >= 2 && count <= 512
    ? count
    : undefined;
}
