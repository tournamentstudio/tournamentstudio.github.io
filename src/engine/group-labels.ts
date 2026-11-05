import type { Stage, Tournament } from "../domain/types";
import { generatedGroupLabel } from "../domain/group-labels";

/** Call only on a generation copy after all played and dependent draw guards. */
export function prepareGroupLabels(
  tournament: Tournament,
  stage: Stage,
  count: number,
): void {
  if (stage.config.groupLabelVersion !== undefined) return;
  const legacy = Array.from({ length: count }, (_, index) =>
    generatedGroupLabel(stage, index),
  );
  if (
    !legacy.some(
      (label) =>
        /[\s<>"']/.test(label) ||
        [...label].some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  )
    return;
  if (
    tournament.stages.some((target) =>
      target.sources.some(
        (source) =>
          source.stageId === stage.id &&
          source.selection?.kind === "match-results",
      ),
    )
  )
    throw new Error(
      "Remove match outcome connections before regenerating their source draw.",
    );
  stage.config.groupLabelVersion = 1;
  const replacements = new Map(
    legacy.map((label, index) => [label, generatedGroupLabel(stage, index)]),
  );
  for (const target of tournament.stages) {
    for (const source of target.sources) {
      if (source.stageId !== stage.id) continue;
      if (source.selection?.kind === "positions") {
        source.selection.picks = source.selection.picks.map((pick) => ({
          ...pick,
          ...(pick.group !== undefined && replacements.has(pick.group)
            ? { group: replacements.get(pick.group)! }
            : {}),
        }));
      } else if (
        source.selection?.kind === "wildcard" &&
        source.selection.groups
      ) {
        source.selection.groups = source.selection.groups.map(
          (group) => replacements.get(group) ?? group,
        );
      }
    }
  }
}
