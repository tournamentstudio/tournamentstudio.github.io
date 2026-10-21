import { createContext, useContext } from "react";
import type { FormatId, Locale, TournamentStatus } from "../domain/types";

export const LocaleContext = createContext<Locale>("en");
export function useI18n() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (en: string, fa: string) => (locale === "fa" ? fa : en),
    number: (n: number) =>
      new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n),
    date: (v: string) =>
      new Date(v).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
  };
}
const formatNames: Record<FormatId, [string, string]> = {
  "single-elimination": ["Single elimination", "تک حذفی"],
  "double-elimination": ["Double elimination", "دو حذفی"],
  "triple-elimination": ["Three-loss elimination", "حذفی با سه باخت"],
  "round-robin": ["Round robin", "دوره‌ای"],
  groups: ["Groups & pools", "گروه‌ها"],
  swiss: ["Swiss system", "سیستم سوئیسی"],
  gsl: ["GSL groups", "گروه‌های GSL"],
  "free-for-all": ["Free for all", "رقابت چندنفره"],
  gauntlet: ["Gauntlet", "رقابت پلکانی"],
  ladder: ["Challenge ladder", "نردبان چالشی"],
  "time-trial": ["Time trial", "رقابت زمانی"],
  "grand-prix": ["Grand Prix", "گرندپری"],
};
export const formatName = (id: FormatId, locale: Locale = "en") =>
  formatNames[id]?.[locale === "fa" ? 1 : 0] ?? id;
const statuses: Record<TournamentStatus, [string, string]> = {
  draft: ["Draft", "پیش‌نویس"],
  ready: ["Ready", "آماده"],
  registration: ["Registration open", "ثبت‌نام باز"],
  "check-in": ["Check-in", "پذیرش"],
  scheduled: ["Scheduled", "زمان‌بندی شده"],
  "in-progress": ["In progress", "در حال برگزاری"],
  paused: ["Paused", "متوقف"],
  completed: ["Completed", "پایان یافته"],
  archived: ["Archived", "بایگانی"],
  canceled: ["Canceled", "لغو شده"],
};
export const statusName = (id: TournamentStatus, locale: Locale = "en") =>
  statuses[id]?.[locale === "fa" ? 1 : 0] ?? id;

export { localizedDiagnostic } from "./diagnostics";
export { generatedMatchLabel, groupLabel } from "./match-labels";
