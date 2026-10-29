import type { Stage, Tournament } from "../../domain/types";
import { swissPolicy } from "../../domain/swiss";
import {
  previewAdvancement,
  previewGroupDraw,
  generateStage,
  validateGraph,
} from "../../engine";
import { stageProtection } from "./helpers";

function editable(input: Tournament, stageId: string): [Tournament, Stage] {
  const tournament = structuredClone(input);
  const stage = tournament.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error("The destination stage does not exist.");
  if (stageProtection(tournament, stageId).locked)
    throw new Error(
      "Reset an unplayed draw before changing entrant assignments.",
    );
  return [tournament, stage];
}

export function manualQualifierConfig(
  input: Tournament,
  stageId: string,
  ids?: string[],
) {
  const [tournament, stage] = editable(input, stageId);
  if (!stage.sources.length)
    throw new Error("Connect a source stage before selecting qualifiers.");
  if (ids) stage.config.manualQualifiers = [...ids];
  else delete stage.config.manualQualifiers;
  if (ids) {
    const preview = previewAdvancement(tournament, stageId);
    if (!preview.ready) throw new Error(preview.issues.join(" "));
  }
  return stage.config;
}

export function manualGroupConfig(
  input: Tournament,
  stageId: string,
  groups?: string[][],
) {
  const [tournament, stage] = editable(input, stageId);
  if (stage.format !== "groups" && stage.format !== "gsl")
    throw new Error("Manual group composition needs a groups or GSL stage.");
  if (stage.config.draw)
    throw new Error(
      "Apply the standard group draw before editing manual groups. Saved pot restrictions remain unchanged.",
    );
  if (groups) {
    stage.config.groups = structuredClone(groups);
    stage.config.groupCount = groups.length;
  } else delete stage.config.groups;
  const preview = previewGroupDraw(tournament, stageId);
  if (!preview.ready) throw new Error(preview.issues.join(" "));
  return stage.config;
}

export function swissRestrictionConfig(
  input: Tournament,
  stageId: string,
  pairs: string[][],
) {
  const [tournament, stage] = editable(input, stageId);
  if (stage.format !== "swiss")
    throw new Error("Pairing restrictions need a Swiss stage.");
  const federation = swissPolicy(stage).federation;
  if (federation && pairs.length)
    throw new Error("FIDE Dutch does not support forbidden-pair rules.");
  const entrants = previewAdvancement(tournament, stageId);
  if (!entrants.ready) throw new Error(entrants.issues.join(" "));
  const allowed = new Set(entrants.participantIds);
  const seen = new Set<string>();
  for (const pair of pairs) {
    if (
      pair.length !== 2 ||
      pair[0] === pair[1] ||
      pair.some((id) => !allowed.has(id))
    )
      throw new Error(
        "Select two distinct entrants from this stage for each forbidden pairing.",
      );
    const key = JSON.stringify([...pair].sort());
    if (seen.has(key))
      throw new Error("This forbidden pairing is already listed.");
    seen.add(key);
  }
  stage.config.forbiddenPairs = structuredClone(pairs);
  if (federation) {
    const errors = validateGraph(tournament);
    if (errors.length) throw new Error(errors.join(" "));
  } else generateStage(tournament, stageId);
  return stage.config;
}
