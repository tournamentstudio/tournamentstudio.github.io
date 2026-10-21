import type { Hand, Match, Rules, Tournament } from "../domain/types";
import { uid } from "../domain/types";
import {
  defaultGolAbility,
  defaultGolPolicy,
  golAbilitySchema,
  golPolicySchema,
  golElapsed,
  type GolAbility,
  type GolHandState,
  type GolPolicy,
  type GolState,
} from "../domain/gol";
import { recordResult } from "./index";

export type GolMatch = Omit<Match, "hands"> & {
  golState?: GolState;
  hands?: (Hand & { gol?: GolHandState })[];
};
export type GolRules = Omit<Rules["gol"], "cards"> & {
  policy?: GolPolicy;
  cards: (Rules["gol"]["cards"][number] & { ability?: GolAbility })[];
};
export function golClockElapsed(match: GolMatch, now = Date.now()) {
  return golElapsed(match.golState, now);
}
export function golPolicy(t: Tournament): GolPolicy {
  return golPolicySchema.parse(
    (t.rules.gol as GolRules).policy ?? defaultGolPolicy,
  );
}
export function golState(match: GolMatch): GolState {
  return (
    match.golState ?? {
      elapsedMs: 0,
      period: 0,
      overtime: "none",
      concealingTeamId: match.slots[0]?.participantId,
    }
  );
}
function ready(tournament: Tournament, matchId: string) {
  const t = structuredClone(tournament),
    match = t.matches.find((m) => m.id === matchId) as GolMatch | undefined;
  if (t.sport !== "gol-ya-pooch" || !match)
    throw new Error("Choose a Gol Ya Pooch match.");
  if (!["high", "manual"].includes(t.rules.scoring))
    throw new Error(
      "Referee hand scoring requires highest-score or manual winner rules.",
    );
  if (match.result || ["bye", "canceled"].includes(match.status))
    throw new Error(
      "The hand log is locked after confirmation. Correct official scores through quick scorekeeping.",
    );
  const ids = match.slots
    .map((s) => s.participantId)
    .filter((id): id is string => Boolean(id));
  if (ids.length !== 2 || ids[0] === ids[1])
    throw new Error("Assign two teams before recording a hand.");
  if (!["ready", "live", "postponed"].includes(match.status))
    throw new Error(
      "Resolve the match status before recording referee actions.",
    );
  return { t, match, ids };
}
export function setGolClock(
  tournament: Tournament,
  matchId: string,
  action: "start" | "pause" | "reset",
  now = Date.now(),
): Tournament {
  const { t, match } = ready(tournament, matchId),
    state = golState(match);
  match.golState = {
    ...state,
    elapsedMs: action === "reset" ? 0 : golClockElapsed(match, now),
    runningSince: action === "start" ? new Date(now).toISOString() : undefined,
  };
  if (action === "start") {
    match.status = "live";
    t.status = "in-progress";
  }
  return t;
}
export function setGolPossession(
  tournament: Tournament,
  matchId: string,
  teamId: string,
): Tournament {
  const { t, match, ids } = ready(tournament, matchId);
  if (!ids.includes(teamId))
    throw new Error("The concealing team must be in this match.");
  match.golState = { ...golState(match), concealingTeamId: teamId };
  if (match.private) delete match.private.concealedPosition;
  return t;
}
export function golDecision(
  t: Tournament,
  match: GolMatch,
  now = Date.now(),
): {
  winnerId?: string;
  expired: boolean;
  tied: boolean;
  reachedTarget: boolean;
} {
  const policy = golPolicy(t),
    state = golState(match),
    scores = match.liveScores ?? [0, 0];
  const best = Math.max(...scores),
    low = Math.min(...scores),
    tied = best === low;
  const seconds =
    state.overtime === "extra-time"
      ? policy.overtimeSeconds
      : policy.clockSeconds;
  const expired =
    state.overtime !== "sudden-death" &&
    golClockElapsed(match, now) >= seconds * 1000;
  const reachedTarget =
    best >= t.rules.targetScore && !tied && best - low >= policy.winBy;
  const qualifies =
    state.overtime === "sudden-death"
      ? !tied
      : policy.ending === "target"
        ? reachedTarget
        : policy.ending === "clock"
          ? expired && !tied
          : false;
  return {
    winnerId: qualifies
      ? match.slots[scores.indexOf(best)]?.participantId
      : undefined,
    expired,
    tied,
    reachedTarget,
  };
}
function finish(t: Tournament, match: GolMatch, winnerId: string, now: number) {
  match.golState = {
    ...golState(match),
    elapsedMs: golClockElapsed(match, now),
    runningSince: undefined,
  };
  return recordResult(t, match.id, {
    scores: match.liveScores ?? [0, 0],
    winnerIds: [winnerId],
    outcome: "played",
    recordedAt: new Date(now).toISOString(),
  });
}
export function finishGolClock(
  tournament: Tournament,
  matchId: string,
  now = Date.now(),
) {
  const { t, match } = ready(tournament, matchId),
    decision = golDecision(t, match, now);
  if (!decision.winnerId)
    throw new Error(
      "No winner meets the configured ending rule. Resolve the tie or use quick scorekeeping.",
    );
  return finish(t, match, decision.winnerId, now);
}
export function startGolOvertime(
  tournament: Tournament,
  matchId: string,
  now = Date.now(),
) {
  const { t, match } = ready(tournament, matchId),
    policy = golPolicy(t),
    current = golState(match),
    decision = golDecision(t, match, now);
  if (
    policy.ending !== "clock" ||
    !decision.expired ||
    !decision.tied ||
    policy.overtime === "manual"
  )
    throw new Error(
      "Overtime requires an expired tied clock and an agreed overtime policy.",
    );
  if (current.period >= 100)
    throw new Error("The overtime period limit has been reached.");
  match.golState = {
    ...current,
    elapsedMs: 0,
    runningSince: new Date(now).toISOString(),
    period: current.period + 1,
    overtime: policy.overtime,
  };
  return t;
}
export function recordGolHand(
  tournament: Tournament,
  matchId: string,
  input: {
    concealingTeamId: string;
    awardedToId: string;
    points: number;
    cardId?: string;
    cardUsedById?: string;
    secret?: string;
  },
  now = Date.now(),
): Tournament {
  const { t, match, ids } = ready(tournament, matchId),
    policy = golPolicy(t),
    state = golState(match);
  if (!ids.includes(input.concealingTeamId) || !ids.includes(input.awardedToId))
    throw new Error("Assign two teams before recording a hand.");
  if (!Number.isFinite(input.points) || input.points < 0 || input.points > 100)
    throw new Error("Hand points must be between 0 and 100.");
  if (input.secret && input.secret.length > 100)
    throw new Error(
      "The concealed-position note is limited to 100 characters.",
    );
  if (policy.ending === "clock" && golDecision(t, match, now).expired)
    throw new Error(
      "The period has ended. Finish the match or start agreed overtime before recording another hand.",
    );
  if ((match.hands?.length ?? 0) >= 10000)
    throw new Error("The hand log has reached 10,000 entries.");
  const card = (t.rules.gol as GolRules).cards.find(
    (c) => c.id === input.cardId,
  );
  if (input.cardId && !card)
    throw new Error("This special card is not in the agreed rules.");
  const ability = golAbilitySchema.parse(card?.ability ?? defaultGolAbility),
    usedBy = input.cardUsedById ?? input.awardedToId;
  if (card) {
    if (!ids.includes(usedBy))
      throw new Error("Choose the team using this card.");
    if (
      (ability.eligible === "concealing" &&
        usedBy !== input.concealingTeamId) ||
      (ability.eligible === "guessing" && usedBy === input.concealingTeamId)
    )
      throw new Error(
        "This card cannot be used by the selected team in its current role.",
      );
    const uses = (match.hands ?? []).filter(
      (h) =>
        h.cardId === card.id &&
        (h.gol?.cardUsedById ?? h.awardedToId) === usedBy &&
        (ability.limitScope === "match" ||
          (h.gol?.period ?? 0) === state.period),
    ).length;
    if (uses >= card.limit)
      throw new Error("This team has reached the card use limit.");
  }
  const points = input.points * ability.multiplier + (card?.points ?? 0);
  const scores =
    match.liveScores ??
    ids.map((id) =>
      (match.hands ?? [])
        .filter((h) => h.awardedToId === id)
        .reduce((sum, h) => sum + h.points, 0),
    );
  const scoreIndex = ids.indexOf(input.awardedToId);
  if (scores[scoreIndex] + points < 0 || scores[scoreIndex] + points > 1000000)
    throw new Error("This hand would put a team score outside 0 to 1,000,000.");
  const other = (id: string) => ids.find((other) => other !== id)!;
  let concealing =
    policy.possession === "alternate"
      ? other(input.concealingTeamId)
      : policy.possession === "winner"
        ? input.awardedToId
        : policy.possession === "loser"
          ? other(input.awardedToId)
          : input.concealingTeamId;
  if (card && ability.possession === "switch")
    concealing = other(input.concealingTeamId);
  if (card && ability.possession === "user") concealing = usedBy;
  match.hands = [
    ...(match.hands ?? []),
    {
      id: uid(),
      at: new Date(now).toISOString(),
      concealingTeamId: input.concealingTeamId,
      guessingTeamId: other(input.concealingTeamId),
      awardedToId: input.awardedToId,
      points,
      action: card?.name ?? "Hand result",
      cardId: card?.id,
      gol: {
        period: state.period,
        elapsedMs: golClockElapsed(match, now),
        cardUsedById: card ? usedBy : undefined,
        nextConcealingTeamId: concealing,
      },
    },
  ];
  match.private = {
    ...match.private,
    concealedPosition:
      concealing === input.concealingTeamId ? input.secret : undefined,
  };
  match.liveScores = scores.map(
    (score, index) => score + (index === scoreIndex ? points : 0),
  );
  match.golState = {
    ...state,
    concealingTeamId: concealing,
    ...(card && ability.pauseClock
      ? { elapsedMs: golClockElapsed(match, now), runningSince: undefined }
      : {}),
  };
  match.status = "live";
  t.status = "in-progress";
  const decision = golDecision(t, match, now);
  return decision.winnerId ? finish(t, match, decision.winnerId, now) : t;
}
export function undoGolHand(
  tournament: Tournament,
  matchId: string,
  handId: string,
): Tournament {
  const { t, match, ids } = ready(tournament, matchId),
    hands = match.hands ?? [];
  if (hands.at(-1)?.id !== handId)
    throw new Error(
      "Undo the latest hand first so later actions keep their agreed order.",
    );
  const last = hands.at(-1)!;
  const scores = match.liveScores ?? [0, 0];
  match.liveScores = scores.map(
    (score, i) => score - (ids[i] === last.awardedToId ? last.points : 0),
  );
  match.hands = hands.slice(0, -1);
  match.golState = {
    ...golState(match),
    concealingTeamId: last.concealingTeamId,
  };
  if (match.private) delete match.private.concealedPosition;
  return t;
}
