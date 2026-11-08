import type { Locale, TieBreaker } from "../domain/types";
import { translate } from "../i18n/translate";

const labels: Record<TieBreaker, [string, string]> = {
  points: ["Standings points", "امتیاز جدول"],
  wins: ["Wins", "برد"],
  differential: ["Point difference", "تفاضل امتیاز"],
  scored: ["Points scored", "امتیاز کسب‌شده"],
  "head-to-head": ["Head to head", "رو در رو"],
  "set-ratio": ["Set ratio", "نسبت ست"],
  "point-ratio": ["Point ratio", "نسبت امتیاز"],
  "fair-play": ["Fewest fair-play penalties", "کمترین جریمه بازی جوانمردانه"],
  buchholz: ["Buchholz", "بوخهولتز"],
  "median-buchholz": ["Median Buchholz", "بوخهولتز میانه"],
  "sonneborn-berger": ["Sonneborn-Berger", "سونبورن برگر"],
  seed: ["Seed", "سید"],
};

export function rankingLabel(criterion: TieBreaker, locale: Locale): string {
  return translate(locale, ...labels[criterion]);
}
