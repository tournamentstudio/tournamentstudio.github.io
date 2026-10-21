import type { Locale, Tournament } from "../domain/types";
import { useState } from "react";
import {
  defaultOverlay,
  type OverlaySettings,
} from "../domain/display-options";
import { matchNames } from "../components/Bracket";
import { ErrorText, Field } from "../components/ui";
import { BroadcastOverlay } from "./BroadcastOverlay";
import { broadcastOverlaySVG } from "../export/overlay";
import { exportVisualPNG, exportVisualSVG } from "../export/files";

export function OverlayEditor({
  tournament,
  value,
  onChange,
  locale,
}: {
  tournament: Tournament;
  value?: OverlaySettings;
  onChange: (value: OverlaySettings) => void;
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const settings = value ?? defaultOverlay;
  const update = (part: Partial<OverlaySettings>) =>
    onChange({ ...settings, ...part });
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  async function download(kind: "svg" | "png") {
    setBusy(true);
    setError(undefined);
    try {
      const svg = broadcastOverlaySVG(tournament, settings, locale),
        filename = `${tournament.slug || "tournament"}-overlay.${kind}`;
      if (kind === "svg") await exportVisualSVG(filename, svg);
      else await exportVisualPNG(filename, svg, locale);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="overlay-editor"
      aria-labelledby="overlay-editor-heading"
    >
      <h3 id="overlay-editor-heading">{t("Broadcast overlay", "لایه پخش")}</h3>
      <p>
        {t(
          "Capture the display window for a live scoreboard in this browser profile. Window capture normally has an opaque background; choose chroma key for OBS. Transparent SVG and PNG exports retain alpha where your graphics software supports it.",
          "پنجره نمایش را برای تابلوی زنده در همین پروفایل مرورگر ضبط کنید. ضبط پنجره معمولاً پس‌زمینه مات دارد؛ برای OBS رنگ کروما را انتخاب کنید. خروجی شفاف SVG و PNG در نرم‌افزار سازگار شفافیت را حفظ می‌کند.",
        )}
      </p>
      <div className="theme-fields">
        <label>
          <span>
            {t("Use overlay display mode", "استفاده از حالت نمایش لایه پخش")}
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
        </label>
        <Field label={t("Overlay layout", "چیدمان لایه پخش")}>
          <select
            value={settings.layout}
            onChange={(event) =>
              update({
                layout: event.target.value as OverlaySettings["layout"],
              })
            }
          >
            <option value="strip">{t("Score strip", "نوار امتیاز")}</option>
            <option value="stacked">
              {t("Stacked teams", "تیم‌های روی هم")}
            </option>
            <option value="compact">{t("Compact box", "کادر فشرده")}</option>
          </select>
        </Field>
        <Field label={t("Overlay background", "پس‌زمینه لایه پخش")}>
          <select
            value={settings.background}
            onChange={(event) =>
              update({
                background: event.target.value as OverlaySettings["background"],
              })
            }
          >
            <option value="transparent">{t("Transparent", "شفاف")}</option>
            <option value="chroma">{t("Chroma key", "کروماکی")}</option>
            <option value="theme">
              {t("Theme background", "پس‌زمینه قالب")}
            </option>
          </select>
        </Field>
        {settings.background === "chroma" && (
          <Field label={t("Chroma color", "رنگ کروما")}>
            <input
              type="color"
              value={settings.chroma}
              onChange={(event) => update({ chroma: event.target.value })}
            />
          </Field>
        )}
        <Field label={t("Overlay position", "جای لایه پخش")}>
          <select
            value={settings.position}
            onChange={(event) =>
              update({
                position: event.target.value as OverlaySettings["position"],
              })
            }
          >
            <option value="top">{t("Top", "بالا")}</option>
            <option value="center">{t("Center", "وسط")}</option>
            <option value="bottom">{t("Bottom", "پایین")}</option>
          </select>
        </Field>
        <Field label={t("Overlay match", "مسابقه لایه پخش")}>
          <select
            value={settings.matchId ?? ""}
            onChange={(event) =>
              update({ matchId: event.target.value || undefined })
            }
          >
            <option value="">
              {t("Follow current match", "دنبال کردن مسابقه جاری")}
            </option>
            {tournament.matches.map((match) => (
              <option key={match.id} value={match.id}>
                {matchNames(tournament, match, locale).join(" / ")}
              </option>
            ))}
          </select>
        </Field>
        <label>
          <span>
            {t(
              "Show tournament title on overlay",
              "نمایش عنوان مسابقات در لایه",
            )}
          </span>
          <input
            type="checkbox"
            checked={settings.showTournament}
            onChange={(event) =>
              update({ showTournament: event.target.checked })
            }
          />
        </label>
      </div>
      <BroadcastOverlay
        tournament={tournament}
        settings={settings}
        locale={locale}
        preview
      />
      <div className="theme-tools">
        <button
          type="button"
          disabled={busy}
          onClick={() => void download("svg")}
        >
          {t("Download overlay SVG", "دانلود SVG لایه پخش")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void download("png")}
        >
          {t("Download overlay PNG", "دانلود PNG لایه پخش")}
        </button>
      </div>
      <ErrorText error={error} />
    </section>
  );
}
