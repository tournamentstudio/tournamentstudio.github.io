import { z } from "zod";
import type {
  GroupDrawIssue,
  KnockoutDrawPreview,
  KnockoutVenueRule,
  Tournament,
} from "../domain/types";
import { locationSchema, MAX_DISTANCE_KM } from "../domain/geography";
import { knockoutDrawSchema } from "../domain/knockout-draw";
import { knockoutVenueTargetSchema } from "../domain/knockout-venue";
import { greatCircleDistanceKm } from "./geographic-distance";
import { previewKnockoutDraw } from "./knockout-draw";
import {
  getKnockoutVenueTargets,
  knockoutVenueReachability,
  knockoutVenueTargetKey,
} from "./venue-distance";
import type {
  AutomaticVenueAssignment,
  AutomaticVenueDraw,
  AutomaticVenueOptions,
  AutomaticVenuePreview,
  AutomaticVenueRequest,
} from "./automatic-venue-contract";

export * from "./automatic-venue-contract";

export const AUTOMATIC_VENUE_ALGORITHM =
  "knockout-venue-assignment-haversine-v1";
export const AUTOMATIC_VENUE_PREVIEW_LIMIT = 64;
export const AUTOMATIC_VENUE_NODE_LIMIT = 100000;
export const AUTOMATIC_VENUE_WORK_LIMIT = 20000000;

const requestSchema = z
  .object({
    resourceIds: z.array(z.string().min(1).max(160)).min(1).max(16),
    targets: z.array(knockoutVenueTargetSchema).min(1).max(1024),
    minKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
    maxKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
  })
  .strict()
  .refine((value) => value.minKm !== undefined || value.maxKm !== undefined)
  .refine(
    (value) =>
      value.minKm === undefined ||
      value.maxKm === undefined ||
      value.minKm <= value.maxKm,
  )
  .refine(
    (value) => new Set(value.resourceIds).size === value.resourceIds.length,
  )
  .refine(
    (value) =>
      new Set(value.targets.map(knockoutVenueTargetKey)).size ===
      value.targets.length,
  );

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const boundedLimit = (value: number | undefined, maximum: number) =>
  value === undefined || !Number.isFinite(value)
    ? maximum
    : Math.min(maximum, Math.max(0, Math.floor(value)));

