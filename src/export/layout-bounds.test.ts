import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { defaultOverlay } from "../domain/display-options";
import { generateStage } from "../engine";
import { broadcastOverlaySVG } from "./overlay";
import { sponsorVisualPages } from "./sponsors";

const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=";

function cards(svg: string) {
  return Array.from(
    svg.matchAll(
      /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*>([\s\S]*?)(?=<rect x=|<text x="800" y="870"|$)/g,
    ),
    (match) => ({
      left: Number(match[1]),
      top: Number(match[2]),
      width: Number(match[3]),
      bottom: Number(match[2]) + Number(match[4]),
      text: Array.from(
        match[5].matchAll(
          /<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g,
        ),
        (text) => ({
          baseline: Number(text[1]),
          size: Number(text[2]),
          value: text[3].replace(/<[^>]*>/g, ""),
        }),
      ).filter((text) => text.value !== "TournaStudio"),
    }),
  );
}

describe("wrapped graphic card bounds", () => {
  for (const layout of ["grid", "strip", "spotlight"] as const)
    it(`keeps full sponsor names inside ${layout} cards and separates rows`, () => {
      const tournament = createTournament("Partner cup", []);
      tournament.presentation.sponsorLayout = layout;
      tournament.presentation.sponsorCards = Array.from(
        { length: 8 },
        (_, index) => ({
          id: `sponsor-${index}`,
          name: `${"W".repeat(80)} حامی آفتاب Partners ${index}`,
          tier: index === 0 ? "main" : "partner",
          logo,
        }),
      );
      const [page] = sponsorVisualPages(tournament, "Partners", "fa");
      const boxes = cards(page.svg);
      expect(boxes).toHaveLength(8);
      for (const [index, box] of boxes.entries()) {
        const reconstructed = box.text
          .map((line) => line.value)
          .join("")
          .replace(/\s/g, "");
        expect(reconstructed).toBe(
          tournament.presentation.sponsorCards[index].name.replace(/\s/g, ""),
        );
        for (const line of box.text) {
          expect(line.baseline - line.size).toBeGreaterThanOrEqual(box.top);
          expect(line.baseline + line.size / 2).toBeLessThanOrEqual(box.bottom);
        }
        const nextRow = boxes
          .slice(index + 1)
          .find((next) => next.left === box.left);
        if (nextRow) expect(box.bottom).toBeLessThan(nextRow.top);
      }
      const footerY = Number(
        page.svg.match(
          /<text x="800" y="([\d.]+)"[^>]*>[^<]*<tspan[^>]*>TournaStudio/,
        )?.[1],
      );
      expect(Math.max(...boxes.map((box) => box.bottom))).toBeLessThan(
        footerY - 18,
      );
    });

  it("grows the compact overlay title before placing entrant cards", () => {
    const tournament = createTournament(
      `${"W".repeat(180)} جام آفتاب Championship`,
      [createParticipant("A", 1), createParticipant("B", 2)],
    );
    const generated = generateStage(tournament, tournament.stages[0].id);
    const svg = broadcastOverlaySVG(
      generated,
      { ...defaultOverlay, layout: "compact" },
      "fa",
    );
    const [title, firstEntrant] = cards(svg);
    expect(title.text.length).toBeGreaterThan(2);
    for (const line of title.text)
      expect(line.baseline + line.size / 2).toBeLessThanOrEqual(title.bottom);
    expect(title.bottom).toBeLessThan(firstEntrant.top);
    expect(
      title.text
        .map((line) => line.value)
        .join("")
        .replace(/\s/g, ""),
    ).toBe(tournament.title.replace(/\s/g, ""));
  });
});
