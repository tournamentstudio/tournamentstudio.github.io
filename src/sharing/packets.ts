import { z } from "zod";
import type { MatchResult, Participant, Tournament } from "../domain/types";
import {
  participantSchema,
  resultSchema,
  validateTournament,
} from "../domain/validate";
import { canonicalize, safeParse, sha256 } from "../security/codec";
import { publicProjection } from "./index";

const customFieldSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    label: z.string().min(1).max(240),
    type: z.enum(["text", "number", "boolean", "choice"]),
    required: z.boolean(),
    options: z.array(z.string().max(240)).max(100).optional(),
  })
  .strict();
export type RegistrationField = z.infer<typeof customFieldSchema>;

export const registrationTemplateSchema = z
  .object({
    format: z.literal("tournastudio-registration-form"),
    version: z.literal(1),
    id: z.string().max(160),
    tournamentId: z.string().max(160),
    title: z.string().max(240),
    limit: z.number().int().min(1).max(512),
    fields: z.array(customFieldSchema).max(50),
  })
  .strict();
export type RegistrationTemplate = z.infer<typeof registrationTemplateSchema>;

export const registrationResponseSchema = z
  .object({
    format: z.literal("tournastudio-registration-response"),
    version: z.literal(1),
    id: z.string().max(160),
    tournamentId: z.string().max(160),
    formId: z.string().max(160),
    participants: z.array(participantSchema).min(1).max(512),
    answers: z.record(
      z.string().max(80),
      z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
    ),
    submittedAt: z.string().datetime(),
  })
  .strict();
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;

export function createRegistrationTemplate(
  tournament: Tournament,
  fields: RegistrationField[] = [],
): RegistrationTemplate {
  const template = registrationTemplateSchema.parse({
    format: "tournastudio-registration-form",
    version: 1,
    id: crypto.randomUUID(),
    tournamentId: tournament.id,
    title: tournament.title,
    limit: 512 - tournament.participants.length,
    fields,
  });
  if (new Set(fields.map((field) => field.id)).size !== fields.length)
    throw new Error("Registration field identifiers must be unique.");
  for (const field of fields)
    if (field.type === "choice" && !field.options?.length)
      throw new Error("A choice field needs at least one option.");
  return template;
}

export function createRegistrationResponse(
  templateInput: unknown,
  participants: Participant[],
  answers: RegistrationResponse["answers"] = {},
): RegistrationResponse {
  const template = registrationTemplateSchema.parse(templateInput);
  if (participants.length > template.limit)
    throw new Error("This response exceeds the available participant places.");
  for (const field of template.fields) {
    const value = answers[field.id];
    if ((value === undefined || value === "") && field.required)
      throw new Error(`Complete the required field: ${field.label}`);
    if (value === undefined || value === "") continue;
    if (
      field.type === "choice" &&
      (typeof value !== "string" || !field.options?.includes(value))
    )
      throw new Error(`Choose a valid option for ${field.label}.`);
    if (
      field.type !== "choice" &&
      typeof value !== (field.type === "text" ? "string" : field.type)
    )
      throw new Error(`Invalid value for ${field.label}.`);
  }
  if (
    Object.keys(answers).some(
      (key) => !template.fields.some((field) => field.id === key),
    )
  )
    throw new Error("The response contains an unknown registration field.");
  return registrationResponseSchema.parse({
    format: "tournastudio-registration-response",
    version: 1,
    id: crypto.randomUUID(),
    tournamentId: template.tournamentId,
    formId: template.id,
    participants,
    answers,
    submittedAt: new Date().toISOString(),
  });
}

