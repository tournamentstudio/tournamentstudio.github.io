import { expect, it } from "vitest";
import { createTournament } from "../domain/types";
import { visualFrame, visualTextLines } from "./visuals";

for (const title of [
  "Cup جام\nSeries رقابت\nFinals پایان",
  "W".repeat(240),
  "قهرمانی آفتاب Sunshine ".repeat(10).trim(),
])
  it(`reserves one masthead line for ${title.slice(0, 20).replace(/\s+/gu, " ")}`, () => {
    const tournament = createTournament(title, []);
    const before = JSON.stringify(tournament);
    for (const locale of ["en", "fa"] as const)
      for (const width of [1200, 1600]) {
        const svg = visualFrame(tournament, title, "", locale, width);
        const header = svg.match(
          /<g data-export-masthead="true">([\s\S]*?)<\/g>/,
        )![1];
        const text = title.replace(/\s+/gu, " ").trim();
        const size = Number(header.match(/font-size="([\d.]+)"/)![1]);
        expect(header.match(/<text /g)).toHaveLength(1);
        expect(header.replace(/<[^>]+>/g, "")).toBe(text);
        expect(visualTextLines(text, size, width - 220)).toEqual([text]);
        expect(size).toBeLessThanOrEqual(28);
        expect(size).toBeGreaterThan(0);
      }
    expect(JSON.stringify(tournament)).toBe(before);
  });
