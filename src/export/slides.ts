import { strToU8, zipSync } from "fflate";
import QRCode from "qrcode";
import type { Locale, Scene, Tournament } from "../domain/types";
import { scheduleOccurrences } from "../scheduling/legs";
import { matchNames } from "../components/Bracket";
import { podiumPlaces, sceneLabel } from "../presentation/Presentation";
import { encodeCode, publicProjection } from "../sharing";
import { bracketSVG, escapeXML } from "./index";
import { embedSVGFonts } from "./files";
import { advancedSlidePages } from "./advanced-slides";
import { sponsorVisualPages } from "./sponsors";
import type { AdvancedScene } from "../presentation/advanced-scenes";
import {
  championPosterSVG,
  exportLabel,
  scoreboardSVG,
  selectedScoreboardMatch,
  standingsVisualPages,
  tableVisualPages,
  visualFrame,
  visualPalette,
  visualText,
  type VisualPage,
} from "./visuals";

export interface SlideFile extends VisualPage {
  sceneId: string;
  duration: number;
}

function messagePage(
  t: Tournament,
  scene: Scene,
  locale: Locale,
  message: string,
) {
  const c = visualPalette(t);
  const title = scene.title || sceneLabel(scene.type, locale) || t.title;
  return tableVisualPages(t, title, message.split("\n"), locale).map(
    (page) => ({
      ...page,
      svg: page.svg.replace(`fill="${c.card}"`, `fill="${c.background}"`),
    }),
  );
}

