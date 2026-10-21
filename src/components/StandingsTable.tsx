import type { Locale, Tournament } from "../domain/types";
import { getStandings } from "../engine";
import { getTheme, themeStyle } from "../themes";
import "../themes/themes.css";
import "./competition.css";
export function StandingsTable({
  tournament,
  stageId,
  group,
  locale = "en",
}: {
  tournament: Tournament;
  stageId?: string;
  group?: string;
  locale?: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const standings = getStandings(tournament, stageId, group);
  const cumulative =
    tournament.stages.find((s) => s.id === stageId)?.config.timeRanking ===
    "cumulative";
  const extraColumns = [
    {
      key: "setRatio" as const,
      policy: "set-ratio",
      en: "Set ratio",
      fa: "نسبت ست",
    },
    {
      key: "pointRatio" as const,
      policy: "point-ratio",
      en: "Point ratio",
      fa: "نسبت امتیاز",
    },
    {
      key: "fairPlay" as const,
      policy: "fair-play",
      en: "Fair-play penalties",
      fa: "جریمه جوانمردانه",
    },
  ].filter((column) =>
    tournament.rules.tieBreakers.some((policy) => policy === column.policy),
  );
  const participantMap = new Map(tournament.participants.map((p) => [p.id, p]));
  const n = (v: number) =>
    v.toLocaleString(locale === "fa" ? "fa-IR" : "en-US", {
      maximumFractionDigits: cumulative ? 3 : 2,
    });
  return (
    <div
      className="standings-scroll themed"
      role="region"
      tabIndex={0}
      aria-label={t("Scrollable standings", "جدول قابل پیمایش")}
      style={themeStyle(tournament.theme)}
      data-pattern={getTheme(tournament.theme.preset).pattern}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <table className="standings-table">
        <caption>
          {t("Standings", "جدول رده‌بندی")}
          {group ? ` · ${group}` : ""}
          {cumulative
            ? ` · ${t("Lowest completed total time", "کمترین زمان مجموع کامل")}`
            : ""}
        </caption>
        <thead>
          <tr>
            {[
              ["Rank", "رتبه"],
              ["Participant", "شرکت‌کننده"],
              ["Played", "بازی"],
              ["Won", "برد"],
              ["Drawn", "مساوی"],
              ["Lost", "باخت"],
              cumulative ? ["Recorded time", "زمان ثبت‌شده"] : ["For", "زده"],
              ["Against", "خورده"],
              ["Diff.", "تفاضل"],
              ["Points", "امتیاز"],
            ].map(([en, fa]) => (
              <th key={en} scope="col">
                {t(en, fa)}
              </th>
            ))}
            {extraColumns.map((column) => (
              <th scope="col" key={column.key}>
                {t(column.en, column.fa)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.participantId}>
              <td>
                {n(s.rank)}
                {s.tied && (
                  <span title={t("Unresolved tie", "تساوی حل‌نشده")}>*</span>
                )}
              </td>
              <th scope="row">
                <bdi>
                  {participantMap.get(s.participantId)?.name ??
                    t("Unknown participant", "شرکت‌کننده ناشناس")}
                </bdi>
              </th>
              {[
                s.played,
                s.wins,
                s.draws,
                s.losses,
                s.scored,
                s.conceded,
                s.differential,
              ].map((v, i) => (
                <td key={i}>{n(v)}</td>
              ))}
              <td>
                <strong>{n(s.points)}</strong>
              </td>
              {extraColumns.map((column) => (
                <td key={column.key}>
                  {s[column.key] === null ? (
                    <span aria-label={t("Incomplete evidence", "داده ناقص")}>
                      ·
                    </span>
                  ) : (
                    n(s[column.key]!)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!standings.length && (
        <p className="competition-empty">
          {t(
            "Standings appear when participants join this stage.",
            "پس از افزودن شرکت‌کنندگان، جدول نمایش داده می‌شود.",
          )}
        </p>
      )}
      {standings.some((s) => s.tied) && (
        <p className="standings-note">
          *{" "}
          {t(
            "Equal on all configured tie-breakers. Add a valid tie-break rule before qualification.",
            "در تمام معیارهای تعیین‌شده برابرند. پیش از صعود، معیار معتبری برای رفع تساوی اضافه کنید.",
          )}
        </p>
      )}
    </div>
  );
}
