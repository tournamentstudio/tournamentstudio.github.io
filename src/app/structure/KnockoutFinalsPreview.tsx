import { Check } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
} from "../../domain/types";
import { useI18n } from "../../i18n";

export function KnockoutFinalsPreview({
  value,
  preview,
}: {
  value: KnockoutDrawConfig | null;
  preview: KnockoutDrawPreview;
}) {
  const { t } = useI18n();
  if (value?.version !== 4 || !preview.ready) return null;
  const names = {
    "grand-final": t("Grand final", "فینال بزرگ"),
    reset: t("Reset final", "فینال تکراری"),
    "third-place": t("Third-place match", "دیدار رده‌بندی"),
  };
  return (
    <section
      className="draw-finals-preview"
      aria-label={t(
        "Verified finals and placement protection",
        "جداسازی تأییدشده فینال و رده‌بندی",
      )}
    >
      <h4>
        {t(
          "Verified finals and placement protection",
          "جداسازی تأییدشده فینال و رده‌بندی",
        )}
      </h4>
      <ul>
        {value.finalsSeparation.flatMap(({ field, targets }) =>
          targets.map((target) => (
            <li
              key={`${field}-${target}`}
              data-finals-separation-field={field}
              data-finals-separation-target={target}
            >
              <Check size={18} aria-hidden="true" />
              <span>
                <strong>{names[target]}</strong>
                <span>
                  {field === "region"
                    ? t("Regions", "منطقه‌ها")
                    : t("Organizations", "سازمان‌ها")}
                </span>
              </span>
            </li>
          )),
        )}
      </ul>
      <p>
        {t(
          "No pair with the same protected label can meet in these selected matches, regardless of earlier results. A reset may not be needed, and a third-place match may be a walkover. The draw does not change match paths or add extra matches.",
          "هیچ دو شرکت‌کننده با نام منطقه یا سازمان یکسان مشمول محدودیت، فارغ از نتایج قبلی، در این دیدارهای انتخاب‌شده روبه‌رو نمی‌شوند. ممکن است فینال تکراری لازم نشود یا رده‌بندی بدون مسابقه تعیین شود. قرعه مسیر دیدارها را تغییر نمی‌دهد و دیدار اضافه نمی‌سازد.",
        )}
      </p>
    </section>
  );
}
