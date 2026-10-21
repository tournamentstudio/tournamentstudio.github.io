import { z } from "zod";
import type { Stage, Tournament } from "./types";

export const ladderPolicySchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["adjacent", "invitations", "king-of-hill"]),
    maxRankGap: z.number().int().min(1).max(511),
  })
  .strict();
export type LadderPolicy = z.infer<typeof ladderPolicySchema>;
export const invitationSchema = z
  .object({
    id: z.string().min(1).max(160),
    challengerId: z.string().min(1).max(160),
    opponentId: z.string().min(1).max(160),
    status: z.enum([
      "pending",
      "approved",
      "declined",
      "canceled",
      "resolved",
      "invalidated",
    ]),
    createdAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
    matchId: z.string().max(160).optional(),
    note: z.string().max(1000),
  })
  .strict();
export type ChallengeInvitation = z.infer<typeof invitationSchema>;
const invitationsSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(invitationSchema).max(1000),
  })
  .strict();
export function ladderPolicy(stage: Stage): LadderPolicy {
  return stage.config.ladder
    ? ladderPolicySchema.parse(stage.config.ladder)
    : { version: 1, mode: "adjacent", maxRankGap: 511 };
}
export function readInvitations(stage: Stage): ChallengeInvitation[] {
  return stage.metadata.challenges === undefined
    ? []
    : invitationsSchema.parse(stage.metadata.challenges).entries;
}
export function saveInvitations(stage: Stage, entries: ChallengeInvitation[]) {
  stage.metadata.challenges = invitationsSchema.parse({ version: 1, entries });
}
export function ladderPolicyErrors(
  tournament: Tournament,
  stage: Stage,
): string[] {
  const errors: string[] = [];
  if (stage.config.ladder !== undefined && stage.format !== "ladder")
    errors.push("Ladder policies can only be used with a ladder stage.");
  if (
    stage.config.ladder !== undefined &&
    !ladderPolicySchema.safeParse(stage.config.ladder).success
  )
    errors.push("The ladder policy configuration is invalid.");
  if (
    stage.metadata.challengeClosed !== undefined &&
    typeof stage.metadata.challengeClosed !== "boolean"
  )
    errors.push("The challenge closure flag must be a boolean.");
  if (stage.metadata.challenges !== undefined) {
    const parsed = invitationsSchema.safeParse(stage.metadata.challenges);
    if (!parsed.success)
      errors.push("The stored challenge invitation list is invalid.");
    else {
      const entries = parsed.data.entries;
      if (
        stage.format !== "ladder" ||
        ladderPolicy(stage).mode !== "invitations"
      )
        errors.push(
          "Challenge invitations require the invitation ladder policy.",
        );
      if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
        errors.push("Challenge invitation identifiers must be unique.");
      for (const entry of entries) {
        if (
          entry.challengerId === entry.opponentId ||
          !stage.participantIds.includes(entry.challengerId) ||
          !stage.participantIds.includes(entry.opponentId)
        )
          errors.push(
            "A challenge must reference two distinct entrants in its stage.",
          );
        const match = tournament.matches.find(
          (item) => item.id === entry.matchId,
        );
        if (entry.matchId && (!match || match.stageId !== stage.id))
          errors.push(
            "A challenge invitation references a missing stage match.",
          );
      }
    }
  }
  return [...new Set(errors)];
}