async function scenePages(
  t: Tournament,
  scene: Scene,
  locale: Locale,
): Promise<VisualPage[]> {
  const title = scene.title || sceneLabel(scene.type, locale) || t.title;
  const label = (en: string, fa: string) => exportLabel(locale, en, fa);
  const names = new Map(t.participants.map((p) => [p.id, p.name]));
  switch (scene.type) {
    case "introduction":
    case "semifinal":
    case "final-intro":
    case "trophy":
      return advancedSlidePages(t, scene as AdvancedScene, locale);
    case "participants":
      return tableVisualPages(
        t,
        title,
        t.participants.map(
          (p, i) => `${(i + 1).toLocaleString(locale)}. ${p.name}`,
        ),
        locale,
      );
    case "bracket":
      return t.stages
        .filter((s) => t.matches.some((m) => m.stageId === s.id))
        .map((s) => ({ title: s.name, svg: bracketSVG(t, s.id, locale) }));
    case "standings":
      return t.stages.flatMap((s) => standingsVisualPages(t, s.id, locale));
    case "current":
    case "upcoming": {
      const match =
        scene.type === "current"
          ? selectedScoreboardMatch(t)
          : t.matches.find(
              (m) => m.status === "ready" || m.status === "pending",
            );
      return match
        ? [{ title, svg: scoreboardSVG(t, match.id, locale) }]
        : messagePage(
            t,
            scene,
            locale,
            label("No match is ready yet.", "هنوز مسابقه‌ای آماده نیست."),
          );
    }
    case "results":
      return tableVisualPages(
        t,
        title,
        t.matches
          .filter((m) => m.status === "completed")
          .map(
            (m) =>
              `${matchNames(t, m, locale).join(" / ")} · ${t.presentation.showScores ? (m.result?.scores.map((score) => score.toLocaleString(locale)).join(" : ") ?? "") : "·"}`,
          ),
        locale,
      );
    case "schedule":
      return tableVisualPages(
        t,
        title,
        scheduleOccurrences({ ...t, locale })
          .filter((m) => m.scheduledAt)
          .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
          .map(
            (m) =>
              `${new Date(m.scheduledAt!).toLocaleString(locale, { timeZone: t.timezone })} · ${m.label} · ${matchNames(t, m, locale).join(" / ")} · ${t.schedule.resources.find((r) => r.id === m.resourceId)?.name ?? ""}`,
          ),
        locale,
      );
    case "statistics":
      return tableVisualPages(
        t,
        title,
        [
          `${label("Participants", "شرکت‌کنندگان")}: ${t.participants.length.toLocaleString(locale)}`,
          `${label("Matches completed", "مسابقات کامل‌شده")}: ${t.matches.filter((m) => m.status === "completed").length.toLocaleString(locale)}`,
          `${label("Matches ready", "مسابقات آماده")}: ${t.matches.filter((m) => m.status === "ready").length.toLocaleString(locale)}`,
        ],
        locale,
      );
    case "champion":
      try {
        return [{ title, svg: championPosterSVG(t, locale) }];
      } catch {
        return messagePage(
          t,
          scene,
          locale,
          label(
            "The champion is not decided yet.",
            "قهرمان هنوز مشخص نشده است.",
          ),
        );
      }
    case "podium":
      return tableVisualPages(
        t,
        title,
        podiumPlaces(t).map(
          (p) =>
            `${p.rank.toLocaleString(locale)}${p.tied ? "*" : ""}. ${names.get(p.participantId) ?? ""}`,
        ),
        locale,
      );
    case "rules":
      return tableVisualPages(
        t,
        title,
        [
          scene.text,
          `${label("Win points", "امتیاز برد")}: ${t.rules.pointsWin}`,
          `${label("Draw points", "امتیاز مساوی")}: ${t.rules.pointsDraw}`,
          `${label("Best of", "بهترین از")}: ${t.rules.bestOf}`,
          ...(t.sport === "gol-ya-pooch"
            ? [`${label("Target score", "امتیاز هدف")}: ${t.rules.targetScore}`]
            : []),
        ].filter(Boolean),
        locale,
      );
    case "sponsors":
      return sponsorVisualPages(t, title, locale);
    case "countdown":
      return messagePage(
        t,
        scene,
        locale,
        `${Math.max(0, Math.min(86400, Number(scene.text) || 300)).toLocaleString(locale)} ${label("seconds", "ثانیه")}\n${label("Static countdown snapshot. Open the live presentation for a running timer.", "تصویر ثابت شمارش معکوس. برای زمان‌سنج فعال، نمایش زنده را باز کنید.")}`,
      );
    case "qr": {
      const code = await encodeCode(t);
      if (code.length > 1800)
        return messagePage(
          t,
          scene,
          locale,
          label(
            "This snapshot is too large for a readable QR code. Transfer a tournament file instead.",
            "داده این مسابقات برای کد QR خوانا بزرگ است. از فایل مسابقات استفاده کنید.",
          ),
        );
      const qr = await QRCode.toString(code, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 3,
      });
      const nested = qr.replace(
        /<svg /,
        '<svg x="500" y="160" width="600" height="600" ',
      );
      return [
        {
          title,
          svg: visualFrame(
            t,
            title,
            visualText(
              title,
              800,
              125,
              30,
              1400,
              locale,
              visualPalette(t).accent,
            ) + nested,
            locale,
          ),
        },
      ];
    }
    case "title":
      return messagePage(
        t,
        scene,
        locale,
        `${scene.text || t.subtitle}\n${t.participants.length.toLocaleString(locale)} ${label("participants", "شرکت‌کننده")} · ${t.stages.length.toLocaleString(locale)} ${label("stages", "مرحله")}`,
      );
    default:
      return messagePage(
        t,
        scene,
        locale,
        scene.text ||
          label(
            "The competition continues soon.",
            "رقابت به‌زودی ادامه می‌یابد.",
          ),
      );
  }
}

export async function presentationSlideFiles(
  tournament: Tournament,
  locale: Locale = "en",
  sceneIds?: string[],
): Promise<SlideFile[]> {
  const t = publicProjection(tournament);
  const selected = sceneIds ? new Set(sceneIds) : undefined;
  const scenes = t.presentation.scenes.filter(
    (s) => !selected || selected.has(s.id),
  );
  if (!scenes.length)
    throw new Error(
      exportLabel(
        locale,
        "Select at least one presentation scene.",
        "حداقل یک نمای نمایش را انتخاب کنید.",
      ),
    );
  const files: SlideFile[] = [];
  let size = 0;
  for (const scene of scenes) {
    const pages = await scenePages(t, scene, locale);
    if (!pages.length)
      pages.push(
        ...messagePage(
          t,
          scene,
          locale,
          exportLabel(
            locale,
            "Generate matches to display this scene.",
            "برای نمایش این نما، مسابقات را بسازید.",
          ),
        ),
      );
    for (const page of pages) {
      size += new TextEncoder().encode(page.svg).length;
      if (files.length >= 512 || size > 32 * 1024 * 1024)
        throw new Error(
          exportLabel(
            locale,
            "This slide selection exceeds 512 pages or 32 MiB. Export fewer scenes at a time.",
            "این انتخاب از ۵۱۲ صفحه یا ۳۲ مگابایت بیشتر است. هر بار تعداد کمتری نما خروجی بگیرید.",
          ),
        );
      files.push({ ...page, sceneId: scene.id, duration: scene.duration });
    }
  }
  return files;
}

