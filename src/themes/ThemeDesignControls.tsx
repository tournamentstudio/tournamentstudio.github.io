import type { Locale } from "../domain/types";
import type { ThemeDesign } from "../domain/display-options";
import type { DesignedTheme } from "./library";
import { getTheme } from "./index";
import { Field } from "../components/ui";

export function ThemeDesignControls({
  theme,
  onChange,
  locale,
}: {
  theme: DesignedTheme;
  onChange: (theme: DesignedTheme) => void;
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const design = theme.design ?? {},
    base = getTheme(theme.preset);
  const update = (changes: Partial<ThemeDesign>) =>
    onChange({ ...theme, design: { ...design, ...changes } });
  return (
    <section
      className="theme-advanced-controls"
      aria-labelledby="theme-design-heading"
    >
      <h3 id="theme-design-heading">
        {t("Typography, surfaces and motion", "قلم، سطح و حرکت")}
      </h3>
      <div className="theme-fields">
        <Field label={t("Font weight", "وزن قلم")}>
          <input
            type="range"
            min="300"
            max="900"
            step="50"
            value={design.fontWeight ?? 500}
            onChange={(event) =>
              update({ fontWeight: Number(event.target.value) })
            }
          />
        </Field>
        <Field label={t("Text alignment", "چیدمان متن")}>
          <select
            value={design.textAlign ?? "start"}
            onChange={(event) =>
              update({
                textAlign: event.target.value as ThemeDesign["textAlign"],
              })
            }
          >
            <option value="start">{t("Start", "آغاز")}</option>
            <option value="center">{t("Center", "وسط")}</option>
            <option value="end">{t("End", "پایان")}</option>
          </select>
        </Field>
        <Field label={t("Card surface", "سطح کارت")}>
          <select
            value={design.cardStyle ?? "flat"}
            onChange={(event) =>
              update({
                cardStyle: event.target.value as ThemeDesign["cardStyle"],
              })
            }
          >
            <option value="flat">{t("Flat", "ساده")}</option>
            <option value="outline">{t("Outline", "حاشیه‌ای")}</option>
            <option value="elevated">{t("Raised", "برجسته")}</option>
            <option value="glass">{t("Frosted glass", "شیشه مات")}</option>
          </select>
        </Field>
        <Field label={t("Card color", "رنگ کارت")}>
          <input
            type="color"
            value={design.cardColor ?? base.card}
            onChange={(event) => update({ cardColor: event.target.value })}
          />
        </Field>
        <Field label={t("Table surface", "سطح جدول")}>
          <select
            value={design.tableStyle ?? "lined"}
            onChange={(event) =>
              update({
                tableStyle: event.target.value as ThemeDesign["tableStyle"],
              })
            }
          >
            <option value="lined">{t("Ruled rows", "ردیف خط‌دار")}</option>
            <option value="striped">
              {t("Alternating rows", "ردیف رنگی یک‌درمیان")}
            </option>
            <option value="minimal">{t("Minimal", "کمینه")}</option>
          </select>
        </Field>
        <Field label={t("Shadow depth", "عمق سایه")}>
          <select
            value={design.shadow ?? "none"}
            onChange={(event) =>
              update({ shadow: event.target.value as ThemeDesign["shadow"] })
            }
          >
            <option value="none">{t("None", "بدون سایه")}</option>
            <option value="soft">{t("Soft", "ملایم")}</option>
            <option value="strong">{t("Deep", "عمیق")}</option>
          </select>
        </Field>
        <Field label={t("Winner emphasis", "تأکید بر برنده")}>
          <select
            value={design.winnerEffect ?? "color"}
            onChange={(event) =>
              update({
                winnerEffect: event.target.value as ThemeDesign["winnerEffect"],
              })
            }
          >
            <option value="color">{t("Accent color", "رنگ اصلی")}</option>
            <option value="glow">{t("Glow", "درخشش")}</option>
            <option value="underline">{t("Underline", "زیرخط")}</option>
          </select>
        </Field>
        <Field label={t("Transition seconds", "زمان حرکت به ثانیه")}>
          <input
            type="number"
            min="0.1"
            max="3"
            step="0.1"
            value={design.animationSeconds ?? 0.35}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value) && value >= 0.1 && value <= 3)
                update({ animationSeconds: value });
            }}
          />
        </Field>
        <Field label={t("Default bracket layout", "چیدمان پیش‌فرض جدول")}>
          <select
            value={design.bracketLayout ?? "horizontal"}
            onChange={(event) =>
              update({
                bracketLayout: event.target
                  .value as ThemeDesign["bracketLayout"],
              })
            }
          >
            <option value="horizontal">{t("One-sided", "یک‌طرفه")}</option>
            <option value="vertical">
              {t("Top to bottom", "بالا به پایین")}
            </option>
            <option value="centered">
              {t("Centered final", "فینال در مرکز")}
            </option>
            <option value="compact">{t("Compact", "فشرده")}</option>
          </select>
        </Field>
        <Field label={t("Sponsor placement", "جای حامیان")}>
          <select
            value={design.sponsorPosition ?? "bottom"}
            onChange={(event) =>
              update({
                sponsorPosition: event.target
                  .value as ThemeDesign["sponsorPosition"],
              })
            }
          >
            <option value="bottom">{t("Below the scene", "پایین نما")}</option>
            <option value="top">{t("Above the scene", "بالای نما")}</option>
          </select>
        </Field>
        <label>
          <span>{t("Gradient background", "پس‌زمینه طیفی")}</span>
          <input
            type="checkbox"
            checked={Boolean(design.gradient)}
            onChange={(event) =>
              update({
                gradient: event.target.checked
                  ? {
                      from: theme.background ?? base.background,
                      to: theme.accent ?? base.accent,
                      angle: 135,
                    }
                  : undefined,
              })
            }
          />
        </label>
        {design.gradient && (
          <>
            <Field label={t("Gradient start", "آغاز طیف")}>
              <input
                type="color"
                value={design.gradient.from}
                onChange={(event) =>
                  update({
                    gradient: { ...design.gradient!, from: event.target.value },
                  })
                }
              />
            </Field>
            <Field label={t("Gradient end", "پایان طیف")}>
              <input
                type="color"
                value={design.gradient.to}
                onChange={(event) =>
                  update({
                    gradient: { ...design.gradient!, to: event.target.value },
                  })
                }
              />
            </Field>
            <Field label={t("Gradient angle", "زاویه طیف")}>
              <input
                type="range"
                min="0"
                max="360"
                value={design.gradient.angle}
                onChange={(event) =>
                  update({
                    gradient: {
                      ...design.gradient!,
                      angle: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </>
        )}
      </div>
      <div className="theme-tools">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...theme,
              background: "#f6f8f6",
              foreground: "#17352a",
              design: { ...design, gradient: undefined, cardColor: "#ffffff" },
            })
          }
        >
          {t("Make a light adaptation", "ساخت نسخه روشن")}
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...theme,
              background: "#101c19",
              foreground: "#f3f7f4",
              design: { ...design, gradient: undefined, cardColor: "#1b2b25" },
            })
          }
        >
          {t("Make a dark adaptation", "ساخت نسخه تیره")}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...theme, design: undefined })}
        >
          {t("Reset design controls", "بازنشانی تنظیمات طراحی")}
        </button>
      </div>
    </section>
  );
}
