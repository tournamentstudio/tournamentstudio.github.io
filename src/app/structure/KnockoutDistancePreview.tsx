import { Check } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
} from "../../domain/types";
import { useI18n } from "../../i18n";

export function KnockoutDistancePreview({
  value,
  preview,
}: {
  value: KnockoutDrawConfig | null;
  preview: KnockoutDrawPreview;
}) {
  const { t, locale } = useI18n();
  if (value?.version !== 5 || !preview.ready) return null;
  const distance = value.distance;
  const formatLimit = (limit: number) =>
    limit.toLocaleString(locale, {
      maximumSignificantDigits: 21,
      notation: limit > 0 && limit < 0.000001 ? "scientific" : "standard",
    });
  const names = {
    "grand-final": t("Grand final", "فینال بزرگ"),
    reset: t("Reset final", "فینال تکراری"),
    "third-place": t("Third-place match", "دیدار رده‌بندی"),
  };
  const targets = [
    ...(distance.winnersThroughRound
      ? [
          {
            id: "winners",
            name: `${t("Winners rounds", "دورهای برندگان")} ${Number(1).toLocaleString(locale)} ${t("to", "تا")} ${distance.winnersThroughRound.toLocaleString(locale)}`,
          },
        ]
      : []),
    ...(distance.losersThroughRound
      ? [
          {
            id: "losers",
            name: `${t("Losers rounds", "دورهای بازندگان")} ${Number(1).toLocaleString(locale)} ${t("to", "تا")} ${distance.losersThroughRound.toLocaleString(locale)}`,
          },
        ]
      : []),
    ...distance.finals.map((id) => ({ id, name: names[id] })),
  ];
  return (
    <section
      className="draw-distance-preview"
      aria-label={t("Verified distance range", "بازه فاصله تأییدشده")}
    >
      <h4>{t("Verified distance range", "بازه فاصله تأییدشده")}</h4>
      <div className="draw-summary">
        {distance.minKm !== undefined && (
          <strong>
            {t("Minimum", "حداقل")}: {formatLimit(distance.minKm)}{" "}
            {t("km", "کیلومتر")}
          </strong>
        )}
        {distance.maxKm !== undefined && (
          <strong>
            {t("Maximum", "حداکثر")}: {formatLimit(distance.maxKm)}{" "}
            {t("km", "کیلومتر")}
          </strong>
        )}
      </div>
      <ul>
        {targets.map((target) => (
          <li key={target.id} data-distance-target={target.id}>
            <Check size={18} aria-hidden="true" />
            <span>{target.name}</span>
          </li>
        ))}
      </ul>
      <p>
        {t(
          "Every possible opponent pair in these matches satisfies the range using the current base coordinates. Opening-match distances below are rounded for display; validation uses the unrounded distance.",
          "فاصله همه حریفان ممکن در این دیدارها با مختصات فعلی پایگاه‌ها در بازه مجاز است. فاصله دیدارهای آغازین در پایین فقط برای نمایش گرد شده است؛ بررسی با فاصله گردنشده انجام می‌شود.",
        )}
      </p>
    </section>
  );
}
