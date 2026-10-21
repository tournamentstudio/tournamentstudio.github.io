import type {
  GroupDrawIssue,
  KnockoutVenueTarget,
  Match,
  Participant,
  Stage,
  Tournament,
} from "../domain/types";
import {
  isKnockoutVenueTarget,
  knockoutVenueTargetKey,
} from "../domain/knockout-venue";
import { locationSchema } from "../domain/geography";
import { knockoutDrawErrors } from "../domain/knockout-draw";
import { singleElimination } from "./elimination";
import { greatCircleDistanceKm } from "./geographic-distance";

export { knockoutVenueTargetKey };

function syntheticBracket(stage: Stage, count: number): Match[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, count)));
  const ids = Array.from({ length: size }, (_, index) => `venue-slot-${index}`);
  return singleElimination(
    stage,
    ids,
    stage.format === "double-elimination",
    ids.map((participantId, index) => ({ participantId, slot: index + 1 })),
  );
}

export function getKnockoutVenueTargets(
  stage: Stage,
  entrantCount: number,
): KnockoutVenueTarget[] {
  if (
    entrantCount < 2 ||
    entrantCount > 512 ||
    !["single-elimination", "double-elimination"].includes(stage.format)
  )
    return [];
  return syntheticBracket(stage, entrantCount)
    .map(({ bracket, round, index }) => ({ bracket: bracket!, round, index }))
    .filter((target) => isKnockoutVenueTarget(stage, entrantCount, target));
}

export function assignedKnockoutVenue(
  stage: Stage,
  match: Pick<Match, "bracket" | "round" | "index">,
): string | undefined {
  const draw = stage.config.knockoutDraw;
  if (draw?.version !== 6) return undefined;
  const key = knockoutVenueTargetKey(match);
  return draw.venueRules.find((rule) =>
    rule.targets.some((target) => knockoutVenueTargetKey(target) === key),
  )?.resourceId;
}

/** Variant 2 * opening match is a playing entrant; the next variant has a BYE. */
export function knockoutVenueReachability(
  stage: Stage,
  count: number,
): Map<string, Set<number>> {
  const reachable = new Map<string, Set<number>>();
  const outputs = new Map<
    string,
    { winner: Set<number>; loser: Set<number> }
  >();
  for (const match of syntheticBracket(stage, count)) {
    const opening = match.bracket === "winners" && match.round === 1;
    const entrants = opening
      ? new Set([2 * match.index, 2 * match.index + 1])
      : new Set(
          match.slots.flatMap((slot) =>
            slot.source
              ? [
                  ...(outputs.get(slot.source.matchId)?.[slot.source.result] ??
                    []),
                ]
              : [],
          ),
        );
    reachable.set(knockoutVenueTargetKey(match), entrants);
    outputs.set(match.id, {
      winner: entrants,
      loser: opening ? new Set([2 * match.index]) : entrants,
    });
  }
  return reachable;
}

export function prepareVenueRestriction(
  tournament: Tournament,
  stage: Stage,
  participantIds: string[],
  participants: Map<string, Participant>,
  byes: Set<string>,
): { issues: GroupDrawIssue[]; allowed: Map<string, Uint8Array> } {
  const issues: GroupDrawIssue[] = [];
  const add = (code: string, ...values: string[]) =>
    issues.push({ code, values });
  const size = 2 ** Math.ceil(Math.log2(participantIds.length));
  const allowed = new Map(
    participantIds.map((id) => [id, new Uint8Array(size / 2).fill(1)]),
  );
  const draw = stage.config.knockoutDraw;
  if (draw?.version !== 6) return { issues, allowed };
  for (const id of participantIds)
    if (!locationSchema.safeParse(participants.get(id)?.location).success)
      add("missingLocation", participants.get(id)?.name ?? id);
  for (const rule of draw.venueRules) {
    if (
      rule.targets.some(
        (target) =>
          !isKnockoutVenueTarget(stage, participantIds.length, target),
      )
    )
      add("venueTarget");
    const resource = tournament.schedule.resources.find(
      (item) => item.id === rule.resourceId,
    );
    if (!resource) add("venueMissing");
    else if (!locationSchema.safeParse(resource.location).success)
      add("venueLocation", resource.name);
  }
  if (issues.length) return { issues, allowed };
  const reachable = knockoutVenueReachability(stage, participantIds.length);
  for (const rule of draw.venueRules) {
    const resource = tournament.schedule.resources.find(
      (item) => item.id === rule.resourceId,
    )!;
    const positions = new Set(
      rule.targets.flatMap((target) => [
        ...reachable.get(knockoutVenueTargetKey(target))!,
      ]),
    );
    for (const id of participantIds) {
      const distance = greatCircleDistanceKm(
        participants.get(id)!.location!,
        resource.location!,
      );
      if (
        (rule.minKm === undefined || distance >= rule.minKm) &&
        (rule.maxKm === undefined || distance <= rule.maxKm)
      )
        continue;
      const eligible = allowed.get(id)!;
      for (const variant of positions)
        if (variant % 2 === Number(byes.has(id)))
          eligible[Math.floor(variant / 2)] = 0;
    }
  }
  for (const id of participantIds)
    if (!allowed.get(id)!.some(Boolean))
      add("venueNoPosition", participants.get(id)!.name);
  return { issues, allowed };
}

