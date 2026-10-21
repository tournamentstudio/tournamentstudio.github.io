import { TrendingUp, Trophy, Target, Activity } from "lucide-react";
import type { Tournament } from "../domain/types";
import { getStandings } from "../engine";
import { Empty } from "../components/ui";
import { useI18n, generatedMatchLabel } from "../i18n";
export function Statistics({ tournament: doc }: { tournament: Tournament }) {
  const { t, locale } = useI18n();
  const played = doc.matches.filter(
    (m) => m.result && m.status === "completed",
  );
  if (!played.length)
    return (
      <Empty
        title={t(
          "The story is still being written",
          "داستان هنوز در حال شکل‌گیری است",
        )}
      >
        {t(
          "Record a match result to see real performance statistics.",
          "برای دیدن آمار واقعی یک نتیجه ثبت کنید.",
        )}
      </Empty>
    );
  const rows = getStandings(doc);
  const scored = played.reduce(
    (sum, m) => sum + (m.result?.scores.reduce((a, b) => a + b, 0) ?? 0),
    0,
  );
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>{t("Every match tells a story", "هر دیدار داستانی دارد")}</h2>
          <p>
            {t(
              "Calculated only from recorded results. BYEs are excluded from played-match totals.",
              "محاسبه فقط از نتایج ثبت شده. استراحت از تعداد دیدارهای بازی شده حذف شده است.",
            )}
          </p>
        </div>
      </div>
      <div className="stat-grid">
        {[
          [Activity, played.length, t("Matches played", "دیدارهای انجام شده")],
          [Target, scored, t("Total score recorded", "مجموع امتیاز ثبت شده")],
          [
            Trophy,
            played.filter((m) => m.result?.outcome === "draw").length,
            t("Drawn matches", "دیدارهای مساوی"),
          ],
          [
            TrendingUp,
            `${Math.round((played.length / Math.max(1, doc.matches.filter((m) => m.status !== "bye" && m.status !== "canceled").length)) * 100)}%`,
            t("Competition progress", "پیشرفت مسابقات"),
          ],
        ].map(([Icon, value, label], i) => {
          const Mark = Icon as typeof Activity;
          return (
            <article className="stat-card" key={i}>
              <Mark size={20} />
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </article>
          );
        })}
      </div>
      <div className="two-columns">
        <section className="panel">
          <h3>{t("Points by participant", "امتیاز هر شرکت‌کننده")}</h3>
          <div className="bar-chart">
            {[...rows]
              .sort((a, b) => b.points - a.points)
              .slice(0, 16)
              .map((r) => (
                <div className="bar-row" key={r.participantId}>
                  <bdi>
                    {
                      doc.participants.find((p) => p.id === r.participantId)
                        ?.name
                    }
                  </bdi>
                  <div>
                    <span
                      style={{
                        width: `${Math.max(0, (r.points / Math.max(1, ...rows.map((x) => x.points))) * 100)}%`,
                      }}
                    />
                  </div>
                  <b>{r.points.toLocaleString(locale)}</b>
                </div>
              ))}
          </div>
        </section>
        <section className="panel">
          <h3>{t("Performance summary", "خلاصه عملکرد")}</h3>
          <div className="table-scroll">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>{t("Entrant", "شرکت‌کننده")}</th>
                  <th>{t("Win %", "درصد برد")}</th>
                  <th>{t("For", "کسب شده")}</th>
                  <th>{t("Against", "واگذار شده")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.participantId}>
                    <td>
                      <bdi>
                        {
                          doc.participants.find((p) => p.id === r.participantId)
                            ?.name
                        }
                      </bdi>
                    </td>
                    <td>
                      {r.played ? Math.round((r.wins / r.played) * 100) : 0}%
                    </td>
                    <td>{r.scored}</td>
                    <td>{r.conceded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel">
        <h3>{t("Recent results", "نتایج اخیر")}</h3>
        {[...played]
          .sort((a, b) =>
            (b.result?.recordedAt ?? "").localeCompare(
              a.result?.recordedAt ?? "",
            ),
          )
          .slice(0, 20)
          .map((m) => (
            <div className="result-history-row" key={m.id}>
              <span>{generatedMatchLabel(m, locale)}</span>
              <bdi>
                {m.slots
                  .map(
                    (s) =>
                      doc.participants.find((p) => p.id === s.participantId)
                        ?.name,
                  )
                  .join(" / ")}
              </bdi>
              <strong>{m.result?.scores.join(" : ")}</strong>
            </div>
          ))}
      </section>
    </div>
  );
}