export function slideViewerHTML(
  title: string,
  files: SlideFile[],
  locale: Locale = "en",
) {
  const label = (en: string, fa: string) => exportLabel(locale, en, fa);
  const links = files
    .map((file, i) => `<a href="#slide-${i + 1}">${escapeXML(file.title)}</a>`)
    .join("");
  const pages = files
    .map(
      (file, i) =>
        `<section id="slide-${i + 1}"><h2>${escapeXML(file.title)}</h2><img src="slide-${String(i + 1).padStart(3, "0")}.svg" alt="${escapeXML(file.title)}"><nav aria-label="${label("Slide controls", "کنترل نما")}">${i ? `<a href="#slide-${i}">${label("Previous", "قبلی")}</a>` : ""}<span>${i + 1}/${files.length}</span>${i + 1 < files.length ? `<a href="#slide-${i + 2}">${label("Next", "بعدی")}</a>` : ""}</nav></section>`,
    )
    .join("");
  return `<!doctype html><html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>${escapeXML(title)}</title><style>body{margin:0;background:#101b19;color:#f5f7f6;font:18px TournaExportArabic,TournaExportLatin,system-ui}header{padding:24px}h1,h2{overflow-wrap:anywhere}header nav{display:flex;flex-wrap:wrap;gap:16px}a{color:#b5edc8;overflow-wrap:anywhere}section{padding:24px;min-height:90vh;scroll-margin-top:0;break-after:page}section img{display:block;width:100%;max-height:80vh;object-fit:contain}section nav{display:flex;justify-content:center;gap:32px;padding:20px}a:focus-visible{outline:3px solid white;outline-offset:5px}@media print{body{background:white;color:black}header,nav,h2{display:none}section{min-height:0;padding:0}section img{max-height:95vh}@page{size:landscape;margin:5mm}}</style></head><body><header><h1>${escapeXML(title)}</h1><p>${label("Offline slide files. These are snapshots and do not receive live updates. Unzip all files together, then open this index. Use browser printing to save a PDF.", "فایل‌های نمایش آفلاین. این‌ها تصاویر ثابت هستند و به‌روز نمی‌شوند. همه فایل‌ها را کنار هم استخراج و این صفحه را باز کنید. برای ذخیره PDF از چاپ مرورگر استفاده کنید.")}</p><nav aria-label="${label("Slide list", "فهرست نماها")}">${links}</nav></header>${pages}</body></html>`;
}

export function slideArchive(
  title: string,
  files: SlideFile[],
  locale: Locale = "en",
  fontCSS = "",
) {
  if (!files.length || files.length > 512)
    throw new Error(
      exportLabel(
        locale,
        "Export between 1 and 512 slides.",
        "بین ۱ تا ۵۱۲ نما خروجی بگیرید.",
      ),
    );
  const contents: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  files.forEach((file, i) => {
    const bytes = strToU8(embedSVGFonts(file.svg, fontCSS));
    totalBytes += bytes.length;
    if (totalBytes > 64 * 1024 * 1024)
      throw new Error(
        exportLabel(
          locale,
          "The slide files exceed 64 MiB. Select fewer scenes or remove large background images.",
          "حجم فایل‌های نمایش از ۶۴ مگابایت بیشتر است. نماهای کمتر انتخاب یا تصاویر پس‌زمینه بزرگ را حذف کنید.",
        ),
      );
    contents[`slide-${String(i + 1).padStart(3, "0")}.svg`] = bytes;
  });
  contents["index.html"] = strToU8(
    slideViewerHTML(title, files, locale).replace(
      "<style>",
      `<style>${fontCSS}`,
    ),
  );
  contents["manifest.json"] = strToU8(
    JSON.stringify(
      {
        format: "tournastudio-slides",
        version: 1,
        title,
        locale,
        snapshot: true,
        slides: files.map((f, i) => ({
          file: `slide-${String(i + 1).padStart(3, "0")}.svg`,
          title: f.title,
          sceneId: f.sceneId,
          duration: f.duration,
        })),
      },
      null,
      2,
    ),
  );
  return zipSync(contents, { level: 6 });
}
