import type { KnockoutDrawConfig, KnockoutFinalRule } from "../../domain/types";

export type SeparationRule = {
  field: "region" | "organization";
  throughRound: number;
};

export function withSeparationRules(
  value: KnockoutDrawConfig,
  separation: SeparationRule[],
  losersSeparation: SeparationRule[],
  restrictions = value.restrictions,
  finalsSeparation: KnockoutFinalRule[] = value.version === 4
    ? value.finalsSeparation
    : [],
): KnockoutDrawConfig {
  const base = {
    pots: value.pots,
    restrictions,
    protectedSeeds: value.protectedSeeds,
  };
  if (finalsSeparation.length)
    return {
      version: 4,
      ...base,
      separation,
      losersSeparation,
      finalsSeparation,
    };
  if (losersSeparation.length)
    return { version: 3, ...base, separation, losersSeparation };
  return separation.length
    ? { version: 2, ...base, separation }
    : { version: 1, ...base };
}
