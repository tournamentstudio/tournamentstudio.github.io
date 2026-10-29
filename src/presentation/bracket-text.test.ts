import { describe, expect, it } from "vitest";
import {
  bracketTextDirection,
  bracketTextMetrics,
  bracketTextRegions,
  fitBracketText,
  fitBracketScoreFontSize,
  svgTextPlacement,
} from "./bracket-text";

describe("bracket text placement", () => {
  it.each([
    ["Team آفتاب", "ltr"],
    ["تیم Sunshine", "rtl"],
    ["۲. Team", "ltr"],
    ["12. تیم", "rtl"],
    ["\u200eتیم", "ltr"],
    ["\u200fTeam", "rtl"],
    ["\u061c12", "rtl"],
    ["\u{1f333} تیم", "rtl"],
  ] as const)("uses the first strong direction for %s", (text, expected) => {
    expect(bracketTextDirection(text)).toBe(expected);
  });

  it("uses the requested fallback for labels without a strong letter", () => {
    expect(bracketTextDirection("۱۲ / 24", "rtl")).toBe("rtl");
    expect(bracketTextDirection("۱۲ / 24", "ltr")).toBe("ltr");
  });

  it.each([0.5, 1, 1.5, 3])(
    "separates name and score regions at scale %s",
    (fontScale) => {
      const metrics = bracketTextMetrics(fontScale);
      for (const rtl of [false, true]) {
        const { name, score, caption } = bracketTextRegions(
          metrics.cardWidth,
          rtl,
          true,
          fontScale,
        );
        expect(name.width).toBeGreaterThan(0);
        expect(
          rtl ? score.x + score.width < name.x : name.x + name.width < score.x,
        ).toBe(true);
        expect(caption.x).toBeGreaterThan(0);
        expect(caption.x + caption.width).toBeLessThan(metrics.cardWidth);
        for (const text of ["Team آفتاب", "تیم Sunshine"]) {
          const placement = svgTextPlacement(text, name);
          expect(placement.x).toBe(
            text.startsWith("Team") ? name.x : name.x + name.width,
          );
          expect(placement.textAnchor).toBe("start");
        }
        const hidden = bracketTextRegions(
          metrics.cardWidth,
          rtl,
          false,
          fontScale,
        );
        expect(hidden.name).toEqual(hidden.caption);
        expect(metrics.rowHeight).toBeGreaterThan(metrics.scoreFontSize * 1.5);
      }
    },
  );
});

describe("fitting bracket labels", () => {
  it("keeps numeric scores whole by reducing font size only when needed", () => {
    expect(fitBracketScoreFontSize("123456", 42, 14, () => 84)).toBe(7);
    expect(fitBracketScoreFontSize("۱۲۳۴۵۶", 42, 14)).toBe(7);
    expect(fitBracketScoreFontSize("2", 42, 14, () => 8)).toBe(14);
  });
  it("measures real labels instead of assuming a character count", () => {
    const measure = (text: string) =>
      Array.from(text).reduce((sum, char) => sum + (char === "W" ? 20 : 3), 0);
    expect(fitBracketText("iiiiiiiiiiiiiiiiiiiiiiiiii", 90, 12, measure)).toBe(
      "iiiiiiiiiiiiiiiiiiiiiiiiii",
    );
    expect(fitBracketText("WWWWWW", 90, 12, measure)).toBe("WWWW…");
  });

  it("retains complete graphemes when truncating and keeps Persian half spaces", () => {
    const text = "تیم‌برتر \u{1f9d1}\u{1f3fd}\u200d\u{1f680} é Academy";
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      ({ segment }) => segment,
    );
    const measure = (value: string) =>
      Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
          value,
        ),
      ).length;
    const result = fitBracketText(text, 12, 1, measure);
    expect(result).toBe(graphemes.slice(0, 11).join("").trimEnd() + "…");
    expect(result).toContain("تیم‌برتر");
    expect(result).toContain("\u{1f9d1}\u{1f3fd}\u200d\u{1f680}");
    expect(fitBracketText(text, 1000, 12)).toBe(text);
  });

  it("handles zero width and a region narrower than the ellipsis", () => {
    expect(fitBracketText("Long name", 0, 12)).toBe("");
    expect(fitBracketText("Long name", 2, 12)).toBe("");
  });
});
