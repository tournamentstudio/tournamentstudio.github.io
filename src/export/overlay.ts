import type { Locale, Tournament } from "../domain/types";
import { overlaySchema, type OverlaySettings } from "../domain/display-options";
import { publicProjection } from "../sharing";
import { matchNames } from "../components/Bracket";
import { escapeXML } from "./index";
import {
  exportLabel,
  selectedScoreboardMatch,
  visualPalette,
  visualScoreText,
  visualText,
  visualTextLines,
} from "./visuals";

export function broadcastOverlaySVG(
  tournament: Tournament,
  input: OverlaySettings,
  locale: Locale = "en",
) {
  const settings = overlaySchema.parse(input),
    t = publicProjection(tournament);
  const match = settings.matchId
    ? t.matches.find((m) => m.id === settings.matchId)
    : selectedScoreboardMatch(t);
  if (!match)
    throw new Error(
      exportLabel(
        locale,
        "Choose a ready or completed match for the overlay.",
        "یک مسابقه آماده یا کامل‌شده برای لایه پخش انتخاب کنید.",
      ),
    );
  const c = visualPalette(t),
    names = matchNames(t, match, locale);
  const width = 1600,
    cardWidth =
      settings.layout === "compact"
        ? 640
        : settings.layout === "stacked"
          ? 1120
          : 752;
  const columns = settings.layout === "strip" ? 2 : 1,
    fontSize = settings.layout === "compact" ? 26 : 36;
  const titleWidth = cardWidth * columns + 16 * (columns - 1),
    titleTextWidth = titleWidth - 40,
    titleSize = Math.max(
      16,
      Math.min(28, 1400 / Math.max(1, Array.from(t.title).length)),
    ),
    titleLines = visualTextLines(t.title, titleSize, titleTextWidth).length,
    titleHeight = Math.max(
      72,
      (titleLines - 1) * titleSize * 1.5 + titleSize + 32,
    ),
    titleOffset = settings.showTournament ? titleHeight + 18 : 0;
  const cardHeight = Math.max(
    112,
    ...names.map(
      (name) =>
        visualTextLines(name, fontSize, cardWidth - 150).length *
          fontSize *
          1.5 +
        48,
    ),
  );
  const boardHeight =
    Math.ceil(names.length / columns) * (cardHeight + 12) + titleOffset;
  const height = Math.max(900, boardHeight + 64),
    top =
      settings.position === "top"
        ? 32
        : settings.position === "center"
          ? (height - boardHeight) / 2
          : height - boardHeight - 32;
  const title = settings.showTournament
    ? `<g data-overlay-title="true"><rect x="32" y="${top}" width="${titleWidth}" height="${titleHeight}" rx="${c.radius}" fill="${c.card}"/>${visualText(t.title, 32 + titleWidth / 2, top + (titleHeight - (titleLines - 1) * titleSize * 1.5) / 2 + titleSize / 3, titleSize, titleTextWidth, locale, c.foreground)}</g>`
    : "";
  const rows = names
    .map((name, index) => {
      const x = 32 + (index % columns) * (cardWidth + 16),
        y = top + titleOffset + Math.floor(index / columns) * (cardHeight + 12);
      const score = t.presentation.showScores
        ? (
            (match.status === "live" ? match.liveScores?.[index] : undefined) ??
            match.result?.scores[index] ??
            0
          ).toLocaleString(locale)
        : "·";
      return `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="${c.radius}" fill="${c.card}"/><path d="M${x} ${y + cardHeight - 4}H${x + cardWidth}" stroke="${c.accent}" stroke-width="8"/>${visualText(name, x + (cardWidth - 130) / 2, y + 54, fontSize, cardWidth - 150, locale, c.foreground)}${visualScoreText(score, x + cardWidth - 65, y + 64, fontSize + 12, 110, c.accent)}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXML(t.title)} · ${exportLabel(locale, "Broadcast overlay", "لایه پخش")}</title><style>text{font-family:TournaExportArabic,TournaExportLatin,sans-serif;font-weight:600}</style>${settings.background === "transparent" ? "" : `<rect width="100%" height="100%" fill="${settings.background === "chroma" ? settings.chroma : c.background}"/>`}${title}${rows}</svg>`;
}
