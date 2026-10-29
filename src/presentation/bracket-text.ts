export type TextDirection = "ltr" | "rtl";

export interface TextRegion {
  x: number;
  width: number;
}

export function bracketTextMetrics(fontScale = 1) {
  const scale = Math.max(1, fontScale);
  return {
    scale,
    cardWidth: 236 * scale,
    headerHeight: 34 * scale,
    rowHeight: 30 * scale,
    captionBaseline: 21 * scale,
    rowBaseline: 20 * scale,
    titleFontSize: 11 * fontScale,
    nameFontSize: 12 * fontScale,
    scoreFontSize: 14 * fontScale,
  };
}

/** Physical text boxes stay separate regardless of each label's writing direction. */
export function bracketTextRegions(
  width: number,
  rtl: boolean,
  showScores = true,
  fontScale = 1,
) {
  const scale = Math.max(1, fontScale);
  const padding = 12 * scale;
  const scoreWidth = showScores ? 44 * scale : 0;
  const gap = showScores ? 8 * scale : 0;
  return {
    caption: { x: padding, width: width - padding * 2 },
    name: {
      x: padding + (rtl ? scoreWidth + gap : 0),
      width: Math.max(0, width - padding * 2 - scoreWidth - gap),
    },
    score: {
      x: rtl ? padding : width - padding - scoreWidth,
      width: scoreWidth,
    },
  };
}

/** Numbers and punctuation do not determine the paragraph direction. */
export function bracketTextDirection(
  text: string,
  fallback: TextDirection = "ltr",
): TextDirection {
  for (const character of text) {
    if (character === "\u200e") return "ltr";
    if (character === "\u200f" || character === "\u061c") return "rtl";
    if (!/\p{Letter}/u.test(character)) continue;
    return /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u.test(
      character,
    )
      ? "rtl"
      : "ltr";
  }
  return fallback;
}

export function svgTextPlacement(
  text: string,
  region: TextRegion,
  fallbackDirection: TextDirection = "ltr",
) {
  const direction = bracketTextDirection(text, fallbackDirection);
  return {
    x: direction === "rtl" ? region.x + region.width : region.x,
    direction,
    textAnchor: "start" as const,
  };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function estimatedWidth(text: string, fontSize: number) {
  return Array.from(segmenter.segment(text), ({ segment }) =>
    /^\s+$/u.test(segment) ? fontSize * 0.4 : fontSize,
  ).reduce((sum, value) => sum + value, 0);
}

/** Keep numeric results whole, reducing type size only when the score box requires it. */
export function fitBracketScoreFontSize(
  text: string,
  width: number,
  fontSize: number,
  measure?: (value: string) => number,
) {
  const measured = measure ? measure(text) : estimatedWidth(text, fontSize);
  return measured > 0
    ? fontSize * Math.min(1, Math.max(0, width) / measured)
    : fontSize;
}

/** Browser renderers supply measured widths; exports can use a conservative fallback. */
export function fitBracketText(
  text: string,
  width: number,
  fontSize: number,
  measure?: (value: string) => number,
) {
  if (width <= 0) return "";
  const graphemes = Array.from(segmenter.segment(text), (part) => part.segment);
  const measureWidth =
    measure ?? ((value: string) => estimatedWidth(value, fontSize));
  if (measureWidth(text) <= width) return text;
  const ellipsis = "…";
  if (measureWidth(ellipsis) > width) return "";
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      measureWidth(graphemes.slice(0, middle).join("").trimEnd() + ellipsis) <=
      width
    )
      low = middle;
    else high = middle - 1;
  }
  return graphemes.slice(0, low).join("").trimEnd() + ellipsis;
}
