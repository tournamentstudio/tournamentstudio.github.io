import type { KnockoutDrawConfig } from "../../domain/types";
import { Field } from "../../components/ui";
import { useI18n } from "../../i18n";

type SeparationField = "region" | "organization";

export function KnockoutRestrictions({
  value,
  bracketSize,
  onChange,
}: {
  value: KnockoutDrawConfig;
  bracketSize: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t, locale } = useI18n();
  const rounds = Math.log2(bracketSize);
  const separation = value.version === 2 ? value.separation : [];
  function change(field: SeparationField, enabled: boolean, throughRound = 1) {
    const restrictions = enabled
      ? value.restrictions.includes(field)
        ? value.restrictions
        : [...value.restrictions, field]
      : value.restrictions.filter((item) => item !== field);
    const next =
      enabled && throughRound > 1
        ? separation.some((item) => item.field === field)
          ? separation.map((item) =>
              item.field === field ? { field, throughRound } : item,
            )
          : [...separation, { field, throughRound }]
        : separation.filter((item) => item.field !== field);
    const base = {
      pots: value.pots,
      restrictions,
      protectedSeeds: value.protectedSeeds,
    };
    onChange(
      next.length
        ? { version: 2, ...base, separation: next }
        : { version: 1, ...base },
    );
  }
  return (
    <>
      <h4>
        {t("Separation through knockout rounds", "جداسازی در دورهای حذفی")}
      </h4>
      <p className="muted">
        {t(
          "Enter region and organization in Participants. Use consistent labels and fill blank values before previewing a restricted draw.",
          "منطقه و سازمان را در بخش شرکت‌کنندگان وارد کنید. پیش از پیش‌نمایش قرعه محدودشده، نام‌ها را یکسان و مقادیر خالی را تکمیل کنید.",
        )}
      </p>
      {(["region", "organization"] as const).map((field) => {
        const throughRound =
          separation.find((item) => item.field === field)?.throughRound ?? 1;
        const enabled = value.restrictions.includes(field);
        const sections = bracketSize / 2 ** throughRound;
        return (
          <div className="draw-restriction" key={field}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  change(field, event.target.checked, throughRound)
                }
              />
              {field === "region"
                ? t(
                    "Separate the same region",
                    "جدا کردن شرکت‌کنندگان هم‌منطقه",
                  )
                : t(
                    "Separate the same organization",
                    "جدا کردن شرکت‌کنندگان هم‌سازمان",
                  )}
            </label>
            {enabled && (
              <>
                <Field
                  label={
                    field === "region"
                      ? t(
                          "Separate regions through round",
                          "جداسازی منطقه‌ها تا پایان دور",
                        )
                      : t(
                          "Separate organizations through round",
                          "جداسازی سازمان‌ها تا پایان دور",
                        )
                  }
                >
                  <select
                    value={throughRound}
                    onChange={(event) =>
                      change(field, true, Number(event.target.value))
                    }
                  >
                    {Array.from({ length: rounds }, (_, index) => {
                      const round = index + 1;
                      return (
                        <option key={round} value={round}>
                          {t("Round", "دور")} {round.toLocaleString(locale)}
                          {round === rounds
                            ? ` (${t("Winners final", "فینال برندگان")})`
                            : round === rounds - 1
                              ? ` (${t("Winners semifinal", "نیمه‌نهایی برندگان")})`
                              : ""}
                        </option>
                      );
                    })}
                    {throughRound > rounds && (
                      <option value={throughRound}>
                        {t("Round", "دور")}{" "}
                        {throughRound.toLocaleString(locale)} (
                        {t("outside this bracket", "خارج از این جدول")})
                      </option>
                    )}
                  </select>
                </Field>
                {throughRound <= rounds && (
                  <p className="draw-separation-help">
                    {throughRound === rounds
                      ? field === "region"
                        ? t(
                            "Every entrant needs a different region at this depth.",
                            "در این عمق، منطقه همه شرکت‌کنندگان باید متفاوت باشد.",
                          )
                        : t(
                            "Every entrant needs a different organization at this depth.",
                            "در این عمق، سازمان همه شرکت‌کنندگان باید متفاوت باشد.",
                          )
                      : field === "region"
                        ? t(
                            `At most ${sections.toLocaleString(locale)} entrants may share a region, including entrants with BYEs. They cannot meet before winners round ${(throughRound + 1).toLocaleString(locale)}.`,
                            `حداکثر ${sections.toLocaleString(locale)} شرکت‌کننده، با احتساب دریافت‌کنندگان استراحت، می‌توانند هم‌منطقه باشند. رویارویی آن‌ها پیش از دور ${(throughRound + 1).toLocaleString(locale)} جدول برندگان ممکن نیست.`,
                          )
                        : t(
                            `At most ${sections.toLocaleString(locale)} entrants may share an organization, including entrants with BYEs. They cannot meet before winners round ${(throughRound + 1).toLocaleString(locale)}.`,
                            `حداکثر ${sections.toLocaleString(locale)} شرکت‌کننده، با احتساب دریافت‌کنندگان استراحت، می‌توانند هم‌سازمان باشند. رویارویی آن‌ها پیش از دور ${(throughRound + 1).toLocaleString(locale)} جدول برندگان ممکن نیست.`,
                          )}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
