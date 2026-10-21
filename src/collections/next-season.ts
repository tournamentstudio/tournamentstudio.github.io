import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { sealDocument } from "../sharing";
import {
  sealCollection,
  validateCollection,
  type EventCollection,
} from "./model";
import { seasonMovement } from "./rankings";
import { validateBundle, type CollectionBundle } from "./transport";

export interface DivisionRoute {
  divisionId: string;
  promoteTo: string;
  relegateTo: string;
}
export interface DivisionMovement {
  directoryId: string;
  from: string;
  to: string;
  reason: "promotion" | "relegation";
}

/** All movements use the completed source season, never a partially moved roster. */
export function planNextSeason(
  input: EventCollection,
  documents: Tournament[],
  routes: DivisionRoute[],
) {
  const collection = validateCollection(input);
  const ids = new Set(collection.divisions.map((d) => d.id));
  if (
    routes.length !== ids.size ||
    new Set(routes.map((r) => r.divisionId)).size !== ids.size ||
    routes.some((r) => !ids.has(r.divisionId))
  )
    throw new Error("Provide exactly one movement rule for every division.");
  const movements: DivisionMovement[] = [];
  for (const division of collection.divisions) {
    const route = routes.find((r) => r.divisionId === division.id)!;
    const result = seasonMovement(collection, documents, division.id);
    for (const [people, target, reason] of [
      [result.promote, route.promoteTo, "promotion"],
      [result.relegate, route.relegateTo, "relegation"],
    ] as const) {
      if (people.length && (!ids.has(target) || target === division.id))
        throw new Error(
          "Choose a different destination division for every nonzero movement rule.",
        );
      movements.push(
        ...people.map((directoryId) => ({
          directoryId,
          from: division.id,
          to: target,
          reason,
        })),
      );
    }
  }
  const destinations = new Map(movements.map((m) => [m.directoryId, m.to]));
  const directory = collection.directory.map((p) => ({
    ...p,
    divisionId: destinations.get(p.id) ?? p.divisionId,
  }));
  for (const division of collection.divisions) {
    const count = directory.filter((p) => p.divisionId === division.id).length;
    if (count < 2 || count > 128)
      throw new Error(
        "Each new league division needs between 2 and 128 entrants.",
      );
    if (!collection.competitions.some((c) => c.divisionId === division.id))
      throw new Error(
        "Link a source competition in every division to supply its sport and rules.",
      );
  }
  return { movements, directory };
}

export async function createMovedSeason(
  input: EventCollection,
  documents: Tournament[],
  routes: DivisionRoute[],
  title: string,
  season: string,
): Promise<CollectionBundle> {
  const { directory } = planNextSeason(input, documents, routes);
  const index = new Map(documents.map((t) => [t.id, t]));
  const competitions: EventCollection["competitions"] = [];
  const tournaments: Tournament[] = [];
  for (const division of input.divisions) {
    const templateLink = input.competitions.find(
      (c) => c.divisionId === division.id,
    )!;
    const template = index.get(templateLink.tournamentId)!;
    const members = directory.filter((p) => p.divisionId === division.id);
    const participants = members.map((member, i) => {
      const sourceLink = input.competitions.find((c) =>
        c.bindings.some((b) => b.directoryId === member.id),
      );
      const sourceId = sourceLink?.bindings.find(
        (b) => b.directoryId === member.id,
      )?.participantId;
      const source =
        sourceLink &&
        index
          .get(sourceLink.tournamentId)
          ?.participants.find((p) => p.id === sourceId);
      const participant = source
        ? structuredClone(source)
        : createParticipant(member.name, i + 1, member.kind);
      participant.id = crypto.randomUUID();
      participant.name = member.name;
      participant.kind = member.kind;
      participant.seed = i + 1;
      participant.status = "active";
      participant.checkedIn = false;
      participant.metadata = {};
      return participant;
    });
    const tournament = createTournament(
      `${title}: ${division.name}`.slice(0, 240),
      participants,
      "round-robin",
      template.sport,
    );
    tournament.locale = template.locale;
    tournament.timezone = template.timezone;
    tournament.rules = structuredClone(template.rules);
    tournament.theme = structuredClone(template.theme);
    tournament.schedule.matchMinutes = template.schedule.matchMinutes;
    tournament.schedule.restMinutes = template.schedule.restMinutes;
    tournament.stages[0].name = division.name;
    tournament.stages[0].config.meetings =
      template.stages.find((s) => s.id === templateLink.stageId)?.config
        .meetings ?? 1;
    competitions.push({
      tournamentId: tournament.id,
      stageId: tournament.stages[0].id,
      divisionId: division.id,
      weight: 1,
      resources: [],
      bindings: participants.map((p, i) => ({
        participantId: p.id,
        directoryId: members[i].id,
      })),
    });
    tournaments.push(await sealDocument(validateTournament(tournament)));
  }
  const collection = await sealCollection({
    ...input,
    id: crypto.randomUUID(),
    revision: 1,
    title,
    season,
    directory,
    competitions,
    adjustments: [],
    archived: false,
    updatedAt: new Date().toISOString(),
  });
  return validateBundle({ version: 1, collection, tournaments });
}
