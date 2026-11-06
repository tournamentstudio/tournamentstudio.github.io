import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { singleElimination } from "../engine/elimination";

export const sampleTeams = [
  { id: "cedar", en: "Cedar", fa: "سرو", color: "forest" },
  { id: "tide", en: "Tide", fa: "موج", color: "blue" },
  { id: "sunrise", en: "Sunrise", fa: "سپیده", color: "gold" },
  { id: "ember", en: "Ember", fa: "اخگر", color: "copper" },
] as const;

export function createLandingSample(): Tournament {
  const participants = sampleTeams.map((team, index) => ({
    ...createParticipant(team.en, index + 1),
    id: `sample-${team.id}`,
  }));
  const tournament = createTournament("Friends' cup", participants);
  const stage = tournament.stages[0];
  stage.id = "landing-sample";
  stage.status = "active";
  tournament.matches = singleElimination(stage, stage.participantIds);
  for (const match of tournament.matches)
    if (match.slots.every((slot) => slot.participantId)) match.status = "ready";
  tournament.status = "ready";
  return tournament;
}

export async function playLandingSample(
  tournament: Tournament,
  winnerId: string,
): Promise<Tournament> {
  const match = tournament.matches.find((item) => item.status === "ready");
  if (!match || !match.slots.some((slot) => slot.participantId === winnerId))
    throw new Error("Choose a participant in the next sample match.");
  const { recordResult } = await import("../engine");
  return recordResult(tournament, match.id, {
    scores: match.slots.map((slot) =>
      slot.participantId === winnerId ? 2 : 1,
    ),
    winnerIds: [],
    outcome: "played",
    recordedAt: new Date().toISOString(),
  });
}
