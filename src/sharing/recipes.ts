import { z } from "zod";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import {
  presentationSchema,
  rulesSchema,
  stageSchema,
  themeSchema,
  validateTournament,
} from "../domain/validate";
import {
  decodeTransport,
  encodeTransport,
  publicProjection,
  remapRecipeReferences,
} from "./index";
import { recipePresentation } from "./recipe-presentation";

const recipeSchema = z
  .object({
    format: z.literal("tournastudio-recipe"),
    version: z.literal(2),
    count: z.number().int().min(1).max(512),
    sport: z.string().max(240),
    stages: z.array(stageSchema).min(1).max(64),
    resources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(160),
            name: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(64),
    rules: rulesSchema,
    theme: themeSchema,
    presentation: presentationSchema,
  })
  .strict();

function lookup(map: Map<string, string>, id: string): string {
  const value = map.get(id);
  if (!value)
    throw new Error("Recipe contains an undefined structure reference.");
  return value;
}

function remapStages(
  stages: Tournament["stages"],
  participants: Map<string, string>,
  stageIds: Map<string, string>,
  resourceIds: Map<string, string>,
): Tournament["stages"] {
  return stages.map((stage) => {
    const config = remapRecipeReferences(stage.config, participants);
    if (config.knockoutDraw?.version === 6)
      config.knockoutDraw.venueRules = config.knockoutDraw.venueRules.map(
        (rule) => ({
          ...rule,
          resourceId: lookup(resourceIds, rule.resourceId),
        }),
      );
    return {
      ...stage,
      id: lookup(stageIds, stage.id),
      config,
      participantIds: stage.participantIds.map((id) =>
        lookup(participants, id),
      ),
      sources: stage.sources.map((source) => ({
        ...source,
        stageId: lookup(stageIds, source.stageId),
      })),
      status: "draft",
      metadata: {},
    };
  });
}

export async function encodeStageRecipe(input: Tournament): Promise<string> {
  const tournament = publicProjection(input);
  if (!tournament.stages.length)
    throw new Error("Add a stage before exporting a recipe.");
  const participants = new Map(
    tournament.participants.map((participant, index) => [
      participant.id,
      `slot-${index + 1}`,
    ]),
  );
  const stageIds = new Map(
    tournament.stages.map((stage, index) => [stage.id, `stage-${index + 1}`]),
  );
  const usedResources = [
    ...new Set(
      tournament.stages.flatMap((stage) =>
        stage.config.knockoutDraw?.version === 6
          ? stage.config.knockoutDraw.venueRules.map((rule) => rule.resourceId)
          : [],
      ),
    ),
  ];
  const resources = usedResources.map((id, index) => ({
    sourceId: id,
    id: `venue-${index + 1}`,
    name: `Venue ${index + 1}`,
  }));
  const stages = remapStages(
    tournament.stages,
    participants,
    stageIds,
    new Map(resources.map((resource) => [resource.sourceId, resource.id])),
  ).map((stage, index) => ({ ...stage, name: `Stage ${index + 1}` }));
  const theme = { ...tournament.theme };
  delete theme.logo;
  delete theme.backgroundImage;
  return encodeTransport(
    "TSR2",
    recipeSchema.parse({
      format: "tournastudio-recipe",
      version: 2,
      count: tournament.participants.length,
      sport: tournament.sport,
      stages,
      resources: resources.map(({ id, name }) => ({ id, name })),
      rules: tournament.rules,
      theme,
      presentation: recipePresentation(tournament.presentation, participants),
    }),
  );
}

export async function decodeStageRecipe(code: string): Promise<Tournament> {
  const recipe = recipeSchema.parse(await decodeTransport("TSR2", code));
  if (
    new Set(recipe.stages.map((stage) => stage.id)).size !==
      recipe.stages.length ||
    new Set(recipe.resources.map((resource) => resource.id)).size !==
      recipe.resources.length
  )
    throw new Error("Recipe contains duplicate structure references.");
  const tournament = createTournament(
    "Imported recipe",
    Array.from({ length: recipe.count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    recipe.stages[0].format,
    recipe.sport,
  );
  const participants = new Map(
    tournament.participants.map((participant, index) => [
      `slot-${index + 1}`,
      participant.id,
    ]),
  );
  const stageIds = new Map(
    recipe.stages.map((stage) => [stage.id, crypto.randomUUID()]),
  );
  const resources = new Map(
    recipe.resources.map((resource) => [resource.id, crypto.randomUUID()]),
  );
  tournament.stages = remapStages(
    recipe.stages,
    participants,
    stageIds,
    resources,
  );
  if (recipe.resources.length)
    tournament.schedule.resources = recipe.resources.map((resource) => ({
      id: lookup(resources, resource.id),
      name: resource.name,
    }));
  tournament.rules = recipe.rules;
  tournament.theme = recipe.theme;
  tournament.presentation = recipePresentation(
    recipe.presentation,
    participants,
  );
  return validateTournament(tournament);
}
