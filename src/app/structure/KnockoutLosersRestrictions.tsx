import type { KnockoutDrawConfig } from "../../domain/types";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { withSeparationRules } from "./knockout-config";

export function KnockoutLosersRestrictions({
  value,
  bracketSize,
  onChange,
}: {
  value: KnockoutDrawConfig;
  bracketSize: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t, locale } = useI18n();
  const rounds = Math.max(0, 2 * Math.log2(bracketSize) - 2);
  const rules = "losersSeparation" in value ? value.losersSeparation : [];
  return (
    <section
      className="draw-losers-restrictions"
      aria-label={t("Losers bracket separation", "جداسازی در جدول بازندگان")}
    >
      <h4>{t("Losers bracket separation", "جداسازی در جدول بازندگان")}</h4>
      <p className="muted">
        {t(
          "Protect selected losers rounds for every possible result path. These rules are independent of winners bracket separation. Opponents and drop paths stay fixed after the draw.",
          "دورهای انتخاب‌شده جدول بازندگان را برای همه مسیرهای ممکن نتایج محافظت کنید. این قوانین مستقل از جداسازی جدول برندگان هستند. پس از قرعه، حریفان و مسیرهای انتقال ثابت می‌مانند.",
        )}
      </p>
      <Notice>
        {t(
          "Losers paths can require entrants with the same label to meet earlier in the winners bracket. Combining both protections may be impossible. Preview checks the complete set of rules without relaxing any of them.",
          "مسیرهای بازندگان ممکن است به رویارویی زودتر شرکت‌کنندگان با نام منطقه یا سازمان یکسان در جدول برندگان نیاز داشته باشند. ترکیب هر دو محدودیت ممکن است ناممکن باشد. پیش‌نمایش، همه قوانین را بدون کنار گذاشتن هیچ‌کدام بررسی می‌کند.",
        )}
      </Notice>
      {rounds === 0 && (
        <p className="draw-separation-help">
          {t(
            "A two-slot bracket has no losers rounds. Grand finals and reset finals are outside these rules.",
            "جدول دو جایگاهی دور بازندگان ندارد. فینال بزرگ و فینال تکراری مشمول این قوانین نیستند.",
          )}
        </p>
      )}
      <div className="draw-losers-fields">
        {(["region", "organization"] as const).map((field) => {
          const throughRound =
            rules.find((rule) => rule.field === field)?.throughRound ?? 0;
          return (
            <div className="draw-restriction" key={field}>
              <Field
                label={
                  field === "region"
                    ? t(
                        "Separate regions through losers round",
                        "جداسازی منطقه‌ها تا پایان دور بازندگان",
                      )
                    : t(
                        "Separate organizations through losers round",
                        "جداسازی سازمان‌ها تا پایان دور بازندگان",
                      )
                }
              >
                <select
                  value={throughRound}
                  disabled={rounds === 0 && throughRound === 0}
                  onChange={(event) => {
                    const round = Number(event.target.value);
                    const next = round
                      ? rules.some((rule) => rule.field === field)
                        ? rules.map((rule) =>
                            rule.field === field
                              ? { field, throughRound: round }
                              : rule,
                          )
                        : [...rules, { field, throughRound: round }]
                      : rules.filter((rule) => rule.field !== field);
                    onChange(
                      withSeparationRules(
                        value,
                        value.version === 1 ? [] : value.separation,
                        next,
                      ),
                    );
                  }}
                >
                  <option value={0}>{t("Off", "غیرفعال")}</option>
                  {Array.from({ length: rounds }, (_, index) => {
                    const round = index + 1;
                    return (
                      <option key={round} value={round}>
                        {t("Losers round", "دور بازندگان")}{" "}
                        {round.toLocaleString(locale)}
                        {round === rounds
                          ? ` (${t("Losers final", "فینال بازندگان")})`
                          : ""}
                      </option>
                    );
                  })}
                  {throughRound > rounds && (
                    <option value={throughRound}>
                      {t("Losers round", "دور بازندگان")}{" "}
                      {throughRound.toLocaleString(locale)} (
                      {t("outside this bracket", "خارج از این جدول")})
                    </option>
                  )}
                </select>
              </Field>
              {throughRound > 0 && (
                <p className="draw-separation-help">
                  {t(
                    "Includes every losers round from round 1 to the selected round. BYEs and fixed qualifier slots are included in the path check.",
                    "همه دورهای بازندگان از دور ۱ تا دور انتخاب‌شده را در بر می‌گیرد. استراحت‌ها و جایگاه‌های ثابت صعودکنندگان هم در بررسی مسیرها لحاظ می‌شوند.",
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
