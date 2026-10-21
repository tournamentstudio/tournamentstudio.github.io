import type { Tournament } from "../domain/types";
import { hasMatchEvidence } from "../engine/match-evidence";
import { assignedKnockoutVenue } from "../engine/venue-distance";
import {
  autoScheduleCore,
  detectConflictsCore,
  possibleEntrants,
} from "./index";
import {
  hasAggregateBookings,
  expandedSchedule,
  collapsedSchedule,
} from "./legs";
export interface ScheduleOptimization {
  tournament: Tournament;
  optimal: boolean;
  explored: number;
  minutes: number;
  lowerBoundMinutes: number;
}
export function optimizeSchedule(
  input: Tournament,
  maxNodes = 50000,
): ScheduleOptimization {
  if (input.matches.some(hasMatchEvidence))
    throw new Error("Optimize a schedule before play starts.");
  if (hasAggregateBookings(input)) {
    const result = optimizeScheduleCore(
      expandedSchedule(input),
      maxNodes,
      input,
    );
    return {
      ...result,
      tournament: collapsedSchedule(input, result.tournament),
    };
  }
  return optimizeScheduleCore(input, maxNodes, input);
}
function optimizeScheduleCore(
  input: Tournament,
  maxNodes: number,
  venueSource: Tournament,
): ScheduleOptimization {
  const jobs = input.matches.filter(
    (m) => m.status !== "bye" && m.status !== "canceled",
  );
  if (!jobs.length || jobs.length > 10 || input.schedule.resources.length > 4)
    throw new Error(
      "Exact schedule search supports 1 to 10 matches and at most 4 venues.",
    );
  if (input.matches.some(hasMatchEvidence))
    throw new Error("Optimize a schedule before play starts.");
  const start = Date.parse(input.schedule.startAt),
    rest = input.schedule.restMinutes * 60000;
  if (!Number.isFinite(start) || !input.schedule.resources.length)
    throw new Error("Choose a valid schedule start and at least one venue.");
  const possible = possibleEntrants(input);
  const index = new Map(input.matches.map((m) => [m.id, m]));
  const jobIds = new Set(jobs.map((m) => m.id));
  function sources(id: string, seen = new Set<string>()): string[] {
    if (seen.has(id)) throw new Error("Cyclic schedule dependency.");
    if (jobIds.has(id)) return [id];
    const m = index.get(id);
    if (!m) throw new Error("Missing schedule dependency.");
    const next = new Set(seen).add(id);
    return m.slots.flatMap((s) =>
      s.source ? sources(s.source.matchId, next) : [],
    );
  }
  const data = jobs.map((match) => {
    const stage = input.stages.find((s) => s.id === match.stageId)!;
    const deps = [
      ...match.slots.flatMap((s) =>
        s.source ? sources(s.source.matchId) : [],
      ),
      ...stage.sources.flatMap((s) =>
        s.selection?.kind === "match-results"
          ? s.selection.picks.flatMap((p) => sources(p.matchId))
          : input.matches
              .filter((m) => m.stageId === s.stageId)
              .flatMap((m) => sources(m.id)),
      ),
    ];
    const entrants = [...possible.get(match.id)!];
    return {
      match,
      deps: [...new Set(deps)],
      entrants,
      duration: (match.durationMinutes ?? input.schedule.matchMinutes) * 60000,
      fixed: assignedKnockoutVenue(stage, match),
    };
  });
  let best: Tournament | undefined;
  let bestEnd = Infinity;
  let explored = 0;
  let limited = false;
  try {
    best = autoScheduleCore(input, input.locale, venueSource);
    bestEnd = Math.max(
      ...best.matches
        .filter((m) => m.scheduledAt)
        .map(
          (m) =>
            Date.parse(m.scheduledAt!) +
            (m.durationMinutes ?? input.schedule.matchMinutes) * 60000,
        ),
    );
  } catch {
    /* The search can find a resource order that a greedy pass misses. */
  }
  const lowerBound = Math.max(
    data.reduce((n, j) => n + j.duration, 0) / input.schedule.resources.length,
    ...input.participants.map((p) => {
      const relevant = data.filter((j) => j.entrants.includes(p.id));
      return (
        relevant.reduce((n, j) => n + j.duration, 0) +
        Math.max(0, relevant.length - 1) * rest
      );
    }),
  );
  const chosen = new Map<
    string,
    { at: number; resourceId: string; end: number }
  >();
  const resourceEnds = new Map<string, number>();
  const personEnds = new Map<string, number>();
  const refereeEnds = new Map<string, number>();
  function visit(currentEnd: number) {
    if (bestEnd - start <= lowerBound + 1e-6) return;
    if (explored >= maxNodes) {
      limited = true;
      return;
    }
    explored++;
    if (currentEnd >= bestEnd) return;
    if (chosen.size === data.length) {
      const doc = structuredClone(input);
      for (const m of doc.matches) {
        const c = chosen.get(m.id);
        if (c) {
          m.scheduledAt = new Date(c.at).toISOString();
          m.resourceId = c.resourceId;
        } else {
          delete m.scheduledAt;
        }
      }
      if (!detectConflictsCore(doc, doc.locale, venueSource).length) {
        best = doc;
        bestEnd = currentEnd;
      }
      return;
    }
    for (const job of data) {
      if (chosen.has(job.match.id) || job.deps.some((id) => !chosen.has(id)))
        continue;
      const people = job.entrants.map((id) =>
        input.participants.find((p) => p.id === id)!,
      );
      for (const resource of input.schedule.resources) {
        if (job.fixed && job.fixed !== resource.id) continue;
        const at = Math.max(
          start,
          resourceEnds.get(resource.id) ?? start,
          resource.availableFrom ? Date.parse(resource.availableFrom) : start,
          ...job.deps.map((id) => chosen.get(id)!.end + rest),
          ...job.entrants.map(
            (id) => (personEnds.get(id) ?? start - rest) + rest,
          ),
          ...people.map((p) =>
            typeof p.metadata.availableFrom === "string"
              ? Date.parse(p.metadata.availableFrom)
              : start,
          ),
          job.match.referee
            ? (refereeEnds.get(job.match.referee) ?? start)
            : start,
        );
        const end = at + job.duration;
        if (
          !Number.isFinite(end) ||
          end >= bestEnd ||
          (resource.availableUntil &&
            end > Date.parse(resource.availableUntil)) ||
          people.some(
            (p) =>
              typeof p.metadata.availableUntil === "string" &&
              end > Date.parse(p.metadata.availableUntil),
          )
        )
          continue;
        const previousResource = resourceEnds.get(resource.id);
        const previousPeople = job.entrants.map((id) => personEnds.get(id));
        const previousRef = job.match.referee
          ? refereeEnds.get(job.match.referee)
          : undefined;
        chosen.set(job.match.id, { at, end, resourceId: resource.id });
        resourceEnds.set(resource.id, end);
        job.entrants.forEach((id) => personEnds.set(id, end));
        if (job.match.referee) refereeEnds.set(job.match.referee, end);
        visit(Math.max(currentEnd, end));
        chosen.delete(job.match.id);
        if (previousResource === undefined) resourceEnds.delete(resource.id);
        else resourceEnds.set(resource.id, previousResource);
        job.entrants.forEach((id, i) => {
          if (previousPeople[i] === undefined) personEnds.delete(id);
          else personEnds.set(id, previousPeople[i]!);
        });
        if (job.match.referee) {
          if (previousRef === undefined) refereeEnds.delete(job.match.referee);
          else refereeEnds.set(job.match.referee, previousRef);
        }
        if (limited || bestEnd - start <= lowerBound + 1e-6) return;
      }
    }
  }
  visit(start);
  if (!best)
    throw new Error(
      limited
        ? "Schedule search stopped before finding a valid plan. Simplify the constraints."
        : "No schedule fits these availability and rest constraints.",
    );
  return {
    tournament: best,
    optimal: !limited,
    explored,
    minutes: (bestEnd - start) / 60000,
    lowerBoundMinutes: lowerBound / 60000,
  };
}
