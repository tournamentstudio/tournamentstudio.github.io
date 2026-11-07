import type { Locale, Tournament } from "../domain/types";
import { getStandings } from "../engine";
import { getTheme, themeStyle } from "../themes";
import { RankingSummary } from "./RankingSummary";
import "../themes/themes.css";
import "./competition.css";
export function StandingsTable({
  tournament,
  stageId,
  group,
  locale = "en",
  hideCaption = false,
  hideRankingSummary = false,
}: {
  tournament: Tournament;
  stageId?: string;
  group?: string;
  locale?: Locale;
  hideCaption?: boolean;
  hideRankingSummary?: boolean;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const standings = getStandings(tournament, stageId, group);
  const petanque = tournament.sport === "petanque";
  const stage = tournament.stages.find((item) => item.id === stageId);
  const orderedRanking = stage
    ? ["round-robin", "groups"].includes(stage.format)
    : tournament.stages.every((item) =>
        ["round-robin", "groups"].includes(item.format),
      );
  const cumulative = stage?.config.timeRanking === "cumulative";
  const petanqueColumns = petanque && !cumulative;
  const showDrawn =
    !petanqueColumns ||
    tournament.rules.allowDraws ||
    standings.some((row) => row.draws > 0);
  const showPoints =
    !petanqueColumns || tournament.rules.tieBreakers.includes("points");
  const playedColumns = [
    { key: "played" as const, en: "Played", fa: "بازی" },
    { key: "wins" as const, en: "Won", fa: "برد" },
    ...(showDrawn ? [{ key: "draws" as const, en: "Drawn", fa: "مساوی" }] : []),
    { key: "losses" as const, en: "Lost", fa: "باخت" },
  ];
  const scoreColumns = petanqueColumns
    ? [
        {
          key: "differential" as const,
          en: "Point difference",
          fa: "تفاضل امتیاز",
        },
        { key: "scored" as const, en: "Points scored", fa: "امتیاز کسب‌شده" },
        {
          key: "conceded" as const,
          en: "Points conceded",
          fa: "امتیاز واگذارشده",
        },
      ]
    : [
        {
          key: "scored" as const,
          en: cumulative ? "Recorded time" : "For",
          fa: cumulative ? "زمان ثبت‌شده" : "زده",
        },
        { key: "conceded" as const, en: "Against", fa: "خورده" },
        { key: "differential" as const, en: "Diff.", fa: "تفاضل" },
      ];
  const columns = [
    ...playedColumns,
    ...scoreColumns,
    ...(showPoints
      ? [
          {
            key: "points" as const,
            en: petanqueColumns ? "Standings points" : "Points",
            fa: petanqueColumns ? "امتیاز جدول" : "امتیاز",
          },
        ]
      : []),
  ];
  const emphasized = orderedRanking
    ? tournament.rules.tieBreakers[0]
    : "points";
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
    <div className="standings-frame" dir={locale === "fa" ? "rtl" : "ltr"}>
      {petanque && orderedRanking && !hideRankingSummary && (
        <RankingSummary
          tieBreakers={tournament.rules.tieBreakers}
          locale={locale}
        />
      )}
      <div
        className="standings-scroll themed"
        role="region"
        tabIndex={0}
        aria-label={t("Scrollable standings", "جدول قابل پیمایش")}
        style={themeStyle(tournament.theme)}
        data-pattern={getTheme(tournament.theme.preset).pattern}
      >
        <table className="standings-table">
          <caption className={hideCaption ? "sr-only" : undefined}>
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
                ...columns.map((column) => [column.en, column.fa]),
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
              <tr key={s.participantId} data-rank={s.rank}>
                <td>
                  <bdi dir="ltr">{n(s.rank)}</bdi>
                  {s.tied && (
                    <span title={t("Shared rank", "رتبه مشترک")}>*</span>
                  )}
                </td>
                <th scope="row">
                  <bdi>
                    {participantMap.get(s.participantId)?.name ??
                      t("Unknown participant", "شرکت‌کننده ناشناس")}
                  </bdi>
                </th>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.key === emphasized ? (
                      <strong>
                        <bdi dir="ltr">{n(s[column.key])}</bdi>
                      </strong>
                    ) : (
                      <bdi dir="ltr">{n(s[column.key])}</bdi>
                    )}
                  </td>
                ))}
                {extraColumns.map((column) => (
                  <td key={column.key}>
                    {s[column.key] === null ? (
                      <span aria-label={t("Incomplete evidence", "داده ناقص")}>
                        ·
                      </span>
                    ) : (
                      <bdi dir="ltr">{n(s[column.key]!)}</bdi>
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
            {orderedRanking && (
              <>
                {t(
                  "Equal on every ranking criterion.",
                  "در همه معیارهای رتبه‌بندی برابرند.",
                )}{" "}
              </>
            )}
            {t(
              "Shared ranks are kept. If a tied place affects qualification, agree how to resolve it before advancing entrants.",
              "رتبه مشترک حفظ می‌شود. اگر تساوی بر صعود اثر دارد، پیش از صعود شرکت‌کنندگان درباره روش رفع آن توافق کنید.",
            )}
          </p>
        )}
      </div>
    </div>
  );
}
