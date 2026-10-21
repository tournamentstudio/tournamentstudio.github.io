import type { Locale, Match, Tournament } from "../domain/types";
import { matchNames } from "../components/Bracket";
import { getStandings } from "../engine";
import { podiumPlaces } from "../presentation/Presentation";
import { publicProjection } from "../sharing";
import { getTheme } from "../themes";
import { groupLabel } from "../i18n";
import { validateRasterAsset } from "../security/codec";
import { escapeXML } from "./index";

export interface VisualPage {
  title: string;
  svg: string;
}

export const exportLabel = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

export function wrapVisualText(value: string, columns: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (Array.from(line + " " + word).length > columns && line) {
        lines.push(line);
        line = "";
      }
      const chars = Array.from(word);
      while (chars.length > columns) {
        if (line) lines.push(line);
        lines.push(chars.splice(0, columns).join(""));
        line = "";
      }
      line += (line ? " " : "") + chars.join("");
    }
    lines.push(line);
  }
  return lines;
}

export function visualText(
  value: string,
  x: number,
  y: number,
  size: number,
  width: number,
  locale: Locale,
  color: string,
  anchor: "start" | "middle" | "end" = "middle",
) {
  const lines = wrapVisualText(
    value,
    Math.max(6, Math.floor(width / (size * 0.62))),
  );
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" direction="${locale === "fa" ? "rtl" : "ltr"}" unicode-bidi="plaintext">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.5 : 0}">${escapeXML(line)}</tspan>`).join("")}</text>`;
}

export function visualPalette(t: Tournament) {
  const theme = getTheme(t.theme.preset);
  const color = (value: string | undefined, fallback: string) =>
    value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  return {
    background: color(t.theme.background, theme.background),
    foreground: color(t.theme.foreground, theme.foreground),
    accent: color(t.theme.accent, theme.accent),
    card: theme.card,
    muted: theme.muted,
    radius: Math.max(0, Math.min(48, t.theme.radius ?? theme.radius)),
  };
}

