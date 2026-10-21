import type { Locale, Match } from "../domain/types";

/** Recognize engine labels without renaming organizer-authored labels. */
export function generatedMatchLabel(
  match: Pick<Match, "label">,
  locale: Locale = "en",
): string {
  if (locale !== "fa") return match.label;
  const labels: Record<string, string> = {
    "Third place": "رده‌بندی",
    "Grand final": "فینال بزرگ",
    "Grand final reset": "تکرار فینال بزرگ",
  };
  if (labels[match.label]) return labels[match.label];
  const placement = /^Places (\d+)-(\d+)$/.exec(match.label);
  if (placement) return `رده‌های ${Number(placement[1]).toLocaleString("fa")} تا ${Number(placement[2]).toLocaleString("fa")}`;
  const generated = /^R(\d+) M(\d+)$/.exec(match.label);
  if (generated)
    return `دور ${Number(generated[1]).toLocaleString("fa")}، بازی ${Number(generated[2]).toLocaleString("fa")}`;
  return match.label;
}

export function groupLabel(group: string, locale: Locale = "en"): string {
  if (locale !== "fa") return group;
  const generated = /^Group ([A-Z]+|\d+)$/.exec(group);
  return generated
    ? `گروه ${/^\d+$/.test(generated[1]) ? Number(generated[1]).toLocaleString("fa") : generated[1]}`
    : group;
}
