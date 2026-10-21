import type {
  KnockoutDistanceRule,
  KnockoutDrawConfig,
  KnockoutFinalRule,
  KnockoutVenueRule,
} from "../../domain/types";

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
  distance: KnockoutDistanceRule | null = "distance" in value
    ? (value.distance ?? null)
    : null,
  venueRules: KnockoutVenueRule[] = value.version === 6 ? value.venueRules : [],
): KnockoutDrawConfig {
  const base = {
    pots: value.pots,
    restrictions,
    protectedSeeds: value.protectedSeeds,
  };
  if (venueRules.length)
    return {
      version: 6,
      ...base,
      separation,
      losersSeparation,
      finalsSeparation,
      ...(distance ? { distance } : {}),
      venueRules,
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
  distance: KnockoutDistanceRule | null,
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

export function withVenueRules(
  value: KnockoutDrawConfig,
  venueRules: KnockoutVenueRule[],
): KnockoutDrawConfig {
  return withSeparationRules(
    value,
    value.version === 1 ? [] : value.separation,
    "losersSeparation" in value ? value.losersSeparation : [],
    value.restrictions,
    "finalsSeparation" in value ? value.finalsSeparation : [],
    "distance" in value ? (value.distance ?? null) : null,
    venueRules,
  );
}