/** Proposals become ordinary fixed v6 rules only after the organizer applies them. */
export function previewAutomaticKnockoutVenues(
  tournament: Tournament,
  stageId: string,
  request: AutomaticVenueRequest,
  options: AutomaticVenueOptions = {},
): AutomaticVenuePreview {
  let exploredAssignments = 0;
  let exploredNodes = 0;
  let exploredWork = 0;
  let exhausted = false;
  let scheduleRejected = 0;
  const result = (issueDetails: GroupDrawIssue[]): AutomaticVenuePreview => ({
    ready: false,
    assignments: [],
    issueDetails,
    exploredAssignments,
    exploredWork,
    exhausted,
    scheduleRejected,
    algorithm: AUTOMATIC_VENUE_ALGORITHM,
  });
  const error = (code: string, ...values: string[]) =>
    result([{ code, values }]);
  const stage = tournament.stages.find((item) => item.id === stageId);
  if (!stage) return error("stage");
  if (!["single-elimination", "double-elimination"].includes(stage.format))
    return error("format");
  const affected = new Set([stage.id]);
  for (let previous = -1; previous !== affected.size;) {
    previous = affected.size;
    for (const next of tournament.stages)
      if (next.sources.some((source) => affected.has(source.stageId)))
        affected.add(next.id);
  }
  if (tournament.matches.some((match) => affected.has(match.stageId)))
    return error("autoVenueLocked");
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) return error("autoVenueRequest");
  const previewLimit = boundedLimit(
    options.previewLimit,
    AUTOMATIC_VENUE_PREVIEW_LIMIT,
  );
  const nodeLimit = boundedLimit(options.nodeLimit, AUTOMATIC_VENUE_NODE_LIMIT);
  const workLimit = boundedLimit(options.workLimit, AUTOMATIC_VENUE_WORK_LIMIT);
  const workPerPreview = boundedLimit(options.workPerPreview, workLimit);
  const initial = previewKnockoutDraw(tournament, stage.id, {
    nodeLimit,
    workLimit: workPerPreview,
    onWork: (work) => {
      exploredWork += work;
    },
  });
  exploredNodes += initial.exploredNodes;
  if (!initial.ready) {
    exhausted = initial.issueDetails.some(
      (issue) => issue.code === "exhausted",
    );
    return result(initial.issueDetails);
  }
  const { minKm, maxKm } = parsed.data;
  const resourceIds = [...parsed.data.resourceIds].sort(compareIds);
  const resourceById = new Map(
    tournament.schedule.resources.map((item) => [item.id, item]),
  );
  const participantById = new Map(
    tournament.participants.map((item) => [item.id, item]),
  );
  for (const id of initial.participantIds)
    if (!locationSchema.safeParse(participantById.get(id)?.location).success)
      return error("missingLocation", participantById.get(id)?.name ?? id);
  for (const id of resourceIds) {
    const resource = resourceById.get(id);
    if (!resource) return error("venueMissing");
    if (!locationSchema.safeParse(resource.location).success)
      return error("venueLocation", resource.name);
  }
  const draw = stage.config.knockoutDraw;
  const base: AutomaticVenueDraw = {
    version: 6,
    pots: structuredClone(draw?.pots ?? []),
    restrictions: [...(draw?.restrictions ?? [])],
    protectedSeeds: draw?.protectedSeeds ?? 0,
    ...(draw?.fixedSlots ? { fixedSlots: structuredClone(draw.fixedSlots) } : {}),
    separation: structuredClone(
      draw && draw.version !== 1 ? draw.separation : [],
    ),
    losersSeparation: structuredClone(
      draw && "losersSeparation" in draw ? draw.losersSeparation : [],
    ),
    finalsSeparation: structuredClone(
      draw && "finalsSeparation" in draw ? draw.finalsSeparation : [],
    ),
    ...(draw && "distance" in draw && draw.distance
      ? { distance: structuredClone(draw.distance) }
      : {}),
    venueRules: structuredClone(draw?.version === 6 ? draw.venueRules : []),
  };
  const fixedTargets = new Set(
    base.venueRules.flatMap((rule) => rule.targets.map(knockoutVenueTargetKey)),
  );
  if (
    parsed.data.targets.some((target) =>
      fixedTargets.has(knockoutVenueTargetKey(target)),
    )
  )
    return error("autoVenueAssigned");
  if (fixedTargets.size + parsed.data.targets.length > 1024)
    return error("autoVenueRuleLimit");
  const order = new Map(
    getKnockoutVenueTargets(stage, initial.participantIds.length).map(
      (target, index) => [knockoutVenueTargetKey(target), index],
    ),
  );
  if (
    parsed.data.targets.some(
      (target) => !order.has(knockoutVenueTargetKey(target)),
    )
  )
    return error("venueTarget");
  const targets = [...parsed.data.targets].sort(
    (a, b) =>
      order.get(knockoutVenueTargetKey(a))! -
      order.get(knockoutVenueTargetKey(b))!,
  );
  const reachability = knockoutVenueReachability(
    stage,
    initial.participantIds.length,
  );
  const distances = new Map(
    initial.participantIds.map((id) => [
      id,
      new Map(
        resourceIds.map((resourceId) => [
          resourceId,
          greatCircleDistanceKm(
            participantById.get(id)!.location!,
            resourceById.get(resourceId)!.location!,
          ),
        ]),
      ),
    ]),
  );
  const candidates = (index: number, preview: KnockoutDrawPreview) => {
    const variants = reachability.get(knockoutVenueTargetKey(targets[index]))!;
    const byes = new Set(preview.byeIds);
    const entrants = preview.slots.filter(
      (id, slot): id is string =>
        id !== null &&
        variants.has(2 * Math.floor(slot / 2) + Number(byes.has(id))),
    );
    return resourceIds
      .map((resourceId) => {
        const values = entrants.map((id) =>
          distances.get(id)!.get(resourceId)!,
        );
        const low = values.length ? Math.min(...values) : 0;
        const high = values.length ? Math.max(...values) : 0;
        return {
          resourceId,
          target: targets[index],
          minDistanceKm: low,
          maxDistanceKm: high,
          entrantCount: entrants.length,
          eligible:
            !values.length ||
            ((minKm === undefined || low >= minKm) &&
              (maxKm === undefined || high <= maxKm)),
        };
      })
      .sort(
        (a, b) =>
          Number(b.eligible) - Number(a.eligible) ||
          a.maxDistanceKm - b.maxDistanceKm ||
          compareIds(a.resourceId, b.resourceId),
      );
  };
  const keyOf = (selected: Map<number, string>) =>
    JSON.stringify([...selected].sort(([a], [b]) => a - b));
  const configuration = (
    selected: Map<number, string>,
  ): AutomaticVenueDraw | undefined => {
    const rules: KnockoutVenueRule[] = structuredClone(base.venueRules);
    for (const [index, resourceId] of [...selected].sort(([a], [b]) => a - b)) {
      let rule = rules.find(
        (item) =>
          item.resourceId === resourceId &&
          item.minKm === minKm &&
          item.maxKm === maxKm,
      );
      if (!rule) {
        rule = {
          resourceId,
          ...(minKm !== undefined ? { minKm } : {}),
          ...(maxKm !== undefined ? { maxKm } : {}),
          targets: [],
        };
        rules.push(rule);
      }
      rule.targets.push({ ...targets[index] });
    }
    const proposed = { ...base, venueRules: rules };
    return knockoutDrawSchema.safeParse(proposed).success
      ? proposed
      : undefined;
  };
  if (!resourceIds.some((id) => configuration(new Map([[0, id]]))))
    return error("autoVenueRuleLimit");
  const cache = new Map<
    string,
    { draw: AutomaticVenueDraw; preview: KnockoutDrawPreview } | null
  >();
  const accepted = new Map<string, boolean>();
  const evaluate = (selected: Map<number, string>) => {
    const key = keyOf(selected);
    if (cache.has(key)) return cache.get(key)!;
    const proposed = configuration(selected);
    if (!proposed) {
      cache.set(key, null);
      return null;
    }
    if (
      exploredAssignments >= previewLimit ||
      exploredNodes >= nodeLimit ||
      exploredWork >= workLimit
    ) {
      exhausted = true;
      return null;
    }
    exploredAssignments++;
    const preview = previewKnockoutDraw(
      {
        ...tournament,
        stages: tournament.stages.map((item) =>
          item.id === stage.id
            ? { ...stage, config: { ...stage.config, knockoutDraw: proposed } }
            : item,
        ),
      },
      stage.id,
      {
        nodeLimit: Math.max(0, nodeLimit - exploredNodes),
        workLimit: Math.min(
          workPerPreview,
          Math.max(0, workLimit - exploredWork),
        ),
        onWork: (work) => {
          exploredWork += work;
        },
      },
    );
    exploredNodes += preview.exploredNodes;
    if (preview.issueDetails.some((issue) => issue.code === "exhausted"))
      exhausted = true;
    const value = preview.ready ? { draw: proposed, preview } : null;
    cache.set(key, value);
    return value;
  };
  let solution:
    | {
        draw: AutomaticVenueDraw;
        preview: KnockoutDrawPreview;
        selected: Map<number, string>;
      }
    | undefined;
  const finish = (
    selected: Map<number, string>,
    value: { draw: AutomaticVenueDraw; preview: KnockoutDrawPreview },
  ): boolean => {
    const key = keyOf(selected);
    if (!accepted.has(key)) {
      const permitted = options.accept?.(value.draw, value.preview) ?? true;
      accepted.set(key, permitted);
      if (!permitted) scheduleRejected++;
    }
    if (!accepted.get(key)) return false;
    solution = { ...value, selected: new Map(selected) };
    return true;
  };
  // Pack nearby entrant cohorts for disjoint winners blocks. The ordinary
  // draw solver still verifies every proposed position and protected path.
  const packedProposal = (): Map<number, string> | undefined => {
    if (
      !targets.every(
        (target) =>
          target.bracket === "winners" && target.round === targets[0].round,
      )
    )
      return undefined;
    const available = new Set(initial.participantIds);
    const selected = new Map<number, string>();
    for (let index = 0; index < targets.length; index++) {
      const count = candidates(index, initial)[0].entrantCount;
      const choices = resourceIds
        .map((resourceId) => {
          const entrants = [...available]
            .filter((id) => {
              const distance = distances.get(id)!.get(resourceId)!;
              return (
                (minKm === undefined || distance >= minKm) &&
                (maxKm === undefined || distance <= maxKm)
              );
            })
            .sort(
              (a, b) =>
                distances.get(a)!.get(resourceId)! -
                  distances.get(b)!.get(resourceId)! || compareIds(a, b),
            )
            .slice(0, count);
          return {
            resourceId,
            entrants,
            furthest: entrants.length
              ? distances.get(entrants.at(-1)!)!.get(resourceId)!
              : 0,
          };
        })
        .filter((choice) => choice.entrants.length === count)
        .sort(
          (a, b) =>
            a.furthest - b.furthest || compareIds(a.resourceId, b.resourceId),
        );
      if (!choices.length) return undefined;
      selected.set(index, choices[0].resourceId);
      choices[0].entrants.forEach((id) => available.delete(id));
    }
    return selected;
  };
  let triedPacking = false;
  const search = (
    selected: Map<number, string>,
    preview: KnockoutDrawPreview,
  ): boolean => {
    const remaining = targets
      .map((_, index) => index)
      .filter((index) => !selected.has(index));
    const ranked = remaining.map((index) => ({
      index,
      candidates: candidates(index, preview),
    }));
    if (ranked.every((item) => item.candidates[0].eligible)) {
      const completed = new Map(selected);
      ranked.forEach((item) =>
        completed.set(item.index, item.candidates[0].resourceId),
      );
      const value = evaluate(completed);
      if (value && finish(completed, value)) return true;
    }
    if (!triedPacking) {
      triedPacking = true;
      const packed = packedProposal();
      if (packed) {
        const value = evaluate(packed);
        if (value && finish(packed, value)) return true;
      }
      // A closed preferred venue can affect every selected match. Try complete
      // alternatives before spending the search budget on one match at a time.
      if (scheduleRejected)
        for (const resourceId of resourceIds) {
          if (
            !ranked.every((item) =>
              item.candidates.some(
                (candidate) =>
                  candidate.resourceId === resourceId && candidate.eligible,
              ),
            )
          )
            continue;
          const alternative = new Map(selected);
          ranked.forEach((item) => alternative.set(item.index, resourceId));
          const value = evaluate(alternative);
          if (value && finish(alternative, value)) return true;
        }
    }
    if (
      !remaining.length ||
      exploredAssignments >= previewLimit ||
      exploredNodes >= nodeLimit ||
      exploredWork >= workLimit
    ) {
      if (remaining.length) exhausted = true;
      return false;
    }
    ranked.sort(
      (a, b) =>
        a.candidates.filter((item) => item.eligible).length -
          b.candidates.filter((item) => item.eligible).length ||
        a.index - b.index,
    );
    const chosen = ranked[0];
    for (const candidate of chosen.candidates) {
      selected.set(chosen.index, candidate.resourceId);
      const value = evaluate(selected);
      if (
        value &&
        (selected.size === targets.length
          ? finish(selected, value)
          : search(selected, value.preview))
      )
        return true;
      selected.delete(chosen.index);
      if (
        exploredAssignments >= previewLimit ||
        exploredNodes >= nodeLimit ||
        exploredWork >= workLimit
      ) {
        exhausted = true;
        break;
      }
    }
    return false;
  };
  search(new Map(), initial);
  if (!solution)
    return error(
      exhausted
        ? "autoVenueExhausted"
        : scheduleRejected
          ? "autoVenueSchedule"
          : "autoVenueInfeasible",
    );
  const assignments: AutomaticVenueAssignment[] = targets.map((_, index) => {
    const { eligible: _eligible, ...assignment } = candidates(
      index,
      solution!.preview,
    ).find((item) => item.resourceId === solution!.selected.get(index))!;
    return assignment;
  });
  return {
    ...result([]),
    ready: true,
    exhausted: false,
    draw: solution.draw,
    preview: solution.preview,
    assignments,
  };
}
