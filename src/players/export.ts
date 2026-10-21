import type { Locale, Tournament } from "../domain/types";
import { playerEventIssue, readPlayerStatistics } from "./model";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}
export function playerStatisticsCSV(
  doc: Tournament,
  locale: Locale = "en",
): string {
  const data = readPlayerStatistics(doc);
  const headers =
    locale === "fa"
      ? [
          "شناسه رویداد",
          "شناسه دیدار",
          "دیدار",
          "شناسه تیم",
          "تیم",
          "شناسه بازیکن",
          "بازیکن",
          "شاخص",
          "مقدار",
          "واحد",
          "بخش",
          "زمان سپری شده (ثانیه)",
          "وضعیت",
          "یادداشت خصوصی",
          "علت تغییر",
          "تاریخ ثبت",
          "تاریخ ویرایش",
          "تعداد اصلاحات",
        ]
      : [
          "Event ID",
          "Match ID",
          "Match",
          "Team ID",
          "Team",
          "Player ID",
          "Player",
          "Metric",
          "Value",
          "Unit",
          "Period",
          "Elapsed seconds",
          "Status",
          "Private notes",
          "Change reason",
          "Created",
          "Updated",
          "Revision count",
        ];
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
          locale === "fa" ? metric.fa || metric.label : metric.label,
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
