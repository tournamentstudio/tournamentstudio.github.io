import { z } from "zod";

export const golPolicySchema = z
  .object({
    ending: z.enum(["manual", "target", "clock"]),
    winBy: z.number().int().min(1).max(100),
    clockSeconds: z.number().int().min(30).max(86400),
    overtime: z.enum(["manual", "sudden-death", "extra-time"]),
    overtimeSeconds: z.number().int().min(30).max(3600),
    possession: z.enum(["manual", "alternate", "winner", "loser"]),
  })
  .strict();
export type GolPolicy = z.infer<typeof golPolicySchema>;
export const defaultGolPolicy: GolPolicy = {
  ending: "manual",
  winBy: 1,
  clockSeconds: 1500,
  overtime: "manual",
  overtimeSeconds: 180,
  possession: "manual",
};
export const golAbilitySchema = z
  .object({
    eligible: z.enum(["any", "concealing", "guessing"]),
    limitScope: z.enum(["match", "period"]),
    multiplier: z.number().int().min(1).max(3),
    possession: z.enum(["unchanged", "switch", "user"]),
    pauseClock: z.boolean(),
  })
  .strict();
export type GolAbility = z.infer<typeof golAbilitySchema>;
export const defaultGolAbility: GolAbility = {
  eligible: "any",
  limitScope: "match",
  multiplier: 1,
  possession: "unchanged",
  pauseClock: false,
};
const id = z.string().min(1).max(160);
export const golStateSchema = z
  .object({
    elapsedMs: z.number().int().min(0).max(604800000),
    runningSince: z.string().datetime().optional(),
    period: z.number().int().min(0).max(100),
    overtime: z.enum(["none", "sudden-death", "extra-time"]),
    concealingTeamId: id.optional(),
  })
  .strict();
export type GolState = z.infer<typeof golStateSchema>;
export function golElapsed(state: GolState | undefined, now = Date.now()) {
  return Math.min(
    604800000,
    Math.max(0, state?.elapsedMs ?? 0) +
      (state?.runningSince
        ? Math.max(0, now - Date.parse(state.runningSince))
        : 0),
  );
}
export const golHandStateSchema = z
  .object({
    period: z.number().int().min(0).max(100),
    elapsedMs: z.number().int().min(0).max(604800000),
    cardUsedById: id.optional(),
    nextConcealingTeamId: id,
  })
  .strict();
export type GolHandState = z.infer<typeof golHandStateSchema>;
