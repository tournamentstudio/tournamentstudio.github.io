import type {
  AdvancementCandidate,
  AdvancementMetrics,
  AdvancementPreview,
  AdvancementSourcePreview,
  Stage,
  Standing,
  Tournament,
  WildcardTieBreaker,
} from "../domain/types";
import { advancementErrors, sourceGroups } from "../domain/advancement";
import { getStandings } from "../standings";
import { matchResultQualifiers } from "./match-qualifiers";

function metrics(row: Standing): AdvancementMetrics {
  return {
    played: row.played,
    points: row.points,
    wins: row.wins,
    differential: row.differential,
    scored: row.scored,
  };
}

function candidate(row: Standing, group?: string): AdvancementCandidate {
  const values = metrics(row);
  return {
    participantId: row.participantId,
    ...(group === undefined ? {} : { group }),
    rank: row.rank,
    selected: false,
    excluded: false,
    tied: row.tied,
    reason: "Outside the selected positions.",
    metrics: values,
    comparisonPlayed: values.played,
    compared: {
      points: values.points,
      wins: values.wins,
      differential: values.differential,
      scored: values.scored,
    },
  };
}

function choose(
  rows: AdvancementCandidate[],
  count: number,
  preview: AdvancementSourcePreview,
  manual: Set<string> | undefined,
): AdvancementCandidate[] {
  if (rows.length < count) {
    preview.issues.push(
      "The qualification count exceeds the eligible candidate count.",
    );
    return [];
  }
  const cutoff = rows[count - 1].rank;
  const fixed = rows.filter((row) => row.rank < cutoff);
  const tied = rows.filter((row) => row.rank === cutoff);
  if (fixed.length + tied.length > count) {
    const chosen = manual
      ? tied.filter((row) => manual.has(row.participantId))
      : [];
    if (chosen.length !== count - fixed.length) {
      preview.issues.push(
        "Qualification is tied at the cutoff. Resolve the source tie or select valid manual qualifiers.",
      );
      tied.forEach((row) => {
        row.reason = "Unresolved tie at the qualification cutoff.";
      });
      return fixed;
    }
    chosen.forEach((row) => {
      row.reason = "Chosen from the tied cutoff by a manual decision.";
    });
    return [...fixed, ...chosen];
  }
  return rows.slice(0, count);
}

function isActive(tournament: Tournament, id: string): boolean {
  return (
    tournament.participants.find((participant) => participant.id === id)
      ?.status === "active"
  );
}

function appendSelected(
  preview: AdvancementSourcePreview,
  chosen: AdvancementCandidate[],
): void {
  for (const row of chosen) {
    row.selected = true;
    if (!row.reason.startsWith("Chosen from"))
      row.reason = row.reason.startsWith("Compared")
        ? `Qualifies through this connection. ${row.reason}`
        : "Qualifies through this connection.";
    preview.qualifierIds.push(row.participantId);
  }
}

function directPreview(
  tournament: Tournament,
  stage: Stage,
  index: number,
  manual: Set<string> | undefined,
): AdvancementSourcePreview {
  const source = stage.sources[index];
  const previous = tournament.stages.find(
    (item) => item.id === source.stageId,
  )!;
  const preview: AdvancementSourcePreview = {
    index,
    stageId: source.stageId,
    candidates: [],
    qualifierIds: [],
    issues: [],
  };
  const groups = source.perGroup
    ? sourceGroups(tournament, previous)
    : [undefined];
  const picks =
    source.selection?.kind === "positions" ? source.selection.picks : undefined;
  for (const pick of picks ?? groups.map((group) => ({ group, rank: 0 }))) {
    const standings = getStandings(tournament, previous.id, pick.group);
    const position = pick.rank ? standings[pick.rank - 1] : undefined;
    if (pick.rank && !position) {
      preview.issues.push(
        `Finishing position ${pick.rank} is outside the source field.`,
      );
      continue;
    }
    const rows = (
      position
        ? standings.filter((row) => row.rank === position.rank)
        : standings
    ).map((row) => candidate(row, pick.group));
    preview.candidates.push(...rows);
    if (position && position.rank !== pick.rank) {
      preview.issues.push(
        `Finishing position ${pick.rank} is inside an unresolved tied rank.`,
      );
      rows.forEach((row) => {
        row.reason =
          "The requested position is inside an unresolved tied rank.";
      });
      continue;
    }
    const chosen = choose(rows, picks ? 1 : source.count, preview, manual);
    if (
      source.bracketSlots &&
      chosen.some((row) => row.tied) &&
      chosen.length > 1
    )
      preview.issues.push(
        "Resolve source ranking ties before assigning their physical bracket slots.",
      );
    appendSelected(preview, chosen);
  }
  if (previous.status !== "completed")
    preview.issues.push(
      `Complete ${previous.name} before advancing its entrants.`,
    );
  return preview;
}

