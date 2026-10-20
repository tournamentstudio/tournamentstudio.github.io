import type { Match, Standing, TieBreaker, Tournament } from "../domain/types";

export function getStandings(
  tournament: Tournament,
  stageId?: string,
  group?: string,
): Standing[] {
  const stage = tournament.stages.find((value) => value.id === stageId);
  const matches = tournament.matches.filter(
    (match) =>
      (!stageId || match.stageId === stageId) &&
      (!group || match.group === group),
  );
  const groupIds = group
    ? new Set(
        matches.flatMap((match) =>
          match.slots.flatMap((slot) =>
            slot.participantId ? [slot.participantId] : [],
          ),
        ),
      )
    : undefined;
  const ids = (
    stage
      ? stage.participantIds
      : tournament.participants.map((participant) => participant.id)
  ).filter((id) => !groupIds || groupIds.has(id));
  const rows = new Map<string, Standing>(
    ids.map((participantId) => [
      participantId,
      {
        participantId,
        rank: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scored: 0,
        conceded: 0,
        differential: 0,
        points: 0,
        buchholz: 0,
        medianBuchholz: 0,
        sonnebornBerger: 0,
        tied: false,
      },
    ]),
  );
  const opponents = new Map<string, { id: string; factor: number }[]>();
  const rules = tournament.rules;
  const rankedFormats = new Set(["free-for-all", "grand-prix", "time-trial"]);
  for (const match of matches) {
    if (!match.result) continue;
    const stageFormat = tournament.stages.find(
      (value) => value.id === match.stageId,
    )?.format;
    if (match.status === "bye") {
      if (stageFormat === "swiss") {
        const row = rows.get(match.result.winnerIds[0]);
        if (row) row.points += rules.pointsWin;
      }
      continue;
    }
    if (match.status !== "completed") continue;
    const result = match.result;
    const placements =
      result.placements ??
      result.scores.map(
        (score) =>
          1 +
          result.scores.filter((other) => {
            return stageFormat === "time-trial" ||
              rules.scoring === "low" ||
              rules.scoring === "time"
              ? other < score
              : other > score;
          }).length,
      );
    match.slots.forEach((slot, index) => {
      if (!slot.participantId) return;
      const row = rows.get(slot.participantId);
      if (!row) return;
      const won = result.winnerIds.includes(slot.participantId);
      const draw =
        result.outcome === "draw" || (result.winnerIds.length > 1 && won);
      row.played++;
      if (draw) row.draws++;
      else if (won) row.wins++;
      else row.losses++;
      row.scored += result.scores[index] ?? 0;
      row.conceded += result.scores
        .filter((_, position) => position !== index)
        .reduce((sum, score) => sum + score, 0);
      row.differential = row.scored - row.conceded;
      if (
        rankedFormats.has(stageFormat ?? "") ||
        rules.scoring === "placement"
      ) {
        const rank = placements[index];
        const ties = placements.filter((value) => value === rank).length;
        let awarded = 0;
        for (let offset = 0; offset < ties; offset++)
          awarded += rules.placementPoints[rank - 1 + offset] ?? 0;
        row.points += awarded / ties;
      } else {
        row.points += draw
          ? rules.pointsDraw
          : won
            ? rules.pointsWin
            : rules.pointsLoss;
      }
      const history = opponents.get(slot.participantId) ?? [];
      for (const other of match.slots) {
        if (other.participantId && other.participantId !== slot.participantId)
          history.push({
            id: other.participantId,
            factor: draw ? 0.5 : won ? 1 : 0,
          });
      }
      opponents.set(slot.participantId, history);
    });
  }
  for (const row of rows.values()) {
    const participant = tournament.participants.find(
      (value) => value.id === row.participantId,
    );
    const adjustment = participant?.metadata.pointsAdjustment;
    if (typeof adjustment === "number" && Number.isFinite(adjustment))
      row.points += adjustment;
  }
  for (const row of rows.values()) {
    const history = opponents.get(row.participantId) ?? [];
    const values = history
      .map((opponent) => rows.get(opponent.id)?.points ?? 0)
      .sort((a, b) => a - b);
    row.buchholz = values.reduce((sum, value) => sum + value, 0);
    row.medianBuchholz = (
      values.length > 2 ? values.slice(1, -1) : values
    ).reduce((sum, value) => sum + value, 0);
    row.sonnebornBerger = history.reduce(
      (sum, opponent) =>
        sum + (rows.get(opponent.id)?.points ?? 0) * opponent.factor,
      0,
    );
  }
  const seeds = new Map(
    tournament.participants.map((participant) => [
      participant.id,
      participant.seed,
    ]),
  );
  const valueFor = (row: Standing, breaker: TieBreaker): number => {
    if (breaker === "buchholz") return row.buchholz;
    if (breaker === "median-buchholz") return row.medianBuchholz;
    if (breaker === "sonneborn-berger") return row.sonnebornBerger;
    if (breaker === "seed") return -(seeds.get(row.participantId) ?? 0);
    if (breaker === "head-to-head") return 0;
    if (
      (breaker === "scored" || breaker === "differential") &&
      (stage?.format === "time-trial" ||
        rules.scoring === "low" ||
        rules.scoring === "time")
    )
      return -row[breaker];
    return row[breaker];
  };
  let buckets = [[...rows.values()]];
  for (const breaker of rules.tieBreakers) {
    buckets = buckets.flatMap((bucket) => {
      const headToHead =
        breaker === "head-to-head"
          ? miniLeague(
              matches,
              new Set(bucket.map((row) => row.participantId)),
              rules.pointsWin,
              rules.pointsDraw,
              rules.pointsLoss,
            )
          : undefined;
      const grouped = new Map<number, Standing[]>();
      for (const row of bucket) {
        const value = headToHead
          ? (headToHead.get(row.participantId) ?? 0)
          : valueFor(row, breaker);
        grouped.set(value, [...(grouped.get(value) ?? []), row]);
      }
      return [...grouped.entries()]
        .sort(([a], [b]) => b - a)
        .map(([, values]) => values);
    });
  }
  const eliminationFormats = new Set([
    "single-elimination",
    "double-elimination",
    "triple-elimination",
    "gauntlet",
  ]);
  if (
    stage &&
    eliminationFormats.has(stage.format) &&
    stage.status === "completed"
  ) {
    const championId = stage.metadata.championId;
    const losses = new Map<string, number>();
    for (const match of matches) {
      if (
        match.status !== "completed" ||
        !match.result ||
        match.bracket === "placement"
      )
        continue;
      for (const slot of match.slots) {
        if (
          slot.participantId &&
          !match.result.winnerIds.includes(slot.participantId)
        )
          losses.set(slot.participantId, match.round);
      }
    }
    const grouped = new Map<number, Standing[]>();
    for (const row of rows.values()) {
      const value =
        row.participantId === championId
          ? Number.MAX_SAFE_INTEGER
          : (losses.get(row.participantId) ?? -1);
      grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
    buckets = [...grouped.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, values]) => values);
    const placement = matches.find(
      (match) =>
        match.bracket === "placement" &&
        match.result &&
        match.status === "completed",
    );
    if (placement?.result) {
      const winnerId = placement.result.winnerIds[0];
      buckets = buckets.flatMap((bucket) =>
        bucket.some((row) => row.participantId === winnerId) &&
        bucket.length === 2
          ? [
              bucket.filter((row) => row.participantId === winnerId),
              bucket.filter((row) => row.participantId !== winnerId),
            ]
          : [bucket],
      );
    }
  }
  if (stage?.format === "ladder" && Array.isArray(stage.metadata.ladderOrder)) {
    buckets = (stage.metadata.ladderOrder as string[]).flatMap((id) =>
      rows.has(id) ? [[rows.get(id)!]] : [],
    );
  }
  if (stage?.format === "gsl") {
    const groupMatches = matches.filter(
      (match) => match.group === group || !group,
    );
    const qualifiers = groupMatches
      .filter(
        (match) =>
          match.metadata.qualifier === 1 || match.metadata.qualifier === 2,
      )
      .sort(
        (a, b) => Number(a.metadata.qualifier) - Number(b.metadata.qualifier),
      );
    const qualified = qualifiers.flatMap((match) =>
      match.status === "completed" || match.status === "bye"
        ? (match.result?.winnerIds ?? [])
        : [],
    );
    if (qualified.length) {
      const set = new Set(qualified);
      buckets = [
        ...qualified.flatMap((id) => (rows.has(id) ? [[rows.get(id)!]] : [])),
        ...buckets
          .map((bucket) => bucket.filter((row) => !set.has(row.participantId)))
          .filter((bucket) => bucket.length),
      ];
    }
  }
  let offset = 0;
  return buckets.flatMap((bucket) => {
    const rank = offset + 1;
    offset += bucket.length;
    return bucket
      .sort(
        (a, b) =>
          (seeds.get(a.participantId) ?? 0) -
            (seeds.get(b.participantId) ?? 0) ||
          a.participantId.localeCompare(b.participantId),
      )
      .map((row) => ({ ...row, rank, tied: bucket.length > 1 }));
  });
}

function miniLeague(
  matches: Match[],
  ids: Set<string>,
  win: number,
  draw: number,
  loss: number,
): Map<string, number> {
  const points = new Map<string, number>();
  for (const match of matches) {
    if (
      match.status !== "completed" ||
      !match.result ||
      match.slots.length !== 2 ||
      !match.slots.every(
        (slot) => slot.participantId && ids.has(slot.participantId),
      )
    )
      continue;
    for (const slot of match.slots) {
      const id = slot.participantId!;
      points.set(
        id,
        (points.get(id) ?? 0) +
          (match.result.outcome === "draw"
            ? draw
            : match.result.winnerIds.includes(id)
              ? win
              : loss),
      );
    }
  }
  return points;
}
