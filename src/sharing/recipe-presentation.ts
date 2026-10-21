import type { Tournament } from "../domain/types";

export function recipePresentation(
  source: Tournament["presentation"],
  participants: Map<string, string>,
): Tournament["presentation"] {
  const presentation = structuredClone(source);
  presentation.sponsors = [];
  delete presentation.sponsorCards;
  if (presentation.overlay) delete presentation.overlay.matchId;
  presentation.scenes = presentation.scenes.map((scene) => {
    delete scene.matchId;
    return {
      ...scene,
      id: crypto.randomUUID(),
      title: "",
      text: "",
      ...(scene.participantIds
        ? {
            participantIds: scene.participantIds.map((id) => {
              const value = participants.get(id);
              if (!value)
                throw new Error(
                  "Recipe contains an unknown participant position.",
                );
              return value;
            }),
          }
        : {}),
    };
  });
  return presentation;
}