function wildcardPreview(
  tournament: Tournament,
  stage: Stage,
  index: number,
  qualified: Set<string>,
  manual: Set<string> | undefined,
): AdvancementSourcePreview {
  const source = stage.sources[index];
  const selection = source.selection;
  if (selection?.kind !== "wildcard")
    throw new Error("Expected a wildcard selection.");
  const previous = tournament.stages.find(
    (item) => item.id === source.stageId,
  )!;
  const preview: AdvancementSourcePreview = {
    index,
    stageId: source.stageId,
    candidates: [],
    qualifierIds: [],
    issues: [],
  };
  const groups = selection.groups ?? sourceGroups(tournament, previous);
  const tables = groups.map((group) => ({
    group,
    rows: getStandings(tournament, previous.id, group),
  }));
  const smallest = Math.min(...tables.map((table) => table.rows.length));
  for (const { group, rows } of tables) {
    const position = rows[selection.rank - 1];
    if (!position) {
      preview.issues.push(
        `Group ${group} has no finishing position ${selection.rank}.`,
      );
      continue;
    }
    const atPosition = rows.filter((row) => row.rank === position.rank);
    if (atPosition.length !== 1) {
      preview.candidates.push(
        ...atPosition.map((row) => ({
          ...candidate(row, group),
          reason: "The source finishing position is tied.",
        })),
      );
      preview.issues.push(
        `Group ${group} has an unresolved tie at finishing position ${selection.rank}.`,
      );
      continue;
    }
    const row = candidate(position, group);
    preview.candidates.push(row);
    if (qualified.has(row.participantId)) {
      row.excluded = true;
      row.reason = "Already qualified through another connection.";
      continue;
    }
    if (!isActive(tournament, row.participantId)) {
      row.excluded = true;
      row.reason = "The participant is not active.";
      continue;
    }
    let comparisonMetrics = row.metrics;
    if (selection.comparison === "discard-bottom") {
      if (selection.rank > smallest) {
        preview.issues.push(
          "The wildcard position falls below the retained group size.",
        );
        continue;
      }
      if (rows[smallest] && rows[smallest - 1].rank === rows[smallest].rank) {
        preview.issues.push(`Group ${group} is tied at the discard boundary.`);
        continue;
      }
      const retained = new Set(
        rows.slice(0, smallest).map((entry) => entry.participantId),
      );
      const reduced = {
        ...tournament,
        matches: tournament.matches.filter(
          (match) =>
            match.stageId !== previous.id ||
            match.group !== group ||
            match.slots.every(
              (slot) => !slot.participantId || retained.has(slot.participantId),
            ),
        ),
      };
      const comparisonRow = getStandings(reduced, previous.id, group).find(
        (entry) => entry.participantId === row.participantId,
      );
      if (!comparisonRow) {
        preview.issues.push(
          `Group ${group} has no retained matches for its candidate.`,
        );
        continue;
      }
      comparisonMetrics = metrics(comparisonRow);
    }
    row.comparisonPlayed = comparisonMetrics.played;
    if (!comparisonMetrics.played) {
      preview.issues.push(
        `Group ${group} has no played matches for a wildcard comparison.`,
      );
      continue;
    }
    const divisor =
      selection.comparison === "per-match" ? comparisonMetrics.played : 1;
    for (const key of ["points", "wins", "differential", "scored"] as const)
      row.compared[key] = comparisonMetrics[key] / divisor;
    row.reason =
      selection.comparison === "discard-bottom"
        ? `Compared using matches against the top ${smallest} places in its group.`
        : selection.comparison === "per-match"
          ? "Compared using values per played match."
          : "Compared using total values.";
  }
  const seeds = new Map(
    tournament.participants.map((participant) => [
      participant.id,
      participant.seed,
    ]),
  );
  const direction = (breaker: WildcardTieBreaker) =>
    (tournament.rules.scoring === "low" ||
      tournament.rules.scoring === "time" ||
      (tournament.rules.scoring === "weighted" &&
        tournament.rules.weightedDirection === "low")) &&
    (breaker === "scored" || breaker === "differential")
      ? -1
      : 1;
  const compareValue = (
    row: AdvancementCandidate,
    breaker: WildcardTieBreaker,
  ) => {
    if (breaker === "seed") return -(seeds.get(row.participantId) ?? 0);
    return row.compared[breaker] * direction(breaker);
  };
  const compare = (a: AdvancementCandidate, b: AdvancementCandidate) => {
    for (const breaker of selection.tieBreakers) {
      let first = compareValue(a, breaker);
      let second = compareValue(b, breaker);
      if (selection.comparison === "per-match" && breaker !== "seed") {
        first = a.metrics[breaker] * b.metrics.played * direction(breaker);
        second = b.metrics[breaker] * a.metrics.played * direction(breaker);
      }
      const difference = second - first;
      if (
        Math.abs(difference) >
        Number.EPSILON * 16 * Math.max(1, Math.abs(first), Math.abs(second))
      )
        return difference;
    }
    return 0;
  };
  const eligible = preview.candidates.filter((row) => !row.excluded);
  eligible.sort(
    (a, b) =>
      compare(a, b) ||
      (seeds.get(a.participantId) ?? 0) - (seeds.get(b.participantId) ?? 0) ||
      a.participantId.localeCompare(b.participantId),
  );
  let rank = 1;
  eligible.forEach((row, position) => {
    if (position && compare(eligible[position - 1], row)) rank = position + 1;
    row.tied =
      (position > 0 && compare(eligible[position - 1], row) === 0) ||
      (position < eligible.length - 1 &&
        compare(row, eligible[position + 1]) === 0);
    // The comparison rank is temporary; the preview keeps the source finishing rank.
    row.rank = rank;
  });
  if (!preview.issues.length)
    appendSelected(preview, choose(eligible, source.count, preview, manual));
  for (const row of preview.candidates) row.rank = selection.rank;
  if (previous.status !== "completed")
    preview.issues.push(
      `Complete ${previous.name} before advancing its entrants.`,
    );
  return preview;
}

