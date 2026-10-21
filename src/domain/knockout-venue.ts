import { z } from "zod";
import type { KnockoutVenueTarget, Match, Stage } from "./types";
import { MAX_DISTANCE_KM } from "./geography";

export const knockoutVenueTargetSchema = z
  .object({
    bracket: z.enum(["winners", "losers", "final", "reset", "placement"]),
    round: z.number().int().min(1).max(19),
    index: z.number().int().min(0).max(255),
  })
  .strict();

export const knockoutVenueRuleSchema = z
  .object({
    resourceId: z.string().min(1).max(160),
    minKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
    maxKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
    targets: z.array(knockoutVenueTargetSchema).min(1).max(1024),
  })
  .strict()
  .refine((rule) => rule.minKm !== undefined || rule.maxKm !== undefined)
  .refine(
    (rule) =>
      rule.minKm === undefined ||
      rule.maxKm === undefined ||
      rule.minKm <= rule.maxKm,
  );

export function knockoutVenueTargetKey(
  target: Pick<Match, "bracket" | "round" | "index">,
): string {
  return `${target.bracket}:${target.round}:${target.index}`;
}

/** Counts follow the generated bracket's physical match coordinates. */
export function isKnockoutVenueTarget(
  stage: Stage,
  count: number,
  target: KnockoutVenueTarget,
): boolean {
  const rounds = Math.ceil(Math.log2(Math.max(2, count)));
  const size = 2 ** rounds;
  if (target.bracket === "winners")
    return target.round <= rounds && target.index < size / 2 ** target.round;
  if (stage.format === "double-elimination") {
    if (target.bracket === "losers")
      return (
        target.round <= 2 * rounds - 2 &&
        target.index < size / 2 ** (Math.floor((target.round + 1) / 2) + 1)
      );
    if (target.bracket === "final")
      return target.round === 2 * rounds && target.index === 0;
    if (target.bracket === "reset")
      return (
        stage.config.grandFinalReset &&
        target.round === 2 * rounds + 1 &&
        target.index === 0
      );
    return false;
  }
  return (
    target.bracket === "placement" &&
    stage.format === "single-elimination" &&
    stage.config.thirdPlace &&
    count >= 3 &&
    target.round === rounds &&
    target.index === 0
  );
}
