import { useId, useState } from "react";
import { z } from "zod";
import type { Locale, ThemeSettings, Tournament } from "../domain/types";
import { downloadText } from "../export";
import { validateRasterAsset } from "../security/codec";
import {
  gameCollections,
  getTheme,
  getThemesForSport,
  readImageAsset,
  themes,
  themeStyle,
} from "./index";
import { GameIdentity, ThemeMotif } from "./ThemeMotif";
import { contrastRatio } from "./contrast";
import "./themes.css";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const themeFileSchema = z.object({
  version: z.literal(1),
  theme: z.object({
    preset: z.string().max(80),
    accent: color.optional(),
    background: color.optional(),
    foreground: color.optional(),
    radius: z.number().min(0).max(40).optional(),
    fontScale: z.number().min(0.7).max(2).optional(),
    spacing: z.number().min(0.5).max(2).optional(),
    borderWidth: z.number().min(0).max(5).optional(),
    connector: z.enum(["solid", "dashed"]).optional(),
    font: z.enum(["inter", "vazirmatn", "serif", "mono"]).optional(),
    backgroundImage: z.string().refine(validateRasterAsset).optional(),
    logo: z.string().refine(validateRasterAsset).optional(),
    reducedMotion: z.boolean(),
  }),
});
export function ThemeStudio({
  tournament,
  onChange,
  locale = "en",
}: {
  tournament: Tournament;
  onChange: (theme: ThemeSettings) => void;
  locale?: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const id = useId(),
    current = tournament.theme,
    base = getTheme(current.preset);
  const related = getThemesForSport(tournament.sport);
  const game = gameCollections[tournament.sport] ?? gameCollections.generic;
  const query = search.normalize("NFKC").toLocaleLowerCase(locale);
  const visible = (showAll ? themes : related).filter(
    (theme) =>
      (category === "all" || theme.category === category) &&
      [
        theme.name,
        theme.fa,
        theme.description,
        theme.descriptionFa,
        theme.collection.name,
        theme.collection.fa,
      ].some((value) =>
        value.normalize("NFKC").toLocaleLowerCase(locale).includes(query),
      ),
  );
  const previewContrast = contrastRatio(
    current.foreground ?? base.foreground,
    current.background ?? base.background,
  );
  const update = (part: Partial<ThemeSettings>) =>
    onChange({ ...current, ...part });
  const upload = async (
    file: File | undefined,
    field: "backgroundImage" | "logo",
  ) => {
    if (!file) return;
    try {
      update({ [field]: await readImageAsset(file) });
      setError("");
    } catch {
      setError(
        t(
          "Use a PNG, JPEG or WebP image under 2 MB and 16 megapixels.",
          "تصویر PNG، JPEG یا WebP کمتر از ۲ مگابایت و ۱۶ مگاپیکسل انتخاب کنید.",
        ),
      );
    }
  };
  const importTheme = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error("size");
      const parsed = themeFileSchema.parse(JSON.parse(await file.text()));
      onChange(parsed.theme);
      setError("");
    } catch {
      setError(
        t(
          "This theme file is invalid or too large.",
          "فایل قالب نامعتبر یا بیش از حد بزرگ است.",
        ),
      );
    }
  };
  return (
    <div className="theme-studio" dir={locale === "fa" ? "rtl" : "ltr"}>
      <div
        className="theme-preview themed"
        style={themeStyle(current)}
        data-pattern={base.pattern}
      >
        <div className="theme-preview-top">
          <GameIdentity
            sport={tournament.sport}
            preset={current.preset}
            locale={locale}
          />
          <ThemeMotif
            preset={current.preset}
            variant="ornament"
            className="theme-preview-art"
          />
        </div>
        {current.logo && (
          <img
            src={current.logo}
            alt={t("Tournament logo", "نشان مسابقات")}
            width={64}
            height={64}
            style={{ objectFit: "contain" }}
          />
        )}
        <h3>{tournament.title}</h3>
        <div className="theme-preview-card">
          <span>
            {tournament.participants[0]?.name ??
              t("First participant", "شرکت‌کننده اول")}
          </span>
          <b>3</b>
          <span>
            {tournament.participants[1]?.name ??
              t("Second participant", "شرکت‌کننده دوم")}
          </span>
          <b>1</b>
        </div>
        <small>
          {t(
            "Theme preview. These scores are an illustration.",
            "پیش‌نمایش قالب. این امتیازها نمایشی هستند.",
          )}
        </small>
      </div>
      {previewContrast < 4.5 && (
        <p className="theme-contrast-note" role="status">
          {t(
            "Your custom text and background have low contrast. Choose a darker or lighter text color for readable small labels.",
            "رنگ متن و پس‌زمینه سفارشی کنتراست کمی دارند. برای خوانایی نوشته کوچک، رنگ متن روشن‌تر یا تیره‌تر انتخاب کنید.",
          )}
        </p>
      )}
      <div className="theme-gallery-heading">
        <div>
          <span className="theme-gallery-eyebrow">
            {t("DESIGNED FOR THE GAME", "طراحی برای بازی")}
          </span>
          <h3>
            {showAll
              ? t("Explore every collection", "همه مجموعه‌ها را ببینید")
              : t(game.name, game.fa)}
          </h3>
          <p>
            {showAll
              ? t(
                  "Choose the setting, material and character of your competition.",
                  "فضا، جنس و شخصیت رقابت را انتخاب کنید.",
                )
              : t(
                  "A collection selected for this activity. Every theme can still be used with any game.",
                  "مجموعه‌ای برای این فعالیت. هر قالب را می‌توانید برای هر بازی به کار ببرید.",
                )}
          </p>
        </div>
        <button
          type="button"
          className="theme-scope-toggle"
          aria-pressed={showAll}
          onClick={() => {
            setShowAll(!showAll);
            setCategory("all");
          }}
        >
          {showAll
            ? t("Show themes for my game", "قالب‌های بازی من")
            : t(
                `Show all ${themes.length} themes`,
                `نمایش همه ${themes.length.toLocaleString("fa-IR")} قالب`,
              )}
        </button>
      </div>
      <div className="theme-gallery-tools">
        <label className="theme-search" htmlFor={`${id}-search`}>
          <span>{t("Search themes", "جستجوی قالب‌ها")}</span>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "Try velvet, court or ink",
              "مثلاً مخمل، زمین یا مرکب",
            )}
          />
        </label>
        <label className="theme-category" htmlFor={`${id}-category`}>
          {t("Collection", "مجموعه")}
          <select
            id={`${id}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              ["all", "All themes", "همه قالب‌ها"],
              ["general", "General", "عمومی"],
              ["sports", "Sports", "ورزشی"],
              ["gaming", "Gaming", "بازی"],
              ["persian", "Persian", "ایرانی"],
              ["seasonal", "Seasonal", "فصلی"],
            ].map(([value, en, fa]) => (
              <option key={value} value={value}>
                {t(en, fa)}
              </option>
            ))}
          </select>
        </label>
        <span className="theme-result-count" role="status">
          {visible.length.toLocaleString(locale)} {t("themes", "قالب")}
        </span>
      </div>
      <div className="theme-preset-grid">
        {visible.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className="theme-choice themed"
            data-pattern={preset.pattern}
            style={themeStyle({ preset: preset.id, reducedMotion: false })}
            aria-label={t(preset.name, preset.fa)}
            aria-pressed={current.preset === preset.id}
            onClick={() =>
              onChange({
                preset: preset.id,
                reducedMotion: current.reducedMotion,
                logo: current.logo,
                backgroundImage: current.backgroundImage,
              })
            }
          >
            <span className="theme-choice-top">
              <span className="theme-choice-collection">
                {t(preset.collection.name, preset.collection.fa)}
              </span>
              <span className="theme-choice-check">
                {current.preset === preset.id
                  ? t("Selected", "انتخاب‌شده")
                  : ""}
              </span>
            </span>
            <ThemeMotif preset={preset.id} className="theme-choice-art" />
            <span className="theme-choice-score">
              <span>{t("HOME", "میزبان")}</span>
              <b>3</b>
              <i>:</i>
              <b>1</b>
              <span>{t("AWAY", "میهمان")}</span>
            </span>
            <span className="theme-swatch" aria-hidden="true">
              <span style={{ background: preset.accent }} />
              <span style={{ background: preset.card }} />
              <span style={{ background: preset.foreground }} />
            </span>
            <strong>{t(preset.name, preset.fa)}</strong>
            <span className="theme-choice-description">
              {t(preset.description, preset.descriptionFa)}
            </span>
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="theme-gallery-empty">
          <h4>
            {t("No themes match this search.", "قالبی با این جستجو پیدا نشد.")}
          </h4>
          <p>
            {t(
              "Try another name or explore all game collections.",
              "نام دیگری را امتحان کنید یا همه مجموعه‌های بازی را ببینید.",
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setShowAll(true);
            }}
          >
            {t("Browse all themes", "دیدن همه قالب‌ها")}
          </button>
        </div>
      )}
      <div className="theme-custom-heading">
        <h3>{t("Make the details yours", "جزئیات به سلیقه شما")}</h3>
        <p>
          {t(
            "Tune this preset without changing your tournament rules or results.",
            "این قالب را بدون تغییر قوانین یا نتایج مسابقات تنظیم کنید.",
          )}
        </p>
      </div>
      <div className="theme-fields">
        {(
          [
            ["accent", "Accent", "رنگ اصلی"],
            ["background", "Background", "پس‌زمینه"],
            ["foreground", "Text", "متن"],
          ] as const
        ).map(([field, en, fa]) => (
          <label key={field}>
            {t(en, fa)}
            <span className="theme-color-control">
              <input
                type="color"
                aria-label={t(en, fa)}
                value={current[field] ?? base[field]}
                onChange={(e) => update({ [field]: e.target.value })}
              />
              <code aria-hidden="true">{current[field] ?? base[field]}</code>
            </span>
          </label>
        ))}
        <label>
          {t("Typography", "قلم")}
          <select
            value={current.font ?? base.font}
            onChange={(e) =>
              update({ font: e.target.value as ThemeSettings["font"] })
            }
          >
            {[
              ["inter", "Inter"],
              ["vazirmatn", "وزیرمتن"],
              ["serif", t("Editorial serif", "سریف")],
              ["mono", t("Monospace", "تک‌عرض")],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Corner radius", "گردی گوشه‌ها")}
          <input
            type="range"
            min="0"
            max="40"
            value={current.radius ?? base.radius}
            onChange={(e) => update({ radius: +e.target.value })}
          />
        </label>
        <label>
          {t("Font size", "اندازه قلم")}
          <input
            type="range"
            min="0.7"
            max="2"
            step="0.05"
            value={current.fontScale ?? 1}
            onChange={(e) => update({ fontScale: +e.target.value })}
          />
        </label>
        <label>
          {t("Card spacing", "فاصله کارت‌ها")}
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={current.spacing ?? 1}
            onChange={(e) => update({ spacing: +e.target.value })}
          />
        </label>
        <label>
          {t("Border width", "ضخامت حاشیه")}
          <input
            type="range"
            min="0"
            max="5"
            value={current.borderWidth ?? base.border}
            onChange={(e) => update({ borderWidth: +e.target.value })}
          />
        </label>
        <label>
          {t("Bracket connectors", "خطوط جدول")}
          <select
            value={current.connector ?? "solid"}
            onChange={(e) =>
              update({
                connector: e.target.value as ThemeSettings["connector"],
              })
            }
          >
            <option value="solid">{t("Solid", "پیوسته")}</option>
            <option value="dashed">{t("Dashed", "خط‌چین")}</option>
          </select>
        </label>
        <label>
          <span>{t("Reduced motion", "کاهش حرکت")}</span>
          <input
            type="checkbox"
            checked={current.reducedMotion}
            onChange={(e) => update({ reducedMotion: e.target.checked })}
          />
        </label>
        <label>
          {t("Background image", "تصویر پس‌زمینه")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) =>
              void upload(e.target.files?.[0], "backgroundImage")
            }
          />
        </label>
        <label>
          {t("Tournament logo", "نشان مسابقات")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload(e.target.files?.[0], "logo")}
          />
        </label>
      </div>
      <div className="theme-tools">
        <button
          type="button"
          onClick={() =>
            downloadText(
              `${tournament.slug || "theme"}.theme.json`,
              JSON.stringify({ version: 1, theme: current }, null, 2),
              "application/json",
            )
          }
        >
          {t("Export custom theme", "خروجی قالب سفارشی")}
        </button>
        <label className="theme-file-label">
          {t("Import theme", "ورود قالب")}
          <input
            type="file"
            accept=".json"
            onChange={(e) => void importTheme(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            onChange({ preset: current.preset, reducedMotion: false })
          }
        >
          {t("Reset customizations", "بازنشانی تنظیمات")}
        </button>
        {(current.backgroundImage || current.logo) && (
          <button
            type="button"
            onClick={() =>
              update({ backgroundImage: undefined, logo: undefined })
            }
          >
            {t("Remove images", "حذف تصاویر")}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default ThemeStudio;
