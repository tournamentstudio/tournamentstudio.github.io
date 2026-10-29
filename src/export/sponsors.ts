import type { Locale, Tournament } from "../domain/types";
import { publicProjection } from "../sharing";
import { sponsorPages } from "../presentation/sponsors";
import { validateRasterAsset } from "../security/codec";
import { escapeXML } from "./index";
import {
  tableVisualPages,
  visualFrame,
  visualPalette,
  visualText,
  visualTextLines,
  type VisualPage,
} from "./visuals";

export function sponsorVisualPages(
  source: Tournament,
  title: string,
  locale: Locale,
): VisualPage[] {
  const t = publicProjection(source),
    pages = sponsorPages(t.presentation),
    palette = visualPalette(t);
  if (!pages.length)
    return tableVisualPages(
      t,
      title,
      [locale === "fa" ? "حامی ثبت نشده است." : "No sponsors recorded."],
      locale,
    );
  return pages.map((cards, page) => {
    const strip = t.presentation.sponsorLayout === "strip",
      spotlight =
        t.presentation.sponsorLayout === "spotlight" &&
        cards[0]?.tier === "main";
    const prepared = cards.map((card, index) => {
      let column: number, row: number, width: number, baseHeight: number;
      if (spotlight && index === 0) {
        column = 0;
        row = 0;
        width = 1500;
        baseHeight = 190;
      } else if (spotlight) {
        const offset = index - 1;
        column = offset % 4;
        row = 1 + Math.floor(offset / 4);
        width = 357;
        baseHeight = 204;
      } else {
        const columns = strip ? 2 : 4;
        column = index % columns;
        row = Math.floor(index / columns);
        width = strip ? 738 : 357;
        baseHeight = strip ? 158 : 304;
      }
      const horizontal = strip || (spotlight && index === 0);
      const logoWidth = horizontal
        ? Math.min(220, width * 0.24)
        : Math.min(220, width - 40);
      const logoHeight = horizontal ? baseHeight - 40 : spotlight ? 60 : 138;
      const hasLogo = Boolean(card.logo && validateRasterAsset(card.logo));
      const textWidth =
        horizontal && hasLogo ? width - logoWidth - 72 : width - 32;
      const size =
        Array.from(card.name).length > 55
          ? spotlight
            ? 15
            : 18
          : horizontal
            ? 28
            : 22;
      const textHeight =
        visualTextLines(card.name, size, textWidth).length * size * 1.5;
      const textTop = hasLogo ? logoHeight + 46 - size : 56 - size;
      const height = Math.max(
        baseHeight,
        horizontal ? textHeight + 40 : textTop + textHeight + 24,
      );
      return {
        card,
        column,
        row,
        width,
        height,
        horizontal,
        logoWidth,
        logoHeight,
        hasLogo,
        textWidth,
        size,
        textHeight,
        textTop,
      };
    });
    const rowHeights: number[] = [];
    for (const card of prepared)
      rowHeights[card.row] = Math.max(rowHeights[card.row] ?? 0, card.height);
    const rowTops: number[] = [spotlight ? 130 : 136];
    for (let row = 1; row < rowHeights.length; row++)
      rowTops[row] = rowTops[row - 1] + rowHeights[row - 1] + 24;
    const content = prepared
      .map(
        ({
          card,
          column,
          row,
          width,
          horizontal,
          logoWidth,
          logoHeight,
          hasLogo,
          textWidth,
          size,
          textHeight,
          textTop,
        }) => {
          const x = 50 + column * (width + 24),
            y = rowTops[row],
            height = rowHeights[row];
          const logoX = horizontal ? x + 24 : x + (width - logoWidth) / 2;
          const logo = hasLogo
            ? `<image href="${escapeXML(card.logo!)}" x="${logoX}" y="${y + 20}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`
            : "";
          const textX =
            horizontal && hasLogo
              ? x + logoWidth + 36 + textWidth / 2
              : x + width / 2;
          const textY =
            y + (horizontal ? (height - textHeight) / 2 : textTop) + size;
          return `<g data-sponsor-card="true"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${palette.radius}" fill="${palette.card}" stroke="${card.tier === "main" ? palette.accent : palette.muted}" stroke-width="${card.tier === "main" ? 3 : 1}"/>${logo}<g data-text-region="sponsor-name">${visualText(card.name, textX, textY, size, textWidth, locale, palette.foreground)}</g></g>`;
        },
      )
      .join("");
    const pageTitle =
      pages.length > 1 ? `${title} (${page + 1}/${pages.length})` : title;
    return {
      title: pageTitle,
      svg: visualFrame(
        t,
        pageTitle,
        content,
        locale,
        1600,
        Math.max(900, rowTops.at(-1)! + rowHeights.at(-1)! + 92),
      ),
    };
  });
}
