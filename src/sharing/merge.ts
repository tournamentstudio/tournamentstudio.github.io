import type { Match, Tournament } from "../domain/types";
import { reconcileRouteNetwork } from "../scheduling/route-network";
import { validateTournament } from "../domain/validate";
import { getCorrectionImpact, recordResult } from "../engine";
import { canonicalize } from "../security/codec";
import { applyPatch, hashDocument, type TournamentPatch } from "./index";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import {
  readPlayerStatistics,
  reconcilePlayerStatistics,
} from "../players/model";

export interface PatchReviewEntry {
  index: number;
  path: string;
  status: "compatible" | "conflict" | "unchanged" | "blocked";
  reason: string;
  before: unknown;
  local: unknown;
  incoming: unknown;
}
export interface PatchReview {
  currentHash: string;
  entries: PatchReviewEntry[];
  target: Tournament;
}
export interface SelectivePatchPreview {
  tournament: Tournament;
  affected: { id: string; label: string; status: string }[];
  selected: number[];
  currentHash: string;
}

const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right) ||
  (left !== undefined &&
    right !== undefined &&
    canonicalize(left) === canonicalize(right));
function valueAt(document: Tournament, path: string[]): unknown {
  const value = (document as unknown as Record<string, unknown>)[path[0]];
  return path.length === 1
    ? value
    : (value as { id: string }[]).find((entry) => entry.id === path[1]);
}
function matchShape(match: Match) {
  return {
    id: match.id,
    stageId: match.stageId,
    round: match.round,
    index: match.index,
    bracket: match.bracket,
    group: match.group,
    slots: match.slots.map((slot) =>
      slot.source
        ? { source: slot.source }
        : { participantId: slot.participantId },
    ),
  };
}
const matchFields = [
  "notes",
  "referee",
  "scheduledAt",
  "resourceId",
  "durationMinutes",
  "hands",
  "private",
] as const;
const participantFields = [
  "name",
  "shortName",
  "logo",
  "region",
  "organization",
  "roster",
  "tags",
  "checkedIn",
] as const;
const safeScalars = new Set([
  "title",
  "subtitle",
  "description",
  "slug",
  "locale",
  "timezone",
  "theme",
  "presentation",
  "schedule",
]);

function blockedReason(
  current: Tournament,
  base: Tournament,
  target: Tournament,
  operation: TournamentPatch["operations"][number],
): string | undefined {
  const [field, id] = operation.path;
  if (["updatedAt", "history", "metadata", "status"].includes(field))
    return "local-history";
  if (field === "matches") {
    if (!id || operation.op !== "set") return "match-structure";
    const before = base.matches.find((match) => match.id === id);
    const incoming = target.matches.find((match) => match.id === id);
    const local = current.matches.find((match) => match.id === id);
    if (
      !before ||
      !incoming ||
      !local ||
      !equal(matchShape(before), matchShape(incoming)) ||
      !equal(matchShape(local), matchShape(incoming))
    )
      return "match-structure";
    if (!equal(before.result, incoming.result))
      return incoming.result ? undefined : "result-removal";
    if (matchFields.some((key) => !equal(before[key], incoming[key])))
      return undefined;
    return "derived-match";
  }
  if (field === "stages" && current.matches.length) {
    if (!id || operation.op !== "set") return "stage-structure";
    const before = base.stages.find((stage) => stage.id === id);
    const incoming = target.stages.find((stage) => stage.id === id);
    if (!before || !incoming) return "stage-structure";
    const omit = ({
      name: _name,
      status: _status,
      metadata: _metadata,
      ...stage
    }: Tournament["stages"][number]) => stage;
    if (!equal(omit(before), omit(incoming))) return "stage-structure";
    return before.name !== incoming.name ? undefined : "derived-stage";
  }
  if (field === "participants" && current.matches.length) {
    if (!id || operation.op !== "set") return "participant-structure";
    const before = base.participants.find(
      (participant) => participant.id === id,
    );
    const incoming = target.participants.find(
      (participant) => participant.id === id,
    );
    if (!before || !incoming) return "participant-structure";
    const strip = (value: typeof before) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) => !(participantFields as readonly string[]).includes(key),
        ),
      );
    if (!equal(strip(before), strip(incoming))) return "participant-structure";
    return undefined;
  }
  if (
    ["sport", "rules"].includes(field) &&
    current.matches.some(tournamentMatchEvidence(current))
  )
    return "played-rules";
  if (
    !safeScalars.has(field) &&
    !["sport", "rules", "participants", "stages"].includes(field)
  )
    return "unsupported-path";
  return undefined;
}

export async function reviewPatch(
  currentInput: Tournament,
  baseInput: Tournament,
  patch: TournamentPatch,
): Promise<PatchReview> {
  const current = validateTournament(currentInput);
  const base = validateTournament(baseInput);
  if (current.id !== patch.tournamentId)
    throw new Error("This update belongs to a different tournament.");
  const applied = current.metadata.appliedSelectivePatches;
  if (Array.isArray(applied) && applied.includes(patch.id))
    throw new Error("This update was already reviewed and merged.");
  const target = await applyPatch(base, patch);
  const currentHash = await hashDocument(current);
  if (currentHash === patch.targetHash)
    throw new Error("This update was already applied.");
  const entries = patch.operations.map((operation, index): PatchReviewEntry => {
    const before = valueAt(base, operation.path),
      local = valueAt(current, operation.path),
      incoming = valueAt(target, operation.path);
    const reason = blockedReason(current, base, target, operation);
    const status = equal(local, incoming)
      ? "unchanged"
      : reason
        ? "blocked"
        : equal(local, before)
          ? "compatible"
          : "conflict";
    return {
      index,
      path: operation.path.join(" / "),
      status,
      reason: reason ?? "",
      before,
      local,
      incoming,
    };
  });
  return { currentHash, entries, target };
}

