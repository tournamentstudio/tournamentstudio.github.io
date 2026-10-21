import type { Tournament } from "../domain/types";
import {
  ladderPolicy,
  readInvitations,
  saveInvitations,
} from "../domain/ladder";
import { entrant, newMatch, terminal } from "./formats";
import { ladderOrder } from "./ladder-state";
import { refreshTournament } from "./index";

function invitationStage(tournament: Tournament, stageId: string) {
  const stage = tournament.stages.find((entry) => entry.id === stageId);
  if (
    !stage ||
    stage.format !== "ladder" ||
    ladderPolicy(stage).mode !== "invitations"
  )
    throw new Error("Select a ladder stage using the invitation policy.");
  if (stage.status !== "active")
    throw new Error("Initialize an active ladder before managing challenges.");
  return stage;
}
function eligible(
  tournament: Tournament,
  stage: ReturnType<typeof invitationStage>,
  challengerId: string,
  opponentId: string,
) {
  const order = ladderOrder(tournament, stage);
  const challenger = order.indexOf(challengerId),
    opponent = order.indexOf(opponentId);
  if (
    opponent < 0 ||
    challenger <= opponent ||
    challenger - opponent > ladderPolicy(stage).maxRankGap
  )
    throw new Error(
      "A challenger must be lower ranked and within the configured rank gap.",
    );
  if (
    [challengerId, opponentId].some(
      (id) =>
        tournament.participants.find((participant) => participant.id === id)
          ?.status !== "active",
    )
  )
    throw new Error("Both challenge entrants must be active.");
}
export function requestChallenge(
  input: Tournament,
  stageId: string,
  challengerId: string,
  opponentId: string,
  note = "",
): Tournament {
  const tournament = structuredClone(input),
    stage = invitationStage(tournament, stageId);
  eligible(tournament, stage, challengerId, opponentId);
  const entries = readInvitations(stage);
  if (entries.length >= 1000)
    throw new Error(
      "This stage has reached its 1000-invitation limit. Archive it before starting another stage.",
    );
  if (
    entries.some(
      (entry) =>
        ["pending", "approved", "invalidated"].includes(entry.status) &&
        entry.challengerId === challengerId &&
        entry.opponentId === opponentId,
    )
  )
    throw new Error("This pair already has an open challenge invitation.");
  entries.push({
    id: crypto.randomUUID(),
    challengerId,
    opponentId,
    status: "pending",
    createdAt: new Date().toISOString(),
    note,
  });
  saveInvitations(stage, entries);
  return tournament;
}
export function decideChallenge(
  input: Tournament,
  stageId: string,
  invitationId: string,
  decision: "approve" | "decline" | "cancel",
): Tournament {
  const tournament = structuredClone(input),
    stage = invitationStage(tournament, stageId);
  const entries = readInvitations(stage),
    invitation = entries.find((entry) => entry.id === invitationId);
  if (
    !invitation ||
    !["pending", "invalidated", "approved"].includes(invitation.status)
  )
    throw new Error("This invitation no longer accepts a decision.");
  const matches = tournament.matches.filter(
    (match) => match.stageId === stageId,
  );
  if (decision === "approve") {
    if (invitation.status === "approved")
      throw new Error("This challenge is already approved.");
    eligible(tournament, stage, invitation.challengerId, invitation.opponentId);
    if (matches.some((match) => !terminal(match)))
      throw new Error(
        "Complete or cancel the active challenge before approving another.",
      );
    if (
      matches.filter((match) => match.status === "completed").length >=
      stage.config.rounds
    )
      throw new Error(
        "This ladder has reached its configured challenge limit.",
      );
    if (tournament.matches.length >= 20000)
      throw new Error("The document has reached its match limit.");
    const round = Math.max(0, ...matches.map((match) => match.round)) + 1;
    const match = newMatch(
      stage,
      round,
      0,
      [entrant(invitation.opponentId), entrant(invitation.challengerId)],
      { status: "ready", metadata: { ladderChallenge: true } },
    );
    tournament.matches.push(match);
    invitation.matchId = match.id;
    invitation.status = "approved";
  } else {
    if (invitation.status === "approved") {
      if (decision === "decline")
        throw new Error(
          "Cancel an approved challenge instead of declining it.",
        );
      const match = matches.find((entry) => entry.id === invitation.matchId);
      if (
        !match ||
        match.result ||
        ["live", "contested"].includes(match.status) ||
        match.hands?.length ||
        match.liveScores?.some((score) => score !== 0)
      )
        throw new Error(
          "A started challenge cannot be canceled. Use reviewed result correction instead.",
        );
      match.status = "canceled";
    }
    invitation.status = decision === "decline" ? "declined" : "canceled";
  }
  invitation.decidedAt = new Date().toISOString();
  saveInvitations(stage, entries);
  return refreshTournament(tournament);
}
export function closeLadder(input: Tournament, stageId: string): Tournament {
  const tournament = structuredClone(input),
    stage = tournament.stages.find((entry) => entry.id === stageId);
  if (
    !stage ||
    stage.format !== "ladder" ||
    ladderPolicy(stage).mode === "adjacent" ||
    stage.status !== "active"
  )
    throw new Error("Select an active invitation or King of the Hill ladder.");
  const matches = tournament.matches.filter(
    (match) => match.stageId === stageId,
  );
  if (
    !matches.some((match) => match.status === "completed") ||
    matches.some((match) => !terminal(match))
  )
    throw new Error(
      "Complete at least one challenge and finish active matches before closing the ladder.",
    );
  if (
    ladderPolicy(stage).mode === "invitations" &&
    readInvitations(stage).some((entry) =>
      ["pending", "invalidated"].includes(entry.status),
    )
  )
    throw new Error(
      "Decline or cancel pending invitations before closing the ladder.",
    );
  stage.metadata.challengeClosed = true;
  return refreshTournament(tournament);
}
