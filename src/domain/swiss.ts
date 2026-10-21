import { z } from "zod";
import type { Stage, Tournament } from "./types";

const entrantId = z.string().min(1).max(160);
export const swissPolicySchema = z
  .object({
    version: z.literal(1),
    colorPolicy: z.enum(["alternating", "balanced"]),
    allowLateEntrants: z.boolean(),
    preferences: z.record(entrantId, z.enum(["first", "second"])),
    lateEntries: z
      .array(
        z
          .object({
            participantId: entrantId,
            joinedRound: z.number().int().min(2).max(100),
            points: z.number().finite().min(0).max(1000000),
          })
          .strict(),
      )
      .max(512),
    federation: z
      .object({
        system: z.literal("fide-dutch-2026"),
        engine: z.literal("bbp-6.0.0-ts1"),
        initialColor: z.enum(["white", "black"]),
        pairingOrder: z.array(entrantId).min(2).max(512).optional(),
      })
      .strict()
      .optional(),
    acceleration: z
      .object({
        policy: z.literal("fixed-group-v1"),
        rounds: z.number().int().min(1).max(100),
        points: z.number().finite().positive().max(1000000),
        participantIds: z.array(entrantId).min(1).max(511),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SwissPolicy = z.infer<typeof swissPolicySchema>;
export const DEFAULT_SWISS_POLICY: SwissPolicy = {
  version: 1,
  colorPolicy: "alternating",
  allowLateEntrants: false,
  preferences: {},
  lateEntries: [],
};
export function swissPolicy(stage: Stage): SwissPolicy {
  return swissPolicySchema.parse(stage.config.swiss ?? DEFAULT_SWISS_POLICY);
}
export function swissPolicyErrors(
  tournament: Tournament,
  stage: Stage,
): string[] {
  if (stage.config.swiss === undefined) return [];
  const parsed = swissPolicySchema.safeParse(stage.config.swiss);
  if (!parsed.success) return ["The Swiss policy has an invalid structure."];
  if (stage.format !== "swiss")
    return ["Swiss policies require a Swiss stage."];
  const errors: string[] = [],
    policy = parsed.data;
  if (Object.keys(policy.preferences).length > 512)
    errors.push("Swiss color preferences are limited to 512 entrants.");
  const known = new Set(
    tournament.participants.map((participant) => participant.id),
  );
  if (
    Object.keys(policy.preferences).some((id) => !known.has(id)) ||
    policy.lateEntries.some(
      (entry) => !stage.participantIds.includes(entry.participantId),
    )
  )
    errors.push("The Swiss policy references an unknown entrant.");
  if (
    new Set(policy.lateEntries.map((entry) => entry.participantId)).size !==
    policy.lateEntries.length
  )
    errors.push("A Swiss late entrant is recorded more than once.");
  if (
    policy.lateEntries.some(
      (entry) =>
        entry.joinedRound > stage.config.rounds ||
        entry.points >
          Math.max(0, tournament.rules.pointsWin) * (entry.joinedRound - 1),
    )
  )
    errors.push("Swiss entry credits cannot exceed a win per missed round.");
  const acceleration = policy.acceleration;
  if (policy.federation) {
    if (
      tournament.rules.pointsWin !== 1 ||
      tournament.rules.pointsDraw !== 0.5 ||
      tournament.rules.pointsLoss !== 0 ||
      !tournament.rules.allowDraws ||
      !["high", "manual"].includes(tournament.rules.scoring) ||
      tournament.rules.bestOf !== 1
    )
      errors.push(
        "FIDE Dutch requires single-game scoring, draws, and 1 / 0.5 / 0 match points.",
      );
    if (
      policy.acceleration ||
      Object.keys(policy.preferences).length ||
      (Array.isArray(stage.config.forbiddenPairs) &&
        stage.config.forbiddenPairs.length)
    )
      errors.push(
        "FIDE Dutch cannot combine generic acceleration, side preferences, or forbidden pairs.",
      );
    if (policy.lateEntries.some((entry) => entry.points !== 0))
      errors.push(
        "FIDE Dutch late entrants must receive zero points for missed rounds.",
      );
    if (
      tournament.participants.some(
        (participant) =>
          stage.participantIds.includes(participant.id) &&
          typeof participant.metadata.pointsAdjustment === "number" &&
          participant.metadata.pointsAdjustment !== 0,
      )
    )
      errors.push("FIDE Dutch does not accept standings point adjustments.");
    const order = policy.federation.pairingOrder;
    if (
      !order &&
      tournament.matches.some((match) => match.stageId === stage.id)
    )
      errors.push(
        "Generated FIDE rounds require their original pairing numbers.",
      );
    if (
      order &&
      (new Set(order).size !== order.length ||
        order.length !== stage.participantIds.length ||
        order.some((id) => !stage.participantIds.includes(id)))
    )
      errors.push(
        "FIDE pairing numbers must list every stage entrant exactly once.",
      );
    if (stage.config.seeding !== "ranked" && stage.config.seeding !== "manual")
      errors.push("FIDE Dutch requires ranked or manual initial order.");
  }
  if (
    acceleration &&
    (acceleration.rounds >= stage.config.rounds ||
      new Set(acceleration.participantIds).size !==
        acceleration.participantIds.length ||
      acceleration.participantIds.length >= stage.participantIds.length ||
      acceleration.participantIds.some(
        (id) =>
          !stage.participantIds.includes(id) ||
          policy.lateEntries.some((entry) => entry.participantId === id),
      ))
  )
    errors.push(
      "Swiss acceleration needs a fixed proper subset of starting entrants and must end before the final round.",
    );
  return errors;
}

/** Virtual points affect pairing only; actual points and bye order stay unchanged. */
export function swissPairingBonus(
  stage: Stage,
  participantId: string,
  round: number,
): number {
  const acceleration = swissPolicy(stage).acceleration;
  return acceleration &&
    round <= acceleration.rounds &&
    acceleration.participantIds.includes(participantId)
    ? acceleration.points
    : 0;
}

export function swissCredit(
  tournament: Tournament,
  stage: Stage,
  participantId: string,
): number {
  if (stage.format !== "swiss" || !stage.config.swiss) return 0;
  const entry = swissPolicy(stage).lateEntries.find(
    (entry) => entry.participantId === participantId,
  );
  if (!entry) return 0;
  const latestRound = Math.max(
    0,
    ...tournament.matches
      .filter((match) => match.stageId === stage.id)
      .map((match) => match.round),
  );
  return latestRound >= entry.joinedRound - 1 ? entry.points : 0;
}
