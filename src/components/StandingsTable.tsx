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
  const participantMap = new Map(tournament.participants.map((p) => [p.id, p]));
  const n = (v: number) =>
    v.toLocaleString(locale === "fa" ? "fa-IR" : "en-US", {
      maximumFractionDigits: 2,
    });
  return (
    <div
      className="standings-scroll themed"
      style={themeStyle(tournament.theme)}
      data-pattern={getTheme(tournament.theme.preset).pattern}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <table className="standings-table">
        <caption>
          {t("Standings", "جدول رده‌بندی")}
          {group ? ` · ${group}` : ""}
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
              ["For", "زده"],
              ["Against", "خورده"],
              ["Diff.", "تفاضل"],
              ["Points", "امتیاز"],
            ].map(([en, fa]) => (
              <th key={en} scope="col">
                {t(en, fa)}
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
