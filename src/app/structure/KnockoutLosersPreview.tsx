import { Check } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
} from "../../domain/types";
import { useI18n } from "../../i18n";

export function KnockoutLosersPreview({
  value,
  preview,
}: {
  value: KnockoutDrawConfig | null;
  preview: KnockoutDrawPreview;
}) {
  const { t, locale } = useI18n();
  if (
    !value ||
    !("losersSeparation" in value) ||
    !value.losersSeparation.length ||
    !preview.ready
  )
    return null;
  return (
    <section
      className="draw-losers-preview"
      aria-label={t(
        "Verified losers bracket protection",
        "جداسازی تأییدشده جدول بازندگان",
      )}
    >
      <h4>
        {t(
          "Verified losers bracket protection",
          "جداسازی تأییدشده جدول بازندگان",
        )}
      </h4>
      <ul>
        {value.losersSeparation.map(({ field, throughRound }) => (
          <li
            key={field}
            data-losers-separation-field={field}
            data-through-round={throughRound}
          >
            <Check size={18} aria-hidden="true" />
            <span>
              <strong>
                {field === "region"
                  ? t("Regions", "منطقه‌ها")
                  : t("Organizations", "سازمان‌ها")}
              </strong>
              <span>
                {t("Protected losers rounds", "دورهای محافظت‌شده بازندگان")}:{" "}
                {Number(1).toLocaleString(locale)}
                {throughRound > 1 &&
                  ` ${t("to", "تا")} ${throughRound.toLocaleString(locale)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p>
        {t(
          "No pair with the same protected label can meet in these losers rounds, regardless of who wins earlier matches. Final and placement protections are configured separately.",
          "هیچ دو شرکت‌کننده با نام منطقه یا سازمان یکسان مشمول محدودیت، فارغ از برنده دیدارهای قبلی، در این دورهای بازندگان روبه‌رو نمی‌شوند. جداسازی فینال و دیدار رده‌بندی جداگانه تنظیم می‌شود.",
        )}
      </p>
    </section>
  );
}
