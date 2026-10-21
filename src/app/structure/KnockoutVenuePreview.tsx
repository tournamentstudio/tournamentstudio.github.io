import { Check } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
  Resource,
} from "../../domain/types";
import { useI18n } from "../../i18n";
import { venueTargetLabel } from "./knockout-venue-label";
import { knockoutVenueTargetKey } from "../../engine/venue-distance";

export function KnockoutVenuePreview({
  value,
  preview,
  resources,
}: {
  value: KnockoutDrawConfig | null;
  preview: KnockoutDrawPreview;
  resources: Resource[];
}) {
  const { t, locale } = useI18n();
  if (value?.version !== 6 || !preview.ready) return null;
  const formatLimit = (limit: number) =>
    limit.toLocaleString(locale, {
      maximumSignificantDigits: 21,
      notation: limit > 0 && limit < 0.000001 ? "scientific" : "standard",
    });
  return (
    <section
      className="draw-venue-preview"
      aria-label={t("Verified venue assignments", "تخصیص تأییدشده محل بازی")}
    >
      <h4>{t("Verified venue assignments", "تخصیص تأییدشده محل بازی")}</h4>
      {value.venueRules.map((rule, index) => (
        <div className="draw-venue-verified" key={index}>
          <h5>
            <bdi>
              {resources.find((resource) => resource.id === rule.resourceId)
                ?.name ?? t("Missing venue", "محل بازی یافت نشد")}
            </bdi>
          </h5>
          <div className="draw-summary">
            {rule.minKm !== undefined && (
              <strong>
                {t("Minimum", "حداقل")}: {formatLimit(rule.minKm)}{" "}
                {t("km", "کیلومتر")}
              </strong>
            )}
            {rule.maxKm !== undefined && (
              <strong>
                {t("Maximum", "حداکثر")}: {formatLimit(rule.maxKm)}{" "}
                {t("km", "کیلومتر")}
              </strong>
            )}
          </div>
          <ul>
            {rule.targets.map((target) => (
              <li key={knockoutVenueTargetKey(target)}>
                <Check size={18} aria-hidden="true" />
                <span>{venueTargetLabel(target, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p>
        {t(
          "Every entrant who can reach these match slots satisfies the venue range using the current coordinates. The assigned venues are saved when you generate the draw. BYEs and walkovers keep their venue assignment even when no match is played.",
          "هر شرکت‌کننده‌ای که می‌تواند به جایگاه‌های این دیدارها برسد، با مختصات فعلی در بازه مجاز محل بازی قرار دارد. هنگام ساخت قرعه، محل‌های اختصاص‌یافته ذخیره می‌شوند. دیدارهای دارای استراحت یا برد بدون مسابقه، حتی در صورت برگزار نشدن، تخصیص محل بازی خود را حفظ می‌کنند.",
        )}
      </p>
    </section>
  );
}
