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
  finalsSeparation: KnockoutFinalRule[] = "finalsSeparation" in value
    ? value.finalsSeparation
    : [],
  distance:
    | Extract<KnockoutDrawConfig, { version: 5 }>["distance"]
    | null = value.version === 5 ? value.distance : null,
): KnockoutDrawConfig {
  const base = {
    pots: value.pots,
    restrictions,
    protectedSeeds: value.protectedSeeds,
  };
  if (distance)
    return {
      version: 5,
      ...base,
      separation,
      losersSeparation,
      finalsSeparation,
      distance,
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

export function withDistanceRule(
  value: KnockoutDrawConfig,
  distance: Extract<KnockoutDrawConfig, { version: 5 }>["distance"] | null,
): KnockoutDrawConfig {
  return withSeparationRules(
    value,
    value.version === 1 ? [] : value.separation,
    "losersSeparation" in value ? value.losersSeparation : [],
    value.restrictions,
    "finalsSeparation" in value ? value.finalsSeparation : [],
    distance,
  );
}
