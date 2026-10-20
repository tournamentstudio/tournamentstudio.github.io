import type { Locale, Tournament } from "../domain/types";
import { layoutBracket, matchNames } from "../components/Bracket";
import { getStandings } from "../engine";
import { getTheme } from "../themes";

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
              "Stage",
              "Round",
              "Group",
              "Participants",
              "Scores",
              "Status",
              "Scheduled time",
              "Resource",
            ],
            ...t.matches.map((m) => [
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
  for (const m of t.matches.filter((m) => m.scheduledAt)) {
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
      `DESCRIPTION:${icsEscape(`${t.title} | ${t.stages.find((s) => s.id === m.stageId)?.name ?? ""} | ${m.round}`)}`,
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
  const matches = t.matches.filter((m) => m.stageId === stageId),
    graph = layoutBracket(matches, t.theme.spacing),
    theme = getTheme(t.theme.preset);
  const fg = t.theme.foreground ?? theme.foreground,
    bg = t.theme.background ?? theme.background,
    accent = t.theme.accent ?? theme.accent;
  const safeColor = (v: string, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  const nodes = new Map(graph.nodes.map((n) => [n.match.id, n]));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height + 70}" viewBox="0 0 ${graph.width} ${graph.height + 70}"><rect width="100%" height="100%" fill="${safeColor(bg, theme.background)}"/><text x="24" y="40" font-family="sans-serif" font-size="24" fill="${safeColor(fg, theme.foreground)}">${escapeXML(t.title)}</text><g transform="translate(0,60)" font-family="sans-serif">`,
  ];
  for (const n of graph.nodes)
    for (const [i, s] of n.match.slots.entries()) {
      const source = s.source ? nodes.get(s.source.matchId) : undefined;
      if (!source) continue;
      const x1 = source.x + source.width,
        x2 = n.x,
        y1 = source.y + source.height / 2,
        y2 = n.y + 49 + i * 30;
      parts.push(
        `<path d="M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}" fill="none" stroke="${safeColor(accent, theme.accent)}" stroke-opacity=".5"/>`,
      );
    }
  for (const n of graph.nodes) {
    parts.push(
      `<g transform="translate(${n.x},${n.y})"><rect width="${n.width}" height="${n.height}" rx="${Math.min(40, Math.max(0, t.theme.radius ?? theme.radius))}" fill="${theme.card}" stroke="${safeColor(accent, theme.accent)}" stroke-opacity=".35"/><text x="12" y="22" font-size="11" fill="${theme.muted}">${locale === "fa" ? "دور" : "ROUND"} ${n.match.round}</text>`,
    );
    const names = matchNames(t, n.match, locale);
    n.match.slots.forEach((s, i) => {
      const winner =
        s.participantId && n.match.result?.winnerIds.includes(s.participantId);
      parts.push(
        `<text x="12" y="${54 + i * 30}" font-size="12" fill="${safeColor(winner ? accent : fg, theme.foreground)}">${escapeXML(names[i].length > 26 ? names[i].slice(0, 25) + "…" : names[i])}</text><text x="${n.width - 12}" y="${54 + i * 30}" text-anchor="end" font-size="14" fill="${safeColor(fg, theme.foreground)}">${n.match.result?.scores[i] ?? "·"}</text>`,
      );
    });
    parts.push("</g>");
  }
  parts.push("</g></svg>");
  return parts.join("");
}
export function exportBracketSVG(
  t: Tournament,
  stageId?: string,
  locale: Locale = "en",
) {
  downloadText(
    `${t.slug || "bracket"}.svg`,
    bracketSVG(t, stageId, locale),
    "image/svg+xml",
  );
}
export async function exportBracketPNG(
  t: Tournament,
  stageId?: string,
  locale: Locale = "en",
) {
  const url = URL.createObjectURL(
    new Blob([bracketSVG(t, stageId, locale)], { type: "image/svg+xml" }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(
      2,
      8192 / Math.max(img.width, img.height),
      Math.sqrt(24_000_000 / (img.width * img.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PNG export unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG export failed"))),
        "image/png",
      ),
    );
    downloadBlob(`${t.slug || "bracket"}.png`, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function printableHTML(t: Tournament, locale: Locale = "en") {
  const heading = locale === "fa" ? "برنامه مسابقات" : "Match schedule";
  const rows = t.matches
    .map(
      (m) =>
        `<tr><td>${escapeXML(matchNames(t, m, locale).join(" / "))}</td><td>${escapeXML(m.result?.scores.join(" / ") ?? "")}</td><td>${escapeXML(m.scheduledAt ? new Date(m.scheduledAt).toLocaleString(locale, { timeZone: t.timezone }) : "")}</td><td>${escapeXML(t.schedule.resources.find((r) => r.id === m.resourceId)?.name ?? "")}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escapeXML(t.title)}</title><style>body{font:14px system-ui;margin:32px;color:#182c25}h1{font-size:32px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:start}svg{max-width:100%;height:auto}tr{break-inside:avoid}@page{size:landscape;margin:15mm}</style></head><body><h1>${escapeXML(t.title)}</h1><p>${escapeXML(t.subtitle)}</p><h2>${heading}</h2><table><thead><tr><th>${locale === "fa" ? "شرکت‌کنندگان" : "Participants"}</th><th>${locale === "fa" ? "امتیاز" : "Score"}</th><th>${locale === "fa" ? "زمان" : "Time"}</th><th>${locale === "fa" ? "مکان" : "Resource"}</th></tr></thead><tbody>${rows}</tbody></table>${t.stages.map((s) => bracketSVG(t, s.id, locale)).join("")}<p>TournaStudio</p></body></html>`;
}
/** The browser print dialog offers PDF when the platform supports it. */
export function printTournament(t: Tournament, locale: Locale = "en") {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error(
      locale === "fa"
        ? "مرورگر پنجره چاپ را مسدود کرده است."
        : "The browser blocked the print window.",
    );
  popup.document.open();
  popup.document.write(printableHTML(t, locale));
  popup.document.close();
  setTimeout(() => {
    if (!popup.closed) popup.print();
  }, 500);
}
