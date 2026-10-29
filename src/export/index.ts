import { scheduleOccurrences } from "../scheduling/legs";
import type { Locale, Tournament } from "../domain/types";
import { layoutBracket, matchNames } from "../components/Bracket";
import { getStandings } from "../engine";
import { getTheme } from "../themes";
import { publicProjection } from "../sharing";
import { generatedMatchLabel } from "../i18n/match-labels";
import {
  bracketTextRegions,
  bracketTextMetrics,
  fitBracketScoreFontSize,
  fitBracketText,
  svgTextPlacement,
} from "../presentation/bracket-text";
import {
  bracketConnectorPath,
  transformBracketLayout,
  supportsCenteredBracket,
} from "../components/bracket-layouts";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
) {
  downloadBlob(filename, new Blob([text], { type: mime }));
}
export const escapeXML = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function tournamentCSV(
  t: Tournament,
  kind: "matches" | "participants" | "standings" = "matches",
  locale: Locale = "en",
) {
  const rows: unknown[][] =
    kind === "participants"
      ? [
          [
            locale === "fa" ? "نام" : "Name",
            "Seed",
            "Status",
            "Organization",
            "Region",
            "Checked in",
          ],
          ...t.participants.map((p) => [
            p.name,
            p.seed,
            p.status,
            p.organization ?? "",
            p.region ?? "",
            p.checkedIn ? "Yes" : "No",
          ]),
        ]
      : kind === "standings"
        ? [
            [
              "Rank",
              "Participant",
              "Played",
              "Wins",
              "Draws",
              "Losses",
              "For",
              "Against",
              "Points",
            ],
            ...getStandings(t).map((s) => [
              s.rank,
              t.participants.find((p) => p.id === s.participantId)?.name,
              s.played,
              s.wins,
              s.draws,
              s.losses,
              s.scored,
              s.conceded,
              s.points,
            ]),
          ]
        : [
            [
              "Match",
              "Stage",
              "Round",
              "Group",
              "Participants",
              "Scores",
              "Status",
              "Scheduled time",
              "Resource",
            ],
            ...scheduleOccurrences({ ...t, locale }).map((m) => [
              generatedMatchLabel(m, locale),
              t.stages.find((s) => s.id === m.stageId)?.name,
              m.round,
              m.group ?? "",
              matchNames(t, m, locale).join(" / "),
              m.result?.scores.join(" / ") ?? "",
              m.status,
              m.scheduledAt ?? "",
              t.schedule.resources.find((r) => r.id === m.resourceId)?.name ??
                "",
            ]),
          ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function exportCSV(
  t: Tournament,
  kind: "matches" | "participants" | "standings" = "matches",
  locale: Locale = "en",
) {
  downloadText(
    `${t.slug || "tournament"}-${kind}.csv`,
    tournamentCSV(t, kind, locale),
    "text/csv;charset=utf-8",
  );
}
const icsEscape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r/g, "");
const icsDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function tournamentCalendar(t: Tournament, locale: Locale = "en") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TournaStudio//Tournament schedule//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const m of scheduleOccurrences({ ...t, locale }).filter(
    (m) => m.scheduledAt && !["bye", "canceled"].includes(m.status),
  )) {
    const start = new Date(m.scheduledAt!);
    if (!Number.isFinite(start.getTime())) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(m.id)}@tournastudio.local`,
      `DTSTAMP:${icsDate(new Date(t.updatedAt))}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(new Date(start.getTime() + (m.durationMinutes ?? t.schedule.matchMinutes) * 60000))}`,
      `SUMMARY:${icsEscape(matchNames(t, m, locale).join(" / "))}`,
      `LOCATION:${icsEscape(t.schedule.resources.find((r) => r.id === m.resourceId)?.name ?? "")}`,
      `DESCRIPTION:${icsEscape(`${t.title} | ${generatedMatchLabel(m, locale)} | ${t.stages.find((s) => s.id === m.stageId)?.name ?? ""} | ${m.round.toLocaleString(locale)}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // Fold by UTF-8 octets without splitting Unicode characters.
  return lines
    .map((line) => {
      let current = "",
        size = 0;
      const folded: string[] = [];
      for (const char of line) {
        const bytes = new TextEncoder().encode(char).length;
        if (size + bytes > 74) {
          folded.push(current);
          current = " ";
          size = 1;
        }
        current += char;
        size += bytes;
      }
      folded.push(current);
      return folded.join("\r\n");
    })
    .join("\r\n");
}
export function exportCalendar(t: Tournament, locale: Locale = "en") {
  downloadText(
    `${t.slug || "tournament"}.ics`,
    tournamentCalendar(t, locale),
    "text/calendar;charset=utf-8",
  );
}
export function bracketSVG(
  t: Tournament,
  stageId = t.stages[0]?.id,
  locale: Locale = "en",
) {
  t = publicProjection(t);
  const matches = t.matches.filter((m) => m.stageId === stageId),
    baseGraph = layoutBracket(matches, t.theme.spacing, t.theme.fontScale),
    requestedLayout = t.theme.design?.bracketLayout ?? "horizontal",
    layout =
      requestedLayout === "centered" && !supportsCenteredBracket(baseGraph)
        ? "horizontal"
        : requestedLayout,
    graph = transformBracketLayout(baseGraph, layout),
    theme = getTheme(t.theme.preset);
  const fg = t.theme.foreground ?? theme.foreground,
    bg = t.theme.background ?? theme.background,
    accent = t.theme.accent ?? theme.accent;
  const safeColor = (v: string, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  const nodes = new Map(graph.nodes.map((n) => [n.match.id, n]));
  const rtl = locale === "fa",
    direction = rtl ? "rtl" : "ltr",
    fontScale = t.theme.fontScale ?? 1,
    metrics = bracketTextMetrics(fontScale),
    prefix = `bracket-${t.stages.findIndex((stage) => stage.id === stageId)}`;
  const titleRegion = { x: 24, width: graph.width - 48 },
    titlePlacement = svgTextPlacement(t.title, titleRegion, direction);
  const exportFont = '12px "Vazirmatn Variable"';
  const canvasContext =
    typeof document !== "undefined" &&
    document.fonts?.check(exportFont, "شاهین Team") &&
    Array.from(document.fonts).some(
      (font) =>
        font.family.replace(/["']/g, "") === "Vazirmatn Variable" &&
        font.status === "loaded",
    )
      ? document.createElement("canvas").getContext("2d")
      : undefined;
  const measure = (fontSize: number, weight = 400) =>
    canvasContext
      ? (value: string) => {
          canvasContext.font = `${weight} ${fontSize}px "Vazirmatn Variable"`;
          return canvasContext.measureText(value).width + 2;
        }
      : undefined;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale}" direction="ltr" width="${graph.width}" height="${graph.height + 70}" viewBox="0 0 ${graph.width} ${graph.height + 70}" role="img" aria-label="${escapeXML(t.title)}"><title>${escapeXML(t.title)}</title><style>text{font-family:TournaExportArabic,TournaExportLatin,sans-serif}</style><defs><clipPath id="${prefix}-heading"><rect x="24" y="8" width="${titleRegion.width}" height="46"/></clipPath></defs><rect width="100%" height="100%" fill="${safeColor(bg, theme.background)}"/><text x="${titlePlacement.x}" y="40" direction="${titlePlacement.direction}" unicode-bidi="isolate" text-anchor="${titlePlacement.textAnchor}" font-size="24" fill="${safeColor(fg, theme.foreground)}" clip-path="url(#${prefix}-heading)">${escapeXML(fitBracketText(t.title, titleRegion.width, 24, measure(24)))}</text><g transform="translate(0,60)">`,
  ];
  for (const n of graph.nodes)
    for (const [i, s] of n.match.slots.entries()) {
      const source = s.source ? nodes.get(s.source.matchId) : undefined;
      if (!source) continue;
      parts.push(
        `<path d="${bracketConnectorPath(source, n, i, layout, locale === "fa", graph.width)}" fill="none" stroke="${safeColor(accent, theme.accent)}" stroke-opacity=".5"/>`,
      );
    }
  for (const [nodeIndex, n] of graph.nodes.entries()) {
    const regions = bracketTextRegions(n.width, rtl, true, fontScale),
      caption = generatedMatchLabel(n.match, locale),
      captionPlacement = svgTextPlacement(caption, regions.caption, direction),
      id = `${prefix}-${nodeIndex}`;
    parts.push(
      `<g class="bracket-node" transform="translate(${rtl ? graph.width - n.x - n.width : n.x},${n.y})"><title>${escapeXML(caption)}</title><defs><clipPath id="${id}-caption"><rect x="${regions.caption.x}" y="2" width="${regions.caption.width}" height="${metrics.headerHeight - 4}"/></clipPath><clipPath id="${id}-names"><rect x="${regions.name.x}" y="${metrics.headerHeight}" width="${regions.name.width}" height="${n.height - metrics.headerHeight}"/></clipPath><clipPath id="${id}-scores"><rect x="${regions.score.x}" y="${metrics.headerHeight}" width="${regions.score.width}" height="${n.height - metrics.headerHeight}"/></clipPath></defs><rect class="match-card" width="${n.width}" height="${n.height}" rx="${Math.min(40, Math.max(0, t.theme.radius ?? theme.radius))}" fill="${safeColor(t.theme.design?.cardColor ?? theme.card, theme.card)}" stroke="${safeColor(accent, theme.accent)}" stroke-opacity=".35"/><text class="bracket-title" x="${captionPlacement.x}" y="${metrics.captionBaseline}" direction="${captionPlacement.direction}" unicode-bidi="isolate" text-anchor="${captionPlacement.textAnchor}" font-size="${metrics.titleFontSize}" fill="${theme.muted}" clip-path="url(#${id}-caption)" data-region-x="${regions.caption.x}" data-region-width="${regions.caption.width}">${escapeXML(fitBracketText(caption, regions.caption.width, metrics.titleFontSize, measure(metrics.titleFontSize)))}</text>`,
    );
    const names = matchNames(t, n.match, locale);
    n.match.slots.forEach((s, i) => {
      const winner =
        s.participantId && n.match.result?.winnerIds.includes(s.participantId);
      const name = names[i],
        placement = svgTextPlacement(name, regions.name, direction),
        score =
          (
            (n.match.status === "live" ? n.match.liveScores?.[i] : undefined) ??
            n.match.result?.scores[i]
          )?.toLocaleString(locale) ?? "·";
      parts.push(
        `<g><title>${escapeXML(name)}: ${escapeXML(score)}</title><text class="bracket-team" x="${placement.x}" y="${metrics.headerHeight + metrics.rowBaseline + i * metrics.rowHeight}" direction="${placement.direction}" unicode-bidi="isolate" text-anchor="${placement.textAnchor}" font-size="${metrics.nameFontSize}" fill="${safeColor(winner ? accent : fg, theme.foreground)}" clip-path="url(#${id}-names)" data-region-x="${regions.name.x}" data-region-width="${regions.name.width}" aria-label="${escapeXML(name)}">${escapeXML(fitBracketText(name, regions.name.width, metrics.nameFontSize, measure(metrics.nameFontSize)))}</text><text class="bracket-score" x="${regions.score.x + regions.score.width / 2}" y="${metrics.headerHeight + metrics.rowBaseline + i * metrics.rowHeight}" direction="ltr" unicode-bidi="isolate" text-anchor="middle" font-size="${fitBracketScoreFontSize(score, regions.score.width, metrics.scoreFontSize, measure(metrics.scoreFontSize, 700))}" font-weight="700" fill="${safeColor(fg, theme.foreground)}" clip-path="url(#${id}-scores)" data-region-x="${regions.score.x}" data-region-width="${regions.score.width}" aria-label="${escapeXML(score)}">${escapeXML(score)}</text></g>`,
      );
    });
    parts.push("</g>");
  }
  parts.push("</g></svg>");
  return parts.join("");
}
export async function exportBracketSVG(
  t: Tournament,
  stageId?: string,
  locale: Locale = "en",
) {
  const { exportVisualSVG } = await import("./files");
  await exportVisualSVG(
    `${t.slug || "bracket"}.svg`,
    bracketSVG(t, stageId, locale),
  );
}
export async function exportBracketPNG(
  t: Tournament,
  stageId?: string,
  locale: Locale = "en",
) {
  const { exportVisualPNG } = await import("./files");
  await exportVisualPNG(
    `${t.slug || "bracket"}.png`,
    bracketSVG(t, stageId, locale),
    locale,
  );
}
export function printableHTML(t: Tournament, locale: Locale = "en") {
  const heading = locale === "fa" ? "برنامه مسابقات" : "Match schedule";
  const isolate = (value: string) => `<bdi>${escapeXML(value)}</bdi>`;
  const rows = scheduleOccurrences({ ...t, locale })
    .map(
      (m) =>
        `<tr><td>${isolate(generatedMatchLabel(m, locale))}<br>${matchNames(t, m, locale).map(isolate).join(" / ")}</td><td><bdi dir="ltr">${escapeXML(m.result?.scores.map((score) => score.toLocaleString(locale)).join(" / ") ?? "")}</bdi></td><td>${isolate(m.scheduledAt ? new Date(m.scheduledAt).toLocaleString(locale, { timeZone: t.timezone }) : "")}</td><td>${isolate(t.schedule.resources.find((r) => r.id === m.resourceId)?.name ?? "")}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escapeXML(t.title)}</title><style>body{font:14px TournaExportArabic,TournaExportLatin,system-ui;margin:32px;color:#182c25}h1{font-size:32px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:start}td,th,h1,p{overflow-wrap:anywhere}svg{max-width:100%;height:auto}tr{break-inside:avoid}@page{size:landscape;margin:15mm}</style></head><body><h1 dir="auto">${escapeXML(t.title)}</h1><p dir="auto">${escapeXML(t.subtitle)}</p><h2>${heading}</h2><table><thead><tr><th>${locale === "fa" ? "شرکت‌کنندگان" : "Participants"}</th><th>${locale === "fa" ? "امتیاز" : "Score"}</th><th>${locale === "fa" ? "زمان" : "Time"}</th><th>${locale === "fa" ? "مکان" : "Resource"}</th></tr></thead><tbody>${rows}</tbody></table>${t.stages.map((s) => bracketSVG(t, s.id, locale)).join("")}<p>TournaStudio</p></body></html>`;
}
/** The browser print dialog offers PDF when the platform supports it. */
export async function printTournament(t: Tournament, locale: Locale = "en") {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error(
      locale === "fa"
        ? "مرورگر پنجره چاپ را مسدود کرده است."
        : "The browser blocked the print window.",
    );
  try {
    const { standaloneTournamentHTML } = await import("./files");
    const html = await standaloneTournamentHTML(t, locale);
    if (popup.closed) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    const fonts = await Promise.all([
      popup.document.fonts.load("14px TournaExportArabic", "شاهین"),
      popup.document.fonts.load("14px TournaExportLatin", "TournaStudio"),
    ]);
    if (
      fonts.some(
        (faces) =>
          !faces.length || faces.some((face) => face.status !== "loaded"),
      )
    )
      throw new Error(
        locale === "fa"
          ? "قلم‌های چاپ بارگیری نشدند. دوباره تلاش کنید."
          : "The print fonts could not be loaded. Please try again.",
      );
    await popup.document.fonts.ready;
    if (!popup.closed) popup.print();
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}