export async function previewSelectivePatch(
  current: Tournament,
  base: Tournament,
  patch: TournamentPatch,
  selected: number[],
): Promise<SelectivePatchPreview> {
  const review = await reviewPatch(current, base, patch);
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (index) =>
        !Number.isInteger(index) ||
        !review.entries[index] ||
        ["blocked", "unchanged"].includes(review.entries[index].status),
    )
  )
    throw new Error("Choose permitted changes from this update.");
  let next = structuredClone(current);
  const affected = new Map<
    string,
    { id: string; label: string; status: string }
  >();
  const matchOperations = selected.filter(
    (index) => patch.operations[index].path[0] === "matches",
  );
  for (const index of selected.filter(
    (value) => !matchOperations.includes(value),
  )) {
    const operation = patch.operations[index],
      [field, id] = operation.path;
    const incoming = valueAt(review.target, operation.path);
    if (!id)
      (next as unknown as Record<string, unknown>)[field] =
        structuredClone(incoming);
    else {
      const collection = (next as unknown as Record<string, unknown>)[
        field
      ] as { id: string }[];
      const position = collection.findIndex((entry) => entry.id === id);
      if (position < 0)
        throw new Error("A selected change refers to a missing local entity.");
      if (field === "stages" && current.matches.length) {
        (collection[position] as Tournament["stages"][number]).name = (
          incoming as Tournament["stages"][number]
        ).name;
      } else if (field === "participants" && current.matches.length) {
        const target = incoming as Tournament["participants"][number];
        const before = valueAt(
          base,
          operation.path,
        ) as Tournament["participants"][number];
        const output = collection[position] as unknown as Record<
          string,
          unknown
        >;
        for (const key of participantFields)
          if (!equal(before[key], target[key])) {
            if (target[key] === undefined) delete output[key];
            else output[key] = structuredClone(target[key]);
          }
      } else if (operation.op === "remove") collection.splice(position, 1);
      else collection[position] = structuredClone(incoming) as { id: string };
    }
  }
  // Resolve incoming results in dependency order so downstream slots come from the engine.
  const pending = [...matchOperations];
  while (pending.length) {
    const readyIndex = pending.findIndex((index) => {
      const id = patch.operations[index].path[1];
      const match = next.matches.find((item) => item.id === id);
      if (!match) return false;
      const before = base.matches.find((item) => item.id === id)!;
      const incoming = review.target.matches.find((item) => item.id === id)!;
      if (equal(before.result, incoming.result)) return true;
      return (
        match.status !== "pending" &&
        !pending.some(
          (other) =>
            other !== index &&
            next.matches.some(
              (item) => item.id === patch.operations[other].path[1],
            ) &&
            getCorrectionImpact(next, patch.operations[other].path[1]).some(
              (item) => item.id === id,
            ),
        )
      );
    });
    if (readyIndex < 0)
      throw new Error(
        "Selected results need an upstream result or a different stage structure. Keep the local copy or import a full snapshot as a fork.",
      );
    const index = pending.splice(readyIndex, 1)[0],
      id = patch.operations[index].path[1];
    const incoming = review.target.matches.find((match) => match.id === id)!;
    const before = base.matches.find((match) => match.id === id)!;
    const local = next.matches.find((match) => match.id === id)!;
    if (!equal(before.result, incoming.result)) {
      if (
        !incoming.result ||
        !equal(
          local.slots.map((slot) => slot.participantId),
          incoming.slots.map((slot) => slot.participantId),
        )
      )
        throw new Error(
          "The selected result has different entrants from the local match.",
        );
      if (local.result) {
        const hasEvidence = tournamentMatchEvidence(next);
        for (const match of getCorrectionImpact(next, id)) {
          if (hasEvidence(match))
            affected.set(match.id, {
              id: match.id,
              label: match.label,
              status: match.status,
            });
        }
      }
      next = recordResult(next, id, incoming.result, true);
    }
    const result = next.matches.find(
      (match) => match.id === id,
    )! as unknown as Record<string, unknown>;
    for (const key of matchFields)
      if (!equal(before[key], incoming[key])) {
        if (incoming[key] === undefined) delete result[key];
        else result[key] = structuredClone(incoming[key]);
      }
  }
  next.metadata.appliedSelectivePatches = [
    ...(Array.isArray(current.metadata.appliedSelectivePatches)
      ? current.metadata.appliedSelectivePatches.filter(
          (value) => typeof value === "string",
        )
      : []),
    patch.id,
  ].slice(-500);
  next = reconcilePlayerStatistics(
    current,
    reconcileRouteNetwork(current, next),
  );
  const priorEvents = new Map(
    readPlayerStatistics(current).events.map((event) => [event.id, event]),
  );
  for (const event of readPlayerStatistics(next).events) {
    if (
      event.status !== "quarantined" ||
      priorEvents.get(event.id)?.status !== "active"
    )
      continue;
    const match = current.matches.find((item) => item.id === event.matchId);
    affected.set(event.matchId, {
      id: event.matchId,
      label: match?.label ?? event.matchLabel,
      status: match?.status ?? "pending",
    });
  }
  return {
    tournament: validateTournament(next),
    affected: [...affected.values()],
    selected: [...selected],
    currentHash: review.currentHash,
  };
}
