import type {
  GroupDrawIssue,
  KnockoutDistanceRule,
  Participant,
} from "../domain/types";
import { locationSchema } from "../domain/geography";
import { canMeetInThirdPlace } from "./finals-separation";

export const EARTH_RADIUS_KM = 6371.0088;
type Location = NonNullable<Participant["location"]>;

/** Spherical great-circle distance; coordinates are entered by the organizer. */
export function greatCircleDistanceKm(a: Location, b: Location): number {
  const longitudeDifference = b.longitude - a.longitude;
  if (
    a.latitude === b.latitude &&
    (Math.abs(a.latitude) === 90 || longitudeDifference % 360 === 0)
  )
    return 0;
  const radians = Math.PI / 180;
  const latitude = (b.latitude - a.latitude) * radians;
  const longitude =
    (longitudeDifference > 180
      ? longitudeDifference - 360
      : longitudeDifference < -180
        ? longitudeDifference + 360
        : longitudeDifference) * radians;
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(longitude / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_KM *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
  );
}

export interface DistanceConstraint {
  openingOnly: boolean;
  incompatible: Map<string, Set<string>>;
  conflicts: (a: string, first: number, b: string, second: number) => boolean;
}

export function prepareDistanceRestriction(
  rule: KnockoutDistanceRule,
  participantIds: string[],
  participants: Map<string, Participant>,
  size: number,
  byes: Set<string>,
  encounters: Uint8Array,
): { issues: GroupDrawIssue[]; constraint?: DistanceConstraint } {
  const issues: GroupDrawIssue[] = [];
  const locations = new Map<string, Location>();
  for (const id of participantIds) {
    const participant = participants.get(id)!;
    const parsed = locationSchema.safeParse(participant.location);
    if (!parsed.success)
      issues.push({ code: "missingLocation", values: [participant.name] });
    else locations.set(id, parsed.data);
  }
  if (issues.length) return { issues };
  const incompatible = new Map(
    participantIds.map((id) => [id, new Set<string>()]),
  );
  const allFinalists = rule.finals.some((target) => target !== "third-place");
  const allWinners = rule.winnersThroughRound === Math.log2(size);
  const allLosers =
    rule.losersThroughRound > 0 &&
    rule.losersThroughRound === 2 * Math.log2(size) - 2;
  for (let first = 0; first < participantIds.length; first++)
    for (let second = first + 1; second < participantIds.length; second++) {
      const a = participantIds[first];
      const b = participantIds[second];
      const distance = greatCircleDistanceKm(
        locations.get(a)!,
        locations.get(b)!,
      );
      if (
        (rule.minKm !== undefined && distance < rule.minKm) ||
        (rule.maxKm !== undefined && distance > rule.maxKm)
      ) {
        if (allFinalists)
          return {
            issues: [
              {
                code: "distanceFinals",
                values: [
                  participants.get(a)!.name,
                  participants.get(b)!.name,
                  String(Number(distance.toFixed(6))),
                ],
              },
            ],
          };
        if (allWinners || allLosers)
          return { issues: [{ code: "distanceInfeasible", values: [] }] };
        incompatible.get(a)!.add(b);
        incompatible.get(b)!.add(a);
      }
    }
  return {
    issues,
    constraint: {
      openingOnly:
        rule.winnersThroughRound <= 1 &&
        rule.losersThroughRound === 0 &&
        !rule.finals.includes("third-place"),
      incompatible,
      conflicts: (a, first, b, second) => {
        if (
          rule.winnersThroughRound > 0 &&
          Math.floor(first / 2 ** (rule.winnersThroughRound - 1)) ===
            Math.floor(second / 2 ** (rule.winnersThroughRound - 1))
        )
          return true;
        if (rule.losersThroughRound > 0) {
          const round =
            encounters[
              (first * 2 + Number(byes.has(a))) * size +
                second * 2 +
                Number(byes.has(b))
            ];
          if (round > 0 && round <= rule.losersThroughRound) return true;
        }
        return (
          rule.finals.includes("third-place") &&
          canMeetInThirdPlace(size, byes, a, first, b, second)
        );
      },
    },
  };
}
