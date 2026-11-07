import type { Locale, TieBreaker } from "../domain/types";
import { rankingLabel } from "../standings/ranking-labels";
import "./competition.css";

export function RankingSummary({
  tieBreakers,
  locale = "en",
}: {
  tieBreakers: TieBreaker[];
  locale?: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  return (
    <div className="ranking-summary" dir={locale === "fa" ? "rtl" : "ltr"}>
      <p>
        <strong>{t("Ranking order", "ترتیب رتبه‌بندی")}</strong>
      </p>
      <ol>
        {tieBreakers.map((criterion) => (
          <li key={criterion}>{rankingLabel(criterion, locale)}</li>
        ))}
      </ol>
      <p>
        {t(
          "Compare from first to last. Equal values across every criterion keep a shared rank.",
          "معیارها به‌ترتیب بررسی می‌شوند. برابری در همه معیارها، رتبه مشترک را حفظ می‌کند.",
        )}
      </p>
      {tieBreakers.includes("differential") && (
        <p>
          {t(
            "Point difference is total points scored minus total points conceded in completed matches.",
            "تفاضل امتیاز، مجموع امتیاز کسب‌شده منهای مجموع امتیاز واگذارشده در بازی‌های پایان‌یافته است.",
          )}
        </p>
      )}
    </div>
  );
}