export function visualFrame(
  t: Tournament,
  title: string,
  body: string,
  locale: Locale,
  width = 1600,
  height = 900,
) {
  const c = visualPalette(t);
  const logo =
    t.theme.logo && validateRasterAsset(t.theme.logo)
      ? `<image href="${escapeXML(t.theme.logo)}" x="30" y="26" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>`
      : "";
  const background =
    t.theme.backgroundImage && validateRasterAsset(t.theme.backgroundImage)
      ? `<image href="${escapeXML(t.theme.backgroundImage)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity=".12"/>`
      : "";
  const titleSize = Math.max(
    14,
    Math.min(
      28,
      ((width - 220) / Math.max(1, Array.from(t.title).length)) * 2.4,
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${escapeXML(title)}</title><style>text{font-family:TournaExportArabic,TournaExportLatin,sans-serif}</style><rect width="100%" height="100%" fill="${c.background}"/>${background}${logo}<path d="M0 0H${width}V12H0Z" fill="${c.accent}"/><g font-weight="600">${visualText(t.title, width / 2, 56, titleSize, width - 220, locale, c.muted)}${body}${visualText("TournaStudio", width / 2, height - 30, 18, width - 100, "en", c.muted)}</g></svg>`;
}

export function selectedScoreboardMatch(t: Tournament): Match | undefined {
  return (
    t.matches.find((m) => m.status === "live") ??
    t.matches.find((m) => m.status === "ready") ??
    t.matches.filter((m) => m.status === "completed").at(-1)
  );
}

/** Only the public projection reaches graphics, including live scores. */
export function scoreboardSVG(
  tournament: Tournament,
  matchId: string,
  locale: Locale = "en",
) {
  const t = publicProjection(tournament),
    match = t.matches.find((m) => m.id === matchId);
  if (!match)
    throw new Error(
      exportLabel(
        locale,
        "Choose a match to export.",
        "مسابقه‌ای را برای خروجی انتخاب کنید.",
      ),
    );
  const c = visualPalette(t),
    names = matchNames(t, match, locale);
  const rows = names.map((name, i) => {
    const lines = wrapVisualText(name, 42).length;
    return { name, index: i, height: Math.max(110, lines * 57 + 38) };
  });
  let y = 175;
  const content = rows
    .map(({ name, index, height }) => {
      const winner =
        match.slots[index].participantId &&
        match.result?.winnerIds.includes(match.slots[index].participantId!);
      const score = t.presentation.showScores
        ? (
            (match.status === "live" ? match.liveScores?.[index] : undefined) ??
            match.result?.scores[index] ??
            0
          ).toLocaleString(locale)
        : "·";
      const out = `<rect x="80" y="${y}" width="1440" height="${height - 12}" rx="${c.radius}" fill="${c.card}" stroke="${winner ? c.accent : c.muted}" stroke-opacity="${winner ? 1 : 0.2}"/>${visualText(name, 690, y + 55, 38, 1100, locale, winner ? c.accent : c.foreground)}${visualText(score, 1405, y + 65, 48, 180, locale, c.foreground)}`;
      y += height;
      return out;
    })
    .join("");
  const height = Math.max(900, y + 125);
  const status =
    exportLabel(locale, "Scoreboard", "تابلو امتیاز") +
    " · " +
    exportLabel(locale, "Round", "دور") +
    " " +
    match.round.toLocaleString(locale);
  return visualFrame(
    t,
    status,
    visualText(status, 800, 130, 32, 1400, locale, c.accent) + content,
    locale,
    1600,
    height,
  );
}

export function championPosterSVG(
  tournament: Tournament,
  locale: Locale = "en",
) {
  const t = publicProjection(tournament),
    c = visualPalette(t);
  const first = podiumPlaces(t).find((p) => p.rank === 1 && !p.tied);
  const champion = t.participants.find((p) => p.id === first?.participantId);
  if (!champion)
    throw new Error(
      exportLabel(
        locale,
        "Complete the deciding stage and resolve first-place ties before exporting a champion poster.",
        "پیش از خروجی پوستر قهرمان، مرحله نهایی را کامل و تساوی رتبه اول را تعیین کنید.",
      ),
    );
  const nameLines = wrapVisualText(champion.name, 20);
  const height = Math.max(1600, 880 + nameLines.length * 104);
  return visualFrame(
    t,
    champion.name,
    `<circle cx="600" cy="340" r="118" fill="${c.card}" stroke="${c.accent}" stroke-width="4"/><path d="M525 315L555 350L600 285L645 350L675 315L658 395H542Z" fill="${c.accent}"/>${visualText(exportLabel(locale, "CHAMPION", "قهرمان"), 600, 560, 38, 1040, locale, c.accent)}${visualText(champion.name, 600, 720, 80, 1040, locale, c.foreground)}${visualText(t.subtitle, 600, height - 180, 26, 1040, locale, c.muted)}`,
    locale,
    1200,
    height,
  );
}

export function tableVisualPages(
  t: Tournament,
  title: string,
  rows: string[],
  locale: Locale,
  pageSize = 10,
): VisualPage[] {
  const c = visualPalette(t),
    pages: VisualPage[] = [];
  const wrapped = rows.flatMap((row) => wrapVisualText(row, 70));
  if (!wrapped.length)
    wrapped.push(
      exportLabel(locale, "No entries yet.", "هنوز داده‌ای ثبت نشده است."),
    );
  for (let start = 0; start < wrapped.length; start += pageSize) {
    const part = wrapped.slice(start, start + pageSize);
    const pageTitle = `${title} (${Math.floor(start / pageSize) + 1}/${Math.ceil(wrapped.length / pageSize)})`;
    pages.push({
      title: pageTitle,
      svg: visualFrame(
        t,
        pageTitle,
        visualText(
          pageTitle,
          800,
          125,
          Math.max(
            13,
            Math.min(
              34,
              (1420 / Math.max(1, Array.from(pageTitle).length)) * 2.4,
            ),
          ),
          1420,
          locale,
          c.accent,
        ) +
          part
            .map(
              (row, i) =>
                `<rect x="70" y="${175 + i * 62}" width="1460" height="56" rx="${c.radius}" fill="${c.card}"/>${visualText(row, 800, 214 + i * 62, 26, 1400, locale, c.foreground)}`,
            )
            .join(""),
        locale,
      ),
    });
  }
  return pages;
}

export function standingsVisualPages(
  tournament: Tournament,
  stageId: string,
  locale: Locale = "en",
): VisualPage[] {
  const t = publicProjection(tournament),
    stage = t.stages.find((s) => s.id === stageId);
  if (!stage)
    throw new Error(
      exportLabel(
        locale,
        "Choose a stage to export.",
        "مرحله‌ای را برای خروجی انتخاب کنید.",
      ),
    );
  const names = new Map(t.participants.map((p) => [p.id, p.name]));
  const groups = [
    ...new Set(
      t.matches
        .filter((match) => match.stageId === stageId && match.group)
        .map((match) => match.group!),
    ),
  ];
  return (groups.length ? groups : [undefined]).flatMap((group) =>
    tableVisualPages(
      t,
      stage.name +
        (group ? ` · ${groupLabel(group, locale)}` : "") +
        " · " +
        exportLabel(locale, "Standings", "رده‌بندی"),
      getStandings(t, stageId, group).map(
        (row) =>
          `${row.rank.toLocaleString(locale)}${row.tied ? "*" : ""}. ${names.get(row.participantId) ?? ""} · ${row.points.toLocaleString(locale)} ${exportLabel(locale, "points", "امتیاز")} · ${row.played.toLocaleString(locale)} ${exportLabel(locale, "played", "بازی")}`,
      ),
      locale,
    ),
  );
}
