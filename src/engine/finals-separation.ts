import type {
  GroupDrawIssue,
  KnockoutDrawConfig,
  Participant,
} from "../domain/types";
import { normalizeDrawLabel } from "../domain/draw";

export type ThirdPlaceRule = { labels: Map<string, string> };

/** Opposite semifinal losers meet; an opening BYE has no loser. */
export function canMeetInThirdPlace(
  size: number,
  byes: Set<string>,
  a: string,
  firstMatch: number,
  b: string,
  secondMatch: number,
): boolean {
  if (size < 4 || (size === 4 && (byes.has(a) || byes.has(b)))) return false;
  return (
    Math.floor(firstMatch / (size / 4)) !== Math.floor(secondMatch / (size / 4))
  );
}

export function prepareFinalsSeparation(
  draw: Extract<KnockoutDrawConfig, { version: 4 | 5 }>,
  participantIds: string[],
  participants: Map<string, Participant>,
): { issues: GroupDrawIssue[]; thirdPlace: ThirdPlaceRule[] } {
  const issues: GroupDrawIssue[] = [];
  const thirdPlace: ThirdPlaceRule[] = [];
  for (const rule of draw.finalsSeparation) {
    const labels = new Map<string, string>();
    const totals = new Map<string, { name: string; count: number }>();
    let missing = false;
    for (const id of participantIds) {
      const raw = participants.get(id)![rule.field] ?? "";
      const label = normalizeDrawLabel(raw);
      if (!label) missing = true;
      labels.set(id, label);
      const previous = totals.get(label);
      totals.set(label, {
        name: previous?.name ?? raw.trim(),
        count: (previous?.count ?? 0) + 1,
      });
    }
    if (missing)
      issues.push({
        code: rule.field === "region" ? "missingRegion" : "missingOrganization",
        values: [],
      });
    if (rule.targets.some((target) => target !== "third-place"))
      for (const [label, { name, count }] of totals)
        if (label && count > 1)
          issues.push({
            code: "finalsCapacity",
            values: [name, String(count)],
          });
    if (rule.targets.includes("third-place")) {
      if (participantIds.length < 3)
        issues.push({ code: "thirdPlaceUnavailable", values: [] });
      thirdPlace.push({ labels });
    }
  }
  return { issues, thirdPlace };
}
