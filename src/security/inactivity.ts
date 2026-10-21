export const INACTIVITY_MINUTES = [0, 1, 5, 15, 30, 60] as const;
export type InactivityMinutes = (typeof INACTIVITY_MINUTES)[number];
export const DEFAULT_INACTIVITY_MINUTES: InactivityMinutes = 15;
export const INACTIVITY_KEY = "tournastudio-vault-inactivity-v1";

export function parseInactivityMinutes(raw: string | null): InactivityMinutes {
  const value =
    raw === null || !/^(0|1|5|15|30|60)$/.test(raw) ? NaN : Number(raw);
  return INACTIVITY_MINUTES.includes(value as InactivityMinutes)
    ? (value as InactivityMinutes)
    : DEFAULT_INACTIVITY_MINUTES;
}

export function inactivityRemaining(
  lastActivity: number,
  now: number,
  minutes: InactivityMinutes,
): number | undefined {
  if (!minutes) return undefined;
  return Math.max(0, minutes * 60_000 - Math.max(0, now - lastActivity));
}
