import type {
  KnockoutDrawConfig,
  KnockoutFinalTarget,
  Stage,
} from "../../domain/types";
import { Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { withSeparationRules } from "./knockout-config";

export function KnockoutFinalsRestrictions({
  value,
  stage,
  entrantCount,
  onChange,
}: {
  value: KnockoutDrawConfig;
  stage: Stage;
  entrantCount: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t } = useI18n();
  const rules = value.version === 4 ? value.finalsSeparation : [];
  const double = stage.format === "double-elimination";
  const targets = [
    {
      id: "grand-final" as const,
      name: t("Grand final", "فینال بزرگ"),
      shown: double,
      available: double && entrantCount >= 2,
      unavailable: t(
        "Requires double elimination with at least two entrants.",
        "به قالب دوحذفی با دست‌کم دو شرکت‌کننده نیاز دارد.",
      ),
      labels: [
        t("Separate regions in grand final", "جداسازی منطقه‌ها در فینال بزرگ"),
        t(
          "Separate organizations in grand final",
          "جداسازی سازمان‌ها در فینال بزرگ",
        ),
      ],
    },
    {
      id: "reset" as const,
      name: t("Reset final", "فینال تکراری"),
      shown: double,
      available: double && stage.config.grandFinalReset && entrantCount >= 2,
      unavailable: t(
        "Enable Double elimination final reset in Stage settings first. At least two entrants are required.",
        "ابتدا «بازنشانی فینال دو حذفی» را در تنظیمات مرحله فعال کنید. دست‌کم دو شرکت‌کننده لازم است.",
      ),
      labels: [
        t(
          "Separate regions in reset final",
          "جداسازی منطقه‌ها در فینال تکراری",
        ),
        t(
          "Separate organizations in reset final",
          "جداسازی سازمان‌ها در فینال تکراری",
        ),
      ],
    },
    {
      id: "third-place" as const,
      name: t("Third-place match", "دیدار رده‌بندی"),
      shown: !double,
      available:
        stage.format === "single-elimination" &&
        stage.config.thirdPlace &&
        entrantCount >= 3,
      unavailable: t(
        "Enable Third-place match in a single-elimination stage with at least three entrants.",
        "«دیدار رده‌بندی» را در مرحله تک‌حذفی با دست‌کم سه شرکت‌کننده فعال کنید.",
      ),
      labels: [
        t(
          "Separate regions in third-place match",
          "جداسازی منطقه‌ها در دیدار رده‌بندی",
        ),
        t(
          "Separate organizations in third-place match",
          "جداسازی سازمان‌ها در دیدار رده‌بندی",
        ),
      ],
    },
  ];

  function change(
    field: "region" | "organization",
    target: KnockoutFinalTarget,
    enabled: boolean,
  ) {
    const existing = rules.find((rule) => rule.field === field);
    const nextTargets = enabled
      ? [...(existing?.targets ?? []), target]
      : (existing?.targets ?? []).filter((item) => item !== target);
    const next = existing
      ? nextTargets.length
        ? rules.map((rule) =>
            rule.field === field ? { field, targets: nextTargets } : rule,
          )
        : rules.filter((rule) => rule.field !== field)
      : [...rules, { field, targets: nextTargets }];
    onChange(
      withSeparationRules(
        value,
        value.version === 1 ? [] : value.separation,
        "losersSeparation" in value ? value.losersSeparation : [],
        value.restrictions,
        next,
      ),
    );
  }

  return (
    <section
      className="draw-finals-restrictions"
      aria-label={t(
        "Finals and placement separation",
        "جداسازی فینال و رده‌بندی",
      )}
    >
      <h4>
        {t("Finals and placement separation", "جداسازی فینال و رده‌بندی")}
      </h4>
      <p className="muted">
        {t(
          "Protect each selected match for every possible result path. These settings are independent of winners and losers bracket rules.",
          "هر دیدار انتخاب‌شده را برای همه مسیرهای ممکن نتایج محافظت کنید. این تنظیمات مستقل از قوانین جدول برندگان و بازندگان هستند.",
        )}
      </p>
      <Notice>
        {double
          ? t(
              "Any two entrants can reach the grand final and its reset. Every entrant must have a different region or organization label for the selected protection. Moving seeds cannot separate repeated labels in these finals. Reset protection applies only if the reset is played.",
              "هر دو شرکت‌کننده ممکن است به فینال بزرگ و تکرار آن برسند. برای محدودیت انتخاب‌شده، نام منطقه یا سازمان همه شرکت‌کنندگان باید متفاوت باشد. جابه‌جایی سیدها نمی‌تواند نام‌های تکراری را در این فینال‌ها جدا کند. محدودیت فینال تکراری فقط در صورت برگزاری آن اعمال می‌شود.",
            )
          : t(
              "Third-place protection checks which entrants can lose opposite semifinals. Keeping matching labels apart here may require them to meet earlier in the winners bracket. Only the existing third-place match is covered, not other placement competitions.",
              "جداسازی رده‌بندی بررسی می‌کند کدام شرکت‌کنندگان می‌توانند بازنده دو نیمه‌نهایی مقابل باشند. جلوگیری از رویارویی نام‌های یکسان در این دیدار ممکن است نیازمند رویارویی زودتر آن‌ها در جدول برندگان باشد. فقط دیدار فعلی رده‌بندی پوشش داده می‌شود، نه دیگر رقابت‌های تعیین رتبه.",
            )}
      </Notice>
      <div className="draw-finals-fields">
        {targets
          .filter(
            (target) =>
              target.shown ||
              rules.some((rule) => rule.targets.includes(target.id)),
          )
          .map((target) => (
            <section
              className="draw-restriction"
              key={target.id}
              data-finals-target={target.id}
            >
              <h5>{target.name}</h5>
              {(["region", "organization"] as const).map((field, index) => {
                const checked = !!rules
                  .find((rule) => rule.field === field)
                  ?.targets.includes(target.id);
                return (
                  <label className="check-row" key={field}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!target.available && !checked}
                      onChange={(event) =>
                        change(field, target.id, event.target.checked)
                      }
                    />
                    <span>{target.labels[index]}</span>
                  </label>
                );
              })}
              {!target.available && (
                <p className="draw-separation-help">{target.unavailable}</p>
              )}
              {target.id === "third-place" && entrantCount === 3 && (
                <p className="draw-separation-help">
                  {t(
                    "With three entrants, the opening BYE recipient cannot lose a semifinal. The third-place match is a one-entrant walkover, so no pair can meet there.",
                    "با سه شرکت‌کننده، دریافت‌کننده استراحت آغازین نمی‌تواند بازنده نیمه‌نهایی شود. دیدار رده‌بندی با یک شرکت‌کننده و بدون مسابقه تعیین می‌شود؛ پس هیچ دو نفری در آن روبه‌رو نمی‌شوند.",
                  )}
                </p>
              )}
            </section>
          ))}
      </div>
    </section>
  );
}
