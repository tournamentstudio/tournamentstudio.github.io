import { useMemo, useState } from "react";
import type { Match, Participant } from "../domain/types";
import { useI18n } from "../i18n";
import type { MetricDefinition, MetricValues } from "./metrics";
import { metricStatistics } from "./metric-statistics";

export function MetricStatistics({
  definitions,
  participants,
  matches,
}: {
  definitions: MetricDefinition[];
  participants: Participant[];
  matches: (Omit<Match, "result"> & {
    result?: Match["result"] & { metrics?: MetricValues };
  })[];
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      metricStatistics(
        definitions,
        participants.map((p) => p.id),
        matches,
      ),
    [definitions, participants, matches],
  );
  const names = useMemo(
    () => new Map(participants.map((p) => [p.id, p.name])),
    [participants],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  if (!definitions.length) return null;
  return (
    <section className="panel">
      <h3>{t("Recorded sport statistics", "آمار ثبت شده ورزش")}</h3>
      <p>
        {t(
          "Each cell uses its configured aggregation and shows the number of recorded matches. An empty cell means no value was recorded.",
          "هر خانه با روش تعیین شده محاسبه می‌شود و تعداد دیدارهای ثبت شده را نشان می‌دهد. خانه خالی یعنی مقداری ثبت نشده است.",
        )}
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Entrant", "شرکت‌کننده")}</th>
              {definitions.map((d) => (
                <th key={d.id}>
                  <bdi>{d.name}</bdi>
                  {d.unit && <> ({d.unit})</>}
                  <br />
                  <small>
                    {
                      {
                        sum: t("Sum", "مجموع"),
                        average: t("Average", "میانگین"),
                        min: t("Minimum", "کمینه"),
                        max: t("Maximum", "بیشینه"),
                      }[d.aggregate]
                    }
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 50, (currentPage + 1) * 50).map((row) => (
              <tr key={row.participantId}>
                <td>
                  <bdi>{names.get(row.participantId)}</bdi>
                </td>
                {definitions.map((d) => (
                  <td key={d.id}>
                    {row.values[d.id] ? (
                      <>
                        <strong>
                          {row.values[d.id].value.toLocaleString(locale, {
                            maximumFractionDigits: 6,
                          })}
                        </strong>
                        <br />
                        <small>
                          {row.values[d.id].matches.toLocaleString(locale)}{" "}
                          {t("matches", "دیدار")}
                        </small>
                      </>
                    ) : (
                      <span aria-label={t("Not recorded", "ثبت نشده")}>·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="button-row">
          <button
            className="button secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("Previous statistics page", "صفحه قبلی آمار")}
          </button>
          <span>
            {(currentPage + 1).toLocaleString(locale)} /{" "}
            {pageCount.toLocaleString(locale)}
          </span>
          <button
            className="button secondary"
            disabled={currentPage + 1 === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("Next statistics page", "صفحه بعدی آمار")}
          </button>
        </div>
      )}
    </section>
  );
}
