import type {
  AdvancementPreview,
  Stage,
  Tournament,
  WildcardTieBreaker,
} from "../../domain/types";
import { Notice } from "../../components/ui";
import { useI18n, localizedDiagnostic, groupLabel, generatedMatchLabel } from "../../i18n";
import { matchResultQualifiers } from "../../engine/match-qualifiers";

export function QualifierPreview({
  tournament,
  stage,
  preview,
}: {
  tournament: Tournament;
  stage: Stage;
  preview: AdvancementPreview;
}) {
  const { t, locale, number } = useI18n();
  const name = (id: string) =>
    tournament.participants.find((participant) => participant.id === id)
      ?.name ?? id;
  const metric = (value: number) =>
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
      maximumFractionDigits: 3,
    }).format(value);
  return (
    <section
      className="structure-qualifier-preview"
      aria-label={t("Qualifier preview", "پیش‌نمایش صعودکنندگان")}
    >
      <div className="structure-preview-heading">
        <h3>{t("Qualification preview", "پیش‌نمایش صعود")}</h3>
        <span className={`badge ${preview.ready ? "badge-green" : ""}`}>
          {preview.ready
            ? t("Ready to draw", "آماده قرعه")
            : t("Provisional", "موقت")}
        </span>
      </div>
      {!!preview.issues.length && (
        <Notice>
          <ul>
            {preview.issues.map((issue, index) => (
              <li key={index}>{localizedDiagnostic(issue, locale)}</li>
            ))}
          </ul>
        </Notice>
      )}
      <p>
        {t(
          "Preview follows the current connection draft. Incomplete results and unresolved cutoff ties block generation.",
          "پیش‌نمایش بر اساس پیش‌نویس اتصال است. نتایج ناقص و تساوی حل‌نشده در مرز صعود مانع قرعه می‌شوند.",
        )}
      </p>
      {preview.sources.map((source) => {
        const rule = stage.sources[source.index];
        const wildcard = rule?.selection?.kind === "wildcard";
        const comparisons: WildcardTieBreaker[] =
          rule?.selection?.kind === "wildcard"
            ? rule.selection.tieBreakers
            : ["points", "differential"];
        const comparisonLabels: Record<WildcardTieBreaker, string> = {
          points: t("Compared points", "امتیاز مقایسه"),
          wins: t("Compared wins", "برد مقایسه"),
          differential: t("Compared difference", "تفاضل مقایسه"),
          scored: t("Compared scored", "امتیاز کسب‌شده مقایسه"),
          seed: t("Original seed", "سید اولیه"),
        };
        return (
          <details key={source.index} open className="structure-preview-source">
            <summary>
              {t("Connection", "اتصال")} {number(source.index + 1)} ·{" "}
              {
                tournament.stages.find((item) => item.id === source.stageId)
                  ?.name
              }{" "}
              · {number(source.qualifierIds.length)} {t("selected", "منتخب")}
            </summary>
            {!!source.issues.length && (
              <ul className="structure-preview-issues">
                {source.issues.map((issue, index) => (
                  <li key={index}>{localizedDiagnostic(issue, locale)}</li>
                ))}
              </ul>
            )}
            {rule.selection?.kind === "match-results" ? (
              <ul>
                {matchResultQualifiers(tournament, rule.stageId, rule.selection.picks, rule.count).outcomes.map((pick, index) => <li key={index}>
                  {generatedMatchLabel({ label: tournament.matches.find((match) => match.id === pick.matchId)?.label ?? pick.matchId }, locale)}:
                  {" "}{pick.outcome === "winners" ? t("Winners", "برندگان") : t("Losers", "بازندگان")}
                  {" "}<bdi>{pick.participantIds.map(name).join(", ")}</bdi>
                </li>)}
              </ul>
            ) : source.candidates.length ? (
              <div className="structure-table-scroll">
                <table>
                  <caption>
                    {wildcard
                      ? t(
                          "Wildcard candidates and comparison values",
                          "نامزدهای سهمیه آزاد و مقادیر مقایسه",
                        )
                      : t(
                          "Source standings and qualifying places",
                          "جدول مبدأ و جایگاه‌های صعود",
                        )}
                  </caption>
                  <thead>
                    <tr>
                      <th>{t("Participant", "شرکت‌کننده")}</th>
                      <th>{t("Group / rank", "گروه / رتبه")}</th>
                      <th>{t("Played / compared", "بازی / مقایسه‌شده")}</th>
                      <th>{t("Points", "امتیاز")}</th>
                      {comparisons.map((key) => (
                        <th key={key}>{comparisonLabels[key]}</th>
                      ))}
                      <th>{t("Decision", "وضعیت")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {source.candidates.map((candidate, index) => (
                      <tr
                        key={`${candidate.participantId}:${candidate.group}:${index}`}
                        className={
                          candidate.selected
                            ? "qualifier-selected"
                            : candidate.tied
                              ? "qualifier-tied"
                              : ""
                        }
                      >
                        <th scope="row">
                          <bdi>{name(candidate.participantId)}</bdi>
                        </th>
                        <td>
                          {candidate.group
                            ? groupLabel(candidate.group, locale)
                            : t("All", "همه")}{" "}
                          / {number(candidate.rank)}
                        </td>
                        <td>
                          {number(candidate.metrics.played)} /{" "}
                          {number(candidate.comparisonPlayed)}
                        </td>
                        <td>{metric(candidate.metrics.points)}</td>
                        {comparisons.map((key) => (
                          <td key={key}>
                            {metric(
                              key === "seed"
                                ? (tournament.participants.find(
                                    (participant) =>
                                      participant.id ===
                                      candidate.participantId,
                                  )?.seed ?? 0)
                                : candidate.compared[key],
                            )}
                          </td>
                        ))}
                        <td
                          title={localizedDiagnostic(candidate.reason, locale)}
                        >
                          {candidate.selected
                            ? t("Qualifies", "صعود می‌کند")
                            : candidate.excluded
                              ? t("Excluded", "کنار گذاشته")
                              : candidate.tied
                                ? t("Unresolved tie", "تساوی حل‌نشده")
                                : t("Outside selection", "خارج از انتخاب")}
                          {candidate.reason && (
                            <small>
                              {localizedDiagnostic(candidate.reason, locale)}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                {t(
                  "Generate the source stage to see its entrants here.",
                  "برای دیدن شرکت‌کنندگان، مرحله مبدأ را قرعه‌کشی کنید.",
                )}
              </p>
            )}
          </details>
        );
      })}
      {!!preview.bracketSlots.length && (
        <div className="structure-slot-preview">
          <h4>{t("Fixed bracket positions", "جایگاه‌های ثابت حذفی")}</h4>
          <ol>
            {preview.bracketSlots.map((entry) => (
              <li key={entry.slot}>
                <span>
                  {t("Slot", "جایگاه")} {number(entry.slot)}
                </span>
                <bdi>{name(entry.participantId)}</bdi>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
