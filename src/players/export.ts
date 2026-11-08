import { translate } from "../i18n/translate";
import type { Locale, Tournament } from "../domain/types";
import { playerEventIssue, readPlayerStatistics } from "./model";
import { playerMetricLabel } from "./labels";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}
export function playerStatisticsCSV(
  doc: Tournament,
  locale: Locale = "en",
): string {
  const data = readPlayerStatistics(doc);
  const headers = [
    ["Event ID", "شناسه رویداد"],
    ["Match ID", "شناسه دیدار"],
    ["Match", "دیدار"],
    ["Team ID", "شناسه تیم"],
    ["Team", "تیم"],
    ["Player ID", "شناسه بازیکن"],
    ["Player", "بازیکن"],
    ["Metric", "شاخص"],
    ["Value", "مقدار"],
    ["Unit", "واحد"],
    ["Period", "بخش"],
    ["Elapsed seconds", "زمان سپری شده (ثانیه)"],
    ["Status", "وضعیت"],
    ["Private notes", "یادداشت خصوصی"],
    ["Change reason", "علت تغییر"],
    ["Created", "تاریخ ثبت"],
    ["Updated", "تاریخ ویرایش"],
    ["Revision count", "تعداد اصلاحات"],
  ].map(([en, fa]) => translate(locale, en, fa));
  return (
    "\uFEFF" +
    [
      headers,
      ...data.events.map((e) => {
        const metric = data.metrics.find((m) => m.id === e.metricId)!;
        return [
          e.id,
          e.matchId,
          e.matchLabel,
          e.teamId,
          e.teamName,
          e.playerId,
          e.playerName,
          playerMetricLabel(metric, doc.sport, locale),
          e.value,
          metric.unit,
          e.period,
          e.elapsedSeconds,
          e.status === "active" && playerEventIssue(doc, e)
            ? "quarantined"
            : e.status,
          e.notes,
          e.reason,
          e.createdAt,
          e.updatedAt,
          e.history.length,
        ];
      }),
    ]
      .map((row) => row.map(csv).join(","))
      .join("\r\n")
  );
}