/** Qualification preview is derived data and never changes the source document. */
export function previewAdvancement(
  tournament: Tournament,
  stageId: string,
): AdvancementPreview {
  const stage = tournament.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error("The destination stage does not exist.");
  const issues = advancementErrors(tournament, stage);
  const result: AdvancementPreview = {
    ready: false,
    issues,
    participantIds: [],
    sources: [],
    bracketSlots: [],
  };
  if (issues.length) return result;
  if (!stage.sources.length) {
    result.participantIds = [...stage.participantIds];
    result.ready = true;
    return result;
  }
  const override = stage.config.manualQualifiers;
  const manual =
    Array.isArray(override) && override.every((id) => typeof id === "string")
      ? new Set(override as string[])
      : undefined;
  if (
    override !== undefined &&
    (!manual || manual.size !== (override as unknown[]).length)
  ) {
    result.issues.push(
      "Manual qualifiers must be a list of distinct participant identifiers.",
    );
    return result;
  }
  const previews = new Map<number, AdvancementSourcePreview>();
  const qualified = new Set<string>();
  const order = stage.sources
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number(stage.sources[a].selection?.kind === "wildcard") -
        Number(stage.sources[b].selection?.kind === "wildcard"),
    );
  for (const index of order) {
    const source = stage.sources[index];
    const preview =
      source.selection?.kind === "match-results"
        ? (() => {
            const selected = matchResultQualifiers(tournament, source.stageId, source.selection.picks, source.count);
            return {
              index, stageId: source.stageId, candidates: [],
              qualifierIds: selected.participantIds, issues: selected.issues,
            } satisfies AdvancementSourcePreview;
          })()
        : source.selection?.kind === "wildcard"
        ? wildcardPreview(tournament, stage, index, qualified, manual)
        : directPreview(tournament, stage, index, manual);
    for (const id of preview.qualifierIds) {
      if (qualified.has(id))
        preview.issues.push(
          "An entrant qualifies more than once. Adjust the connections.",
        );
      if (!isActive(tournament, id))
        preview.issues.push("A selected qualifier is not active.");
      qualified.add(id);
    }
    previews.set(index, preview);
  }
  for (let index = 0; index < stage.sources.length; index++) {
    const preview = previews.get(index)!;
    result.sources.push(preview);
    result.participantIds.push(...preview.qualifierIds);
    result.issues.push(...preview.issues);
    const slots = stage.sources[index].bracketSlots;
    if (slots && !preview.issues.length)
      preview.qualifierIds.forEach((id, offset) => {
        if (slots[offset] !== undefined)
          result.bracketSlots.push({ slot: slots[offset], participantId: id });
      });
  }
  if (
    manual &&
    (manual.size !== result.participantIds.length ||
      result.participantIds.some((id) => !manual.has(id)))
  )
    result.issues.push(
      "Manual qualifiers must retain every clear qualifier and only resolve ties within eligible positions.",
    );
  result.issues = [...new Set(result.issues)];
  result.ready = result.issues.length === 0;
  return result;
}
