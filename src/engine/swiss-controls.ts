import { createParticipant, type Stage, type Tournament } from "../domain/types";
import { swissPolicy, swissPolicyErrors, swissPolicySchema, type SwissPolicy } from "../domain/swiss";
import { entrant, newMatch, terminal } from "./formats";

function requireSwiss(tournament: Tournament, stageId: string): Stage {
  const stage = tournament.stages.find((stage) => stage.id === stageId);
  if (!stage || stage.format !== "swiss") throw new Error("Choose a Swiss stage.");
  return stage;
}
export function swissRoundEditable(tournament: Tournament, stage: Stage): boolean {
  const matches = tournament.matches.filter((match) => match.stageId === stage.id);
  const round = Math.max(0, ...matches.map((match) => match.round));
  return round > 0 && matches.filter((match) => match.round === round).every((match) =>
    ["ready", "bye"].includes(match.status) && !match.hands?.length && !match.liveScores?.some(Boolean),
  ) && !tournament.stages.some((other) => other.sources.some((source) => source.stageId === stage.id &&
    (source.selection?.kind === "match-results" || tournament.matches.some((match) => match.stageId === other.id)),
  ));
}
export function setManualSwissPairings(input: Tournament, stageId: string, pairs: string[][]): Tournament {
  const doc = structuredClone(input), stage = requireSwiss(doc, stageId);
  if (!swissRoundEditable(doc, stage)) throw new Error("Only the latest unplayed Swiss round can be paired manually. Remove dependent outcome connections first.");
  const matches = doc.matches.filter((match) => match.stageId === stageId);
  const round = Math.max(...matches.map((match) => match.round));
  const history = matches.filter((match) => match.round < round);
  const policy = swissPolicy(stage);
  const joined = new Map(policy.lateEntries.map((entry) => [entry.participantId, entry.joinedRound]));
  const active = stage.participantIds.filter((id) => (joined.get(id) ?? 1) <= round && doc.participants.find((participant) => participant.id === id)?.status === "active");
  const supplied = pairs.flat();
  if (pairs.some((pair) => pair.length < 1 || pair.length > 2) || supplied.length !== active.length || new Set(supplied).size !== supplied.length || active.some((id) => !supplied.includes(id)))
    throw new Error("Manual Swiss pairings must include every active entrant exactly once.");
  if (pairs.filter((pair) => pair.length === 1).length !== active.length % 2)
    throw new Error("Use exactly one Swiss bye for an odd field and none for an even field.");
  const key = (ids: string[]) => [...ids].sort().join("\u0000");
  const previous = new Set(history.filter((match) => match.slots.every((slot) => slot.participantId)).map((match) => key(match.slots.map((slot) => slot.participantId!))));
  const forbidden = new Set((stage.config.forbiddenPairs as string[][] | undefined ?? []).map(key));
  const byes = new Set(history.filter((match) => match.status === "bye").flatMap((match) => match.result?.winnerIds ?? []));
  if (pairs.some((pair) => pair.length === 2 && (previous.has(key(pair)) || forbidden.has(key(pair)))))
    throw new Error("Manual Swiss pairings cannot repeat opponents or break forbidden-pair rules.");
  if (pairs.some((pair) => pair.length === 1 && byes.has(pair[0])))
    throw new Error("Choose a Swiss bye entrant who has not received a bye.");
  doc.matches = doc.matches.filter((match) => match.stageId !== stageId || match.round !== round);
  doc.matches.push(...pairs.map((pair, index) => newMatch(stage, round, index, pair.length === 1 ? [entrant(pair[0]), entrant()] : pair.map(entrant), {
    status: pair.length === 1 ? "bye" : "ready",
    ...(pair.length === 1 ? { result: { scores: [], winnerIds: pair, outcome: "walkover" as const, recordedAt: doc.updatedAt } } : {}),
    metadata: { manualPairing: true, ...(pair.length === 1 ? { pairingBye: true } : {}) },
  })));
  return doc;
}

export function setSwissPolicy(input: Tournament, stageId: string, value: SwissPolicy): Tournament {
  const doc = structuredClone(input), stage = requireSwiss(doc, stageId);
  const matches = doc.matches.filter((match) => match.stageId === stageId);
  if (stage.status === "completed" || matches.some((match) => !terminal(match)))
    throw new Error("Swiss policy changes require a draft stage or a completed round before the next draw.");
  const policy = swissPolicySchema.parse(value);
  if (JSON.stringify(policy.lateEntries) !== JSON.stringify(swissPolicy(stage).lateEntries))
    throw new Error("Existing Swiss entry credits cannot be changed through the policy editor.");
  stage.config.swiss = policy;
  const errors = swissPolicyErrors(doc, stage);
  if (errors.length) throw new Error(errors.join(" "));
  return doc;
}

export function admitSwissEntrant(input: Tournament, stageId: string, name: string, points: number): Tournament {
  const doc = structuredClone(input), stage = requireSwiss(doc, stageId), policy = swissPolicy(stage);
  if (!policy.allowLateEntrants) throw new Error("Enable late entry in the Swiss policy before admitting an entrant.");
  const matches = doc.matches.filter((match) => match.stageId === stageId);
  const round = Math.max(0, ...matches.map((match) => match.round));
  if (!round || round >= stage.config.rounds || matches.some((match) => !terminal(match)))
    throw new Error("Admit Swiss entrants between completed rounds before the final round.");
  if (stage.sources.length || doc.stages.some((other) => other.sources.some((source) => source.stageId === stageId)))
    throw new Error("Late entry requires a standalone Swiss stage without incoming or outgoing connections.");
  const clean = name.trim();
  if (!clean || clean.length > 240 || doc.participants.some((participant) => participant.name.normalize("NFKC").toLocaleLowerCase() === clean.normalize("NFKC").toLocaleLowerCase()))
    throw new Error("Enter a distinct Swiss entrant name using 1 to 240 characters.");
  if (doc.participants.length >= 512) throw new Error("The tournament is limited to 512 participants.");
  if (!Number.isFinite(points) || points < 0 || points > Math.min(1000000, Math.max(0, doc.rules.pointsWin) * round))
    throw new Error("Swiss entry credits cannot exceed a win per missed round.");
  const participant = createParticipant(clean, Math.max(0, ...doc.participants.map((participant) => participant.seed)) + 1);
  doc.participants.push(participant);
  stage.participantIds.push(participant.id);
  stage.config.swiss = { ...policy, lateEntries: [...policy.lateEntries, { participantId: participant.id, joinedRound: round + 1, points }] };
  return doc;
}
