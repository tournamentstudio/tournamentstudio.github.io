import type { Locale, Tournament } from "../domain/types";
import { publicProjection } from "../sharing";
import { escapeXML } from "../export";
import type { EventCollection } from "./model";
import { aggregateRankings } from "./rankings";
import { eventSchedule } from "./schedule";
export function publicEvent(
  collection: EventCollection,
  documents: Tournament[],
) {
  return {
    collection: {
      ...structuredClone(collection),
      description: "",
      hash: "",
      adjustments: collection.adjustments.map((a) => ({
        ...a,
        reason: "Organizer adjustment",
      })),
    },
    documents: documents.map(publicProjection),
  };
}
export function eventHTML(
  input: EventCollection,
  source: Tournament[],
  locale: Locale,
) {
  const { collection, documents } = publicEvent(input, source);
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const sections = collection.divisions
    .map((d) => {
      const result = aggregateRankings(collection, documents, d.id);
      return `<section><h2>${escapeXML(d.name)}</h2><p>${escapeXML(t("Weighted placement points", "امتیاز وزن‌دار جایگاه‌ها"))}</p>${result.pending.length ? `<p>${escapeXML(t("Incomplete competitions are excluded.", "مسابقات ناقص محاسبه نشده‌اند."))}</p>` : ""}<table><thead><tr><th>${t("Rank", "رتبه")}</th><th>${t("Participant", "شرکت‌کننده")}</th><th>${t("Points", "امتیاز")}</th></tr></thead><tbody>${result.rows.map((r) => `<tr><td>${r.rank}${r.tied ? " =" : ""}</td><td>${escapeXML(r.name)}</td><td>${Number(r.points.toFixed(3))}</td></tr>`).join("")}</tbody></table></section>`;
    })
    .join("");
  const slots = eventSchedule(collection, documents);
  return `<!doctype html><html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeXML(collection.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:20px;line-height:1.7;color:#17242d}table{border-collapse:collapse;width:100%}td,th{text-align:start;padding:10px;border-bottom:1px solid #ccc;overflow-wrap:anywhere}h1{overflow-wrap:anywhere}section{margin-block:32px}tr{break-inside:avoid}@media print{body{margin:0}section{break-before:page}section:first-of-type{break-before:auto}}</style></head><body><h1>${escapeXML(collection.title)}</h1><p>${escapeXML(collection.season)}</p>${sections}<section><h2>${t("Shared schedule", "برنامه مشترک")}</h2><table><thead><tr><th>${t("Competition", "مسابقات")}</th><th>${t("Start", "شروع")}</th><th>${t("Venue", "مکان")}</th></tr></thead><tbody>${slots.map((s) => `<tr><td>${escapeXML(s.title)}</td><td>${escapeXML(new Date(s.starts).toISOString())}</td><td>${escapeXML(s.venue)}</td></tr>`).join("")}</tbody></table></section></body></html>`;
}
