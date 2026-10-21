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
    const content = cards
      .map((card, index) => {
        let x: number, y: number, width: number, height: number;
        if (spotlight && index === 0) {
          x = 50;
          y = 130;
          width = 1500;
          height = 190;
        } else if (spotlight) {
          const offset = index - 1;
          x = 50 + (offset % 4) * 381;
          y = 346 + Math.floor(offset / 4) * 228;
          width = 357;
          height = 204;
        } else {
          const columns = strip ? 2 : 4;
          width = strip ? 738 : 357;
          height = strip ? 158 : 304;
          x = 50 + (index % columns) * (width + 24);
          y = 136 + Math.floor(index / columns) * (height + 24);
        }
        const horizontal = strip || (spotlight && index === 0);
        const logoWidth = horizontal
          ? Math.min(220, width * 0.24)
          : Math.min(220, width - 40);
        const logoHeight = horizontal ? height - 40 : spotlight ? 60 : 138;
        const logoX = horizontal ? x + 24 : x + (width - logoWidth) / 2;
        const logoY = y + 20;
        const logo =
          card.logo && validateRasterAsset(card.logo)
            ? `<image href="${escapeXML(card.logo)}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`
            : "";
        const textWidth =
          horizontal && logo ? width - logoWidth - 72 : width - 32;
        const textX =
          horizontal && logo
            ? x + logoWidth + 36 + textWidth / 2
            : x + width / 2;
        const size =
          Array.from(card.name).length > 55
            ? spotlight
              ? 15
              : 18
            : horizontal
              ? 28
              : 22;
        const textY = horizontal
          ? y + height * 0.45
          : logo
            ? y + logoHeight + 46
            : y + 56;
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${palette.radius}" fill="${palette.card}" stroke="${card.tier === "main" ? palette.accent : palette.muted}" stroke-width="${card.tier === "main" ? 3 : 1}"/>${logo}${visualText(card.name, textX, textY, size, textWidth, locale, palette.foreground)}`;
      })
      .join("");
    const pageTitle =
      pages.length > 1 ? `${title} (${page + 1}/${pages.length})` : title;
    return {
      title: pageTitle,
      svg: visualFrame(t, pageTitle, content, locale),
    };
  });
}
