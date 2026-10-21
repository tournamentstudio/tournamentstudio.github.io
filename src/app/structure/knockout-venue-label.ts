import type { KnockoutVenueTarget } from "../../domain/types";

export function venueRoundLabel(target: KnockoutVenueTarget, locale: string) {
  const fa = locale === "fa";
  if (target.bracket === "final") return fa ? "فینال بزرگ" : "Grand final";
  if (target.bracket === "reset") return fa ? "فینال تکراری" : "Reset final";
  if (target.bracket === "placement")
    return fa ? "دیدار رده‌بندی" : "Third-place match";
  return `${target.bracket === "winners" ? (fa ? "دور برندگان" : "Winners round") : fa ? "دور بازندگان" : "Losers round"} ${target.round.toLocaleString(locale)}`;
}

export function venueTargetLabel(target: KnockoutVenueTarget, locale: string) {
  const round = venueRoundLabel(target, locale);
  return target.bracket === "winners" || target.bracket === "losers"
    ? `${round}${locale === "fa" ? "، دیدار" : ", match"} ${(target.index + 1).toLocaleString(locale)}`
    : round;
}
