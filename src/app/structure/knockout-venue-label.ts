import { translate } from "../../i18n/translate";
import type { KnockoutVenueTarget, Locale } from "../../domain/types";

export function venueRoundLabel(target: KnockoutVenueTarget, locale: Locale) {
  if (target.bracket === "final")
    return translate(locale, "Grand final", "فینال بزرگ");
  if (target.bracket === "reset")
    return translate(locale, "Reset final", "فینال تکراری");
  if (target.bracket === "placement")
    return translate(locale, "Third-place match", "دیدار رده‌بندی");
  const label =
    target.bracket === "winners"
      ? translate(locale, "Winners round", "دور برندگان")
      : translate(locale, "Losers round", "دور بازندگان");
  return `${label} ${target.round.toLocaleString(locale)}`;
}

export function venueTargetLabel(target: KnockoutVenueTarget, locale: Locale) {
  const round = venueRoundLabel(target, locale);
  return target.bracket === "winners" || target.bracket === "losers"
    ? `${round}${translate(locale, ", match", "، دیدار")} ${(target.index + 1).toLocaleString(locale)}`
    : round;
}
