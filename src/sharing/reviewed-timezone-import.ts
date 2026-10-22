import type { Tournament } from "../domain/types";
import {
  sealDocument,
  validateArchiveRevisions,
  type ArchiveBundle,
  type ArchiveRevision,
} from "./index";
import {
  applyLegacyTimezoneReview,
  type LegacyTimezoneChoice,
} from "./legacy-timezones";

export async function prepareReviewedTimezoneImport(
  original: Tournament,
  revisions: ArchiveRevision[],
  choices: LegacyTimezoneChoice[],
  action: string,
  baselineAction = "Original imported backup",
): Promise<ArchiveBundle> {
  if (!choices.length) return { tournament: original, revisions };
  if (
    [action, baselineAction].some(
      (label) => !label.trim() || label.length > 1000,
    )
  )
    throw new Error("The timezone review needs a valid history label.");

  const history = await validateArchiveRevisions(original, revisions);
  const baseline = await sealDocument(original);
  const corrected = applyLegacyTimezoneReview(baseline, choices);
  const at = new Date().toISOString();
  const revision = baseline.revision + 1;
  const tournament = await sealDocument({
    ...corrected,
    revision,
    updatedAt: at,
    history: [
      ...baseline.history,
      { id: crypto.randomUUID(), at, revision, action },
    ].slice(-500),
  });

  if (!history.some((entry) => entry.tournament.revision === baseline.revision))
    history.push({ action: baselineAction, tournament: baseline });

  return {
    tournament,
    revisions: [...history.slice(-49), { action, tournament }],
  };
}
