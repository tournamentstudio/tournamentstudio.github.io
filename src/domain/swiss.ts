import { z } from "zod";
import type { Stage, Tournament } from "./types";

const entrantId = z.string().min(1).max(160);
export const swissPolicySchema = z.object({
  version: z.literal(1),
  colorPolicy: z.enum(["alternating", "balanced"]),
  allowLateEntrants: z.boolean(),
  preferences: z.record(entrantId, z.enum(["first", "second"])),
  lateEntries: z.array(z.object({
    participantId: entrantId,
    joinedRound: z.number().int().min(2).max(100),
    points: z.number().finite().min(0).max(1000000),
  }).strict()).max(512),
}).strict();
export type SwissPolicy = z.infer<typeof swissPolicySchema>;
export const DEFAULT_SWISS_POLICY: SwissPolicy = {
  version: 1, colorPolicy: "alternating", allowLateEntrants: false, preferences: {}, lateEntries: [],
};
export function swissPolicy(stage: Stage): SwissPolicy {
  return swissPolicySchema.parse(stage.config.swiss ?? DEFAULT_SWISS_POLICY);
}
export function swissPolicyErrors(tournament: Tournament, stage: Stage): string[] {
  if (stage.config.swiss === undefined) return [];
  const parsed = swissPolicySchema.safeParse(stage.config.swiss);
  if (!parsed.success) return ["The Swiss policy has an invalid structure."];
  if (stage.format !== "swiss") return ["Swiss policies require a Swiss stage."];
  const errors: string[] = [], policy = parsed.data;
  if (Object.keys(policy.preferences).length > 512)
    errors.push("Swiss color preferences are limited to 512 entrants.");
  const known = new Set(tournament.participants.map((participant) => participant.id));
  if (Object.keys(policy.preferences).some((id) => !known.has(id)) || policy.lateEntries.some((entry) => !stage.participantIds.includes(entry.participantId)))
    errors.push("The Swiss policy references an unknown entrant.");
  if (new Set(policy.lateEntries.map((entry) => entry.participantId)).size !== policy.lateEntries.length)
    errors.push("A Swiss late entrant is recorded more than once.");
  if (policy.lateEntries.some((entry) => entry.joinedRound > stage.config.rounds || entry.points > Math.max(0, tournament.rules.pointsWin) * (entry.joinedRound - 1)))
    errors.push("Swiss entry credits cannot exceed a win per missed round.");
  return errors;
}

export function swissCredit(tournament: Tournament, stage: Stage, participantId: string): number {
  if (stage.format !== "swiss" || !stage.config.swiss) return 0;
  const entry = swissPolicy(stage).lateEntries.find((entry) => entry.participantId === participantId);
  if (!entry) return 0;
  const latestRound = Math.max(0, ...tournament.matches.filter((match) => match.stageId === stage.id).map((match) => match.round));
  return latestRound >= entry.joinedRound - 1 ? entry.points : 0;
}
