import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Presentation } from "lucide-react";
import type { Tournament } from "../domain/types";
import { Field, ErrorText, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import { matchNames } from "../components/Bracket";
import { sceneLabel } from "../presentation/Presentation";
import { downloadBlob, downloadText } from "../export";
import {
  exportFontCSS,
  exportVisualPNG,
  exportVisualSVG,
  standaloneTournamentHTML,
} from "../export/files";
import { presentationSlideFiles, slideArchive } from "../export/slides";
import {
  championPosterSVG,
  scoreboardSVG,
  selectedScoreboardMatch,
  standingsVisualPages,
} from "../export/visuals";
import "./export-studio.css";

type GraphicKind = "scoreboard" | "champion" | "standings";

export function ExportStudio({ tournament }: { tournament: Tournament }) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<GraphicKind>("scoreboard");
  const [matchId, setMatchId] = useState(
    selectedScoreboardMatch(tournament)?.id ?? "",
  );
  const [stageId, setStageId] = useState(tournament.stages.at(-1)?.id ?? "");
  const [pageIndex, setPageIndex] = useState(0);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState("");
  const graphic = useMemo(() => {
    try {
      const pages =
        kind === "standings"
          ? standingsVisualPages(tournament, stageId, locale)
          : [
              {
                title: kind,
                svg:
                  kind === "champion"
                    ? championPosterSVG(tournament, locale)
                    : scoreboardSVG(tournament, matchId, locale),
              },
            ];
      return { pages, error: undefined };
    } catch (error) {
      return { pages: [], error };
    }
  }, [kind, tournament, stageId, locale, matchId]);
  const selectedPage =
    graphic.pages[Math.min(pageIndex, graphic.pages.length - 1)];
  useEffect(() => {
    if (!selectedPage) return;
    const url = URL.createObjectURL(
      new Blob([selectedPage.svg], { type: "image/svg+xml" }),
    );
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPage]);
  const selectedScenes = tournament.presentation.scenes.filter(
    (scene) => !excluded.includes(scene.id),
  );
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setStatus("");
    try {
      await action();
      setStatus(t("Your export is ready.", "خروجی شما آماده است."));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  const filename = `${tournament.slug || "tournament"}-${kind}${graphic.pages.length > 1 ? `-${pageIndex + 1}` : ""}`;
  return (
    <section
      className="export-studio"
      dir={locale === "fa" ? "rtl" : "ltr"}
      aria-labelledby="export-studio-heading"
    >
      <header>
        <span className="eyebrow">
          {t("TAKE THE COMPETITION WITH YOU", "مسابقات را همراه ببرید")}
        </span>
        <h2 id="export-studio-heading">
          {t("Graphics and slide files", "تصاویر و فایل‌های نمایش")}
        </h2>
        <p>
          {t(
            "Create scoreboard images, champion posters, standings pages, or an offline slide pack. Public exports omit organizer notes and concealed positions.",
            "تصویر تابلو امتیاز، پوستر قهرمان، صفحات رده‌بندی یا بسته نمایش آفلاین بسازید. یادداشت برگزارکننده و محل پنهان گل در خروجی عمومی نیست.",
          )}
        </p>
      </header>
      <div className="export-studio-grid">
        <div className="export-studio-settings">
          <Field label={t("Graphic", "نوع تصویر")}>
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as GraphicKind);
                setPageIndex(0);
              }}
            >
              <option value="scoreboard">
                {t("Scoreboard", "تابلو امتیاز")}
              </option>
              <option value="champion">
                {t("Champion poster", "پوستر قهرمان")}
              </option>
              <option value="standings">{t("Standings", "رده‌بندی")}</option>
            </select>
          </Field>
          {kind === "scoreboard" && (
            <Field label={t("Scoreboard match", "مسابقه تابلو امتیاز")}>
              <select
                value={matchId}
                onChange={(event) => setMatchId(event.target.value)}
              >
                <option value="">{t("Choose a match", "انتخاب مسابقه")}</option>
                {tournament.matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {matchNames(tournament, match, locale).join(" / ")}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "standings" && (
            <Field label={t("Standings stage", "مرحله رده‌بندی")}>
              <select
                value={stageId}
                onChange={(event) => {
                  setStageId(event.target.value);
                  setPageIndex(0);
                }}
              >
                {tournament.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {graphic.pages.length > 1 && (
            <Field label={t("Graphic page", "صفحه تصویر")}>
              <select
                value={Math.min(pageIndex, graphic.pages.length - 1)}
                onChange={(event) => setPageIndex(Number(event.target.value))}
              >
                {graphic.pages.map((page, i) => (
                  <option key={i} value={i}>
                    {page.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="button-row">
            <button
              className="button"
              disabled={busy || !selectedPage}
              onClick={() =>
                void work(() =>
                  exportVisualPNG(`${filename}.png`, selectedPage!.svg, locale),
                )
              }
            >
              <ImageIcon size={17} />
              {t("Download PNG", "دانلود PNG")}
            </button>
            <button
              className="button secondary"
              disabled={busy || !selectedPage}
              onClick={() =>
                void work(() =>
                  exportVisualSVG(`${filename}.svg`, selectedPage!.svg),
                )
              }
            >
              <Download size={17} />
              {t("Download SVG", "دانلود SVG")}
            </button>
          </div>
          <p className="muted">
            {t(
              "SVG keeps text sharp at any size. PNG is limited to 8,192 pixels per side and 24 million pixels. Large scoreboards are scaled to fit.",
              "متن SVG در هر اندازه واضح می‌ماند. PNG به ۸۱۹۲ پیکسل در هر ضلع و ۲۴ میلیون پیکسل محدود است. تابلوهای بزرگ کوچک می‌شوند.",
            )}
          </p>
        </div>
        <div className="export-studio-preview">
          {graphic.error ? (
            <ErrorText error={graphic.error} />
          ) : selectedPage && preview ? (
            <img
              src={preview}
              alt={t("Graphic export preview", "پیش‌نمایش تصویر خروجی")}
            />
          ) : (
            <p>
              {t(
                "Create a match to preview an image.",
                "برای پیش‌نمایش تصویر، مسابقه‌ای بسازید.",
              )}
            </p>
          )}
        </div>
      </div>
      <div className="export-studio-files">
        <div>
          <h3>{t("Offline slide pack", "بسته نمایش آفلاین")}</h3>
          <p>
            {t(
              "Each selected scene becomes one or more SVG files. The ZIP includes an offline HTML viewer and a slide manifest. Lists are paginated so every entry is included. Timers and results are snapshots.",
              "هر نمای انتخاب‌شده به یک یا چند فایل SVG تبدیل می‌شود. ZIP شامل نمایشگر HTML آفلاین و فهرست نماها است. فهرست‌ها صفحه‌بندی می‌شوند تا همه داده‌ها باقی بمانند. زمان‌سنج و نتایج ثابت هستند.",
            )}
          </p>
          <fieldset className="export-scene-list">
            <legend>{t("Scenes to export", "نماهای خروجی")}</legend>
            {tournament.presentation.scenes.map((scene, i) => (
              <label key={scene.id}>
                <input
                  type="checkbox"
                  checked={!excluded.includes(scene.id)}
                  onChange={(event) =>
                    setExcluded(
                      event.target.checked
                        ? excluded.filter((id) => id !== scene.id)
                        : [...excluded, scene.id],
                    )
                  }
                />
                <span>
                  {(i + 1).toLocaleString(locale)}.{" "}
                  {scene.title || sceneLabel(scene.type, locale)}
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="button"
            disabled={busy || !selectedScenes.length}
            onClick={() =>
              void work(async () => {
                const files = await presentationSlideFiles(
                  tournament,
                  locale,
                  selectedScenes.map((scene) => scene.id),
                );
                const bytes = slideArchive(
                  tournament.title,
                  files,
                  locale,
                  await exportFontCSS(),
                );
                downloadBlob(
                  `${tournament.slug || "tournament"}-slides.zip`,
                  new Blob([bytes as Uint8Array<ArrayBuffer>], {
                    type: "application/zip",
                  }),
                );
              })
            }
          >
            <Presentation size={17} />
            {t("Download slide ZIP", "دانلود ZIP نمایش")}
          </button>
        </div>
        <div>
          <h3>{t("Print-ready tournament", "مسابقات آماده چاپ")}</h3>
          <p>
            {t(
              "Download a standalone HTML file with the match schedule and every stage bracket. It opens without this app or an internet connection. Use your browser's Print action to save a PDF.",
              "فایل HTML مستقل شامل برنامه مسابقات و جدول همه مراحل را دانلود کنید. بدون برنامه یا اینترنت باز می‌شود. برای ذخیره PDF از گزینه چاپ مرورگر استفاده کنید.",
            )}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void work(async () =>
                downloadText(
                  `${tournament.slug || "tournament"}-print.html`,
                  await standaloneTournamentHTML(tournament, locale),
                  "text/html;charset=utf-8",
                ),
              )
            }
          >
            <Download size={17} />
            {t("Download print HTML", "دانلود HTML چاپ")}
          </button>
        </div>
      </div>
      {busy && (
        <p role="status">
          {t("Preparing export…", "در حال آماده‌سازی خروجی…")}
        </p>
      )}
      {status && <Notice>{status}</Notice>}
      <ErrorText error={error} />
    </section>
  );
}
