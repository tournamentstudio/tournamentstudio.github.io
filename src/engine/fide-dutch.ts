import type { Match, Stage, Tournament } from "../domain/types";
import { swissPolicy, swissPolicyErrors } from "../domain/swiss";
import { entrant, newMatch } from "./formats";
import { pairFideTrf } from "./fide-runtime";

export function fidePairingOrder(
  tournament: Tournament,
  stage: Stage,
): string[] {
  const stored = swissPolicy(stage).federation?.pairingOrder;
  if (stored) return [...stored];
  const order = [...stage.participantIds];
  if (stage.config.seeding === "manual") return order;
  const seed = new Map(
    tournament.participants.map((participant) => [
      participant.id,
      participant.seed,
    ]),
  );
  return order.sort(
    (a, b) => seed.get(a)! - seed.get(b)! || (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** Names and private metadata never enter the engine's fixed-column input. */
export function fideTrf(
  tournament: Tournament,
  stage: Stage,
  round: number,
): string {
  const errors = swissPolicyErrors(tournament, stage);
  if (errors.length) throw new Error(errors.join(" "));
  const policy = swissPolicy(stage);
  if (!policy.federation)
    throw new Error("Choose the FIDE Dutch pairing policy.");
  if (!Number.isInteger(round) || round < 1 || round > stage.config.rounds)
    throw new Error(
      "The FIDE pairing round is outside the declared tournament.",
    );
  const order = fidePairingOrder(tournament, stage);
  const numbers = new Map(order.map((id, index) => [id, index + 1]));
  const active = new Set(
    tournament.participants
      .filter((participant) => participant.status === "active")
      .map((participant) => participant.id),
  );
  const joined = new Map(
    policy.lateEntries.map((entry) => [entry.participantId, entry.joinedRound]),
  );
  const cells = new Map(
    order.map((id) => [
      id,
      Array.from({ length: round - 1 }, () => "  0000 - Z"),
    ]),
  );
  const points = new Map(order.map((id) => [id, 0]));
  const seen = new Set<string>();
  const matches = tournament.matches.filter(
    (match) => match.stageId === stage.id && match.round < round,
  );
  for (const match of matches) {
    const ids = match.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    );
    if (
      match.round < 1 ||
      match.slots.length !== 2 ||
      ids.some((id) => !numbers.has(id))
    )
      throw new Error(
        "The FIDE match history has an invalid entrant or round.",
      );
    for (const id of ids) {
      const key = `${match.round}:${id}`;
      if (seen.has(key))
        throw new Error(
          "The FIDE history assigns an entrant twice in one round.",
        );
      seen.add(key);
    }
    if (match.status === "canceled") continue;
    if (
      match.status === "bye" &&
      ids.length === 1 &&
      match.result?.winnerIds[0] === ids[0]
    ) {
      cells.get(ids[0])![match.round - 1] = "  0000 - U";
      points.set(ids[0], points.get(ids[0])! + 1);
      continue;
    }
    if (match.status !== "completed" || !match.result || ids.length !== 2)
      throw new Error(
        "Complete every previous FIDE round before drawing the next round.",
      );
    const result = match.result;
    if (result.outcome === "abandoned")
      throw new Error(
        "FIDE Dutch needs a played, drawn, or unplayed forfeit ruling for every completed game.",
      );
    const played = result.outcome === "played" || result.outcome === "draw";
    const draw = result.outcome === "draw";
    if (
      (!draw && result.winnerIds.length !== 1) ||
      (draw && result.winnerIds.length)
    )
      throw new Error(
        "The FIDE result must identify one winner or an explicit draw.",
      );
    ids.forEach((id, index) => {
      const won = result.winnerIds.includes(id);
      const symbol = draw ? "=" : played ? (won ? "1" : "0") : won ? "+" : "-";
      cells.get(id)![match.round - 1] =
        `  ${String(numbers.get(ids[1 - index])).padStart(4)} ${index === 0 ? "w" : "b"} ${symbol}`;
      points.set(id, points.get(id)! + (draw ? 0.5 : won ? 1 : 0));
    });
  }
  const lines = [
    `012 TournaStudio pairing`,
    `XXR ${stage.config.rounds}`,
    `XXC ${policy.federation.initialColor}1`,
  ];
  for (const id of order) {
    const number = numbers.get(id)!;
    const prefix = Array<string>(89).fill(" ");
    const put = (start: number, value: string) =>
      [...value].forEach((character, index) => {
        prefix[start + index] = character;
      });
    put(0, "001");
    put(4, String(number).padStart(4));
    put(14, `Entrant ${number}`);
    put(80, points.get(id)!.toFixed(1).padStart(4));
    put(85, String(number).padStart(4));
    const unavailable = !active.has(id) || (joined.get(id) ?? 1) > round;
    lines.push(
      prefix.join("") +
        cells.get(id)!.join("") +
        (unavailable ? "  0000 - Z" : ""),
    );
  }
  return lines.join("\n") + "\n";
}

export function fideDutchRound(
  tournament: Tournament,
  stage: Stage,
  round: number,
): Match[] {
  const policy = swissPolicy(stage);
  if (!policy.federation)
    throw new Error("Choose the FIDE Dutch pairing policy.");
  if (round === 1) {
    const fresh = { ...policy.federation };
    delete fresh.pairingOrder;
    stage.config.swiss = { ...policy, federation: fresh };
    stage.config.swiss.federation!.pairingOrder = fidePairingOrder(
      tournament,
      stage,
    );
  }
  const order = fidePairingOrder(tournament, stage);
  const pairs = pairFideTrf(fideTrf(tournament, stage, round));
  const active = order.filter(
    (id) =>
      tournament.participants.find((participant) => participant.id === id)
        ?.status === "active" &&
      (policy.lateEntries.find((entry) => entry.participantId === id)
        ?.joinedRound ?? 1) <= round,
  );
  const supplied = pairs.flatMap(([white, black]) =>
    black ? [order[white - 1], order[black - 1]] : [order[white - 1]],
  );
  if (
    active.length < 2 ||
    supplied.length !== active.length ||
    new Set(supplied).size !== supplied.length ||
    supplied.some((id) => !active.includes(id)) ||
    pairs.filter((pair) => !pair[1]).length !== active.length % 2
  )
    throw new Error(
      "The FIDE Dutch engine could not produce a complete legal pairing. Review the results, active entrants, and round count.",
    );
  return pairs.map(([white, black], index) =>
    newMatch(
      stage,
      round,
      index,
      [
        entrant(order[white - 1]),
        entrant(black ? order[black - 1] : undefined),
      ],
      {
        metadata: {
          pairingSystem: "fide-dutch-2026",
          pairingEngine: "bbp-6.0.0-ts1",
          whiteNumber: white,
          ...(black ? { blackNumber: black } : { pairingBye: true }),
        },
      },
    ),
  );
}
