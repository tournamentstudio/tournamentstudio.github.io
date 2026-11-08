import type { Locale, Match } from "../domain/types";
import { translate } from "./translate";
import { localeTag } from "./locales";

/** Recognize engine labels without renaming organizer-authored labels. */
export function generatedMatchLabel(
  match: Pick<Match, "label">,
  locale: Locale = "en",
): string {
  if (locale === "en") return match.label;
  const labels: Record<string, string> = {
    "Third place": "رده‌بندی",
    "Grand final": "فینال بزرگ",
    "Grand final reset": "تکرار فینال بزرگ",
  };
  if (labels[match.label])
    return translate(locale, match.label, labels[match.label]);
  const placement = /^Places (\d+)-(\d+)$/.exec(match.label);
  if (placement)
    return translate(
      locale,
      `Places ${Number(placement[1]).toLocaleString(localeTag(locale))}-${Number(placement[2]).toLocaleString(localeTag(locale))}`,
      `رده‌های ${Number(placement[1]).toLocaleString("fa")} تا ${Number(placement[2]).toLocaleString("fa")}`,
    );
  const generated = /^R(\d+) M(\d+)$/.exec(match.label);
  if (generated)
    return translate(
      locale,
      `Round ${Number(generated[1]).toLocaleString(localeTag(locale))}, match ${Number(generated[2]).toLocaleString(localeTag(locale))}`,
      `دور ${Number(generated[1]).toLocaleString("fa")}، بازی ${Number(generated[2]).toLocaleString("fa")}`,
    );
  return match.label;
}

export function groupLabel(group: string, locale: Locale = "en"): string {
  if (locale === "en") return group;
  const generated = /^Group ([A-Z]+|\d+)$/.exec(group);
  return generated
    ? translate(
        locale,
        `Group ${/^\d+$/.test(generated[1]) ? Number(generated[1]).toLocaleString(localeTag(locale)) : generated[1]}`,
        `گروه ${/^\d+$/.test(generated[1]) ? Number(generated[1]).toLocaleString("fa") : generated[1]}`,
      )
    : group;
}