export function acceptRegistration(
  tournament: Tournament,
  input: unknown,
): Tournament {
  const response = registrationResponseSchema.parse(input);
  if (response.tournamentId !== tournament.id)
    throw new Error("This registration belongs to a different tournament.");
  const accepted = Array.isArray(tournament.metadata.acceptedRegistrations)
    ? tournament.metadata.acceptedRegistrations
    : [];
  if (accepted.includes(response.id))
    throw new Error("This registration was already approved.");
  const names = new Set(
    tournament.participants.map((participant) =>
      participant.name
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase(tournament.locale),
    ),
  );
  const ids = new Set(
    tournament.participants.map((participant) => participant.id),
  );
  for (const participant of response.participants) {
    const name = participant.name
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase(tournament.locale);
    if (names.has(name) || ids.has(participant.id))
      throw new Error(
        `A participant named ${participant.name} is already registered. Review the duplicate before approving.`,
      );
    names.add(name);
    ids.add(participant.id);
  }
  return validateTournament({
    ...tournament,
    participants: [
      ...tournament.participants,
      ...response.participants.map((participant, index) => ({
        ...participant,
        seed: tournament.participants.length + index + 1,
        checkedIn: false,
        metadata: {
          ...participant.metadata,
          registrationResponseId: response.id,
          registrationAnswers: response.answers,
        },
      })),
    ],
    metadata: {
      ...tournament.metadata,
      acceptedRegistrations: [...accepted, response.id],
    },
  });
}

export const resultProposalSchema = z
  .object({
    format: z.literal("tournastudio-result-proposal"),
    version: z.literal(1),
    id: z.string().max(160),
    tournamentId: z.string().max(160),
    matchId: z.string().max(160),
    baseRevision: z.number().int().nonnegative(),
    baseMatchHash: z.string().length(43),
    result: resultSchema,
    notes: z.string().max(10000),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ResultProposal = z.infer<typeof resultProposalSchema>;

export async function matchProposalHash(
  tournament: Tournament,
  matchId: string,
): Promise<string> {
  const match = publicProjection(tournament).matches.find(
    (candidate) => candidate.id === matchId,
  );
  if (!match) throw new Error("Match not found.");
  return sha256(canonicalize(match));
}

export async function createResultProposal(
  tournament: Tournament,
  matchId: string,
  result: MatchResult,
  notes = "",
): Promise<ResultProposal> {
  const match = tournament.matches.find(
    (candidate) => candidate.id === matchId,
  );
  if (!match) throw new Error("Match not found.");
  const proposal = resultProposalSchema.parse({
    format: "tournastudio-result-proposal",
    version: 1,
    id: crypto.randomUUID(),
    tournamentId: tournament.id,
    matchId,
    baseRevision: tournament.revision,
    baseMatchHash: await matchProposalHash(tournament, matchId),
    result,
    notes,
    createdAt: new Date().toISOString(),
  });
  await validateResultProposal(tournament, proposal);
  return proposal;
}

export async function validateResultProposal(
  tournament: Tournament,
  input: unknown,
): Promise<ResultProposal> {
  const proposal = resultProposalSchema.parse(input);
  if (proposal.tournamentId !== tournament.id)
    throw new Error("This proposed result belongs to a different tournament.");
  const match = tournament.matches.find(
    (candidate) => candidate.id === proposal.matchId,
  );
  if (!match) throw new Error("The proposed match no longer exists.");
  if (
    (await matchProposalHash(tournament, match.id)) !== proposal.baseMatchHash
  )
    throw new Error(
      "This match changed after the proposal was prepared. Review the current result manually.",
    );
  if (
    proposal.result.winnerIds.some(
      (id) => !match.slots.some((slot) => slot.participantId === id),
    )
  )
    throw new Error("The proposed winner is not assigned to this match.");
  if (
    proposal.result.scores.length !==
    match.slots.filter((slot) => slot.participantId).length
  )
    throw new Error("The proposal must provide a score for every entrant.");
  // The caller must preview and approve through the competition engine before saving.
  return proposal;
}

export type OfflinePacket =
  RegistrationTemplate | RegistrationResponse | ResultProposal;
export function parseOfflinePacket(text: string): OfflinePacket {
  return z
    .discriminatedUnion("format", [
      registrationTemplateSchema,
      registrationResponseSchema,
      resultProposalSchema,
    ])
    .parse(safeParse(text));
}