/** Ignore recorded outcomes and resolved slots: protected venues cover future corrections too. */
export function reachableKnockoutEntrants(
  matches: Match[],
): Map<string, Set<string>> {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const outputs = new Map<
    string,
    { winner: Set<string>; loser: Set<string> }
  >();
  const visiting = new Set<string>();
  const visit = (match: Match): { winner: Set<string>; loser: Set<string> } => {
    const saved = outputs.get(match.id);
    if (saved) return saved;
    if (visiting.has(match.id))
      throw new Error("Venue match sources contain a cycle.");
    visiting.add(match.id);
    const slots = match.slots.map((slot) => {
      if (!slot.source)
        return new Set(slot.participantId ? [slot.participantId] : []);
      const source = byId.get(slot.source.matchId);
      if (!source) throw new Error("A venue match source is missing.");
      return visit(source)[slot.source.result];
    });
    const winner = new Set(slots.flatMap((slot) => [...slot]));
    const loser = new Set(
      [...winner].filter((id) =>
        slots.some(
          (slot, index) =>
            slot.has(id) &&
            slots.some(
              (other, otherIndex) =>
                otherIndex !== index &&
                [...other].some((opponent) => opponent !== id),
            ),
        ),
      ),
    );
    const value = { winner, loser };
    outputs.set(match.id, value);
    visiting.delete(match.id);
    return value;
  };
  return new Map(
    matches.map((match) => [
      knockoutVenueTargetKey(match),
      visit(match).winner,
    ]),
  );
}

/** Missing public coordinates are errors here, but do not prevent schema imports or scoring. */
export function validateKnockoutVenueDistances(
  tournament: Tournament,
  stage: Stage,
): GroupDrawIssue[] {
  const draw = stage.config.knockoutDraw;
  if (draw?.version !== 6) return [];
  const issues = knockoutDrawErrors(tournament, stage);
  if (issues.length) return issues;
  const matches = tournament.matches.filter(
    (match) => match.stageId === stage.id,
  );
  let reachable: Map<string, Set<string>>;
  try {
    reachable = reachableKnockoutEntrants(matches);
  } catch {
    return [{ code: "venueTarget", values: [] }];
  }
  const participants = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  );
  const missing = new Set<string>();
  for (const rule of draw.venueRules) {
    const resource = tournament.schedule.resources.find(
      (item) => item.id === rule.resourceId,
    );
    if (!resource) {
      issues.push({ code: "venueMissing", values: [] });
      continue;
    }
    if (!locationSchema.safeParse(resource.location).success) {
      issues.push({ code: "venueLocation", values: [resource.name] });
      continue;
    }
    const ids = new Set<string>();
    for (const target of rule.targets) {
      const entrants = reachable.get(knockoutVenueTargetKey(target));
      if (!entrants) issues.push({ code: "venueTarget", values: [] });
      else entrants.forEach((id) => ids.add(id));
    }
    for (const id of ids) {
      const participant = participants.get(id);
      if (!locationSchema.safeParse(participant?.location).success) {
        if (!missing.has(id))
          issues.push({
            code: "missingLocation",
            values: [participant?.name ?? id],
          });
        missing.add(id);
        continue;
      }
      const distance = greatCircleDistanceKm(
        participant!.location!,
        resource.location!,
      );
      if (
        (rule.minKm !== undefined && distance < rule.minKm) ||
        (rule.maxKm !== undefined && distance > rule.maxKm)
      )
        issues.push({
          code: "venueDistance",
          values: [
            participant!.name,
            resource.name,
            String(Number(distance.toFixed(6))),
          ],
        });
    }
  }
  return issues;
}
