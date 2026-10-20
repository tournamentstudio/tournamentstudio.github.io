import type { KnockoutDrawConfig } from "../../domain/types";

export type SeparationRule = {
  field: "region" | "organization";
  throughRound: number;
};

export function withSeparationRules(
  value: KnockoutDrawConfig,
  separation: SeparationRule[],
  losersSeparation: SeparationRule[],
  restrictions = value.restrictions,
): KnockoutDrawConfig {
  const base = {
    pots: value.pots,
    restrictions,
    protectedSeeds: value.protectedSeeds,
  };
  if (losersSeparation.length)
    return { version: 3, ...base, separation, losersSeparation };
  return separation.length
    ? { version: 2, ...base, separation }
    : { version: 1, ...base };
}
