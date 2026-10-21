import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { layoutBracket } from "./Bracket";
import {
  bracketConnectorPath,
  supportsCenteredBracket,
  transformBracketLayout,
} from "./bracket-layouts";

function graph(count: number, double = false) {
  let t = createTournament(
    "Layout",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`Team ${i}`, i + 1),
    ),
    double ? "double-elimination" : "single-elimination",
  );
  t.stages[0].config.thirdPlace = true;
  t = generateStage(t, t.stages[0].id);
  return layoutBracket(t.matches);
}

describe("bracket display geometry", () => {
  it.each([3, 7, 13, 31, 127, 512])(
    "keeps %i entrants visible without overlapping cards in each layout",
    (count) => {
      const original = graph(count),
        before = JSON.stringify(original);
      for (const layout of [
        "horizontal",
        "compact",
        "vertical",
        "centered",
      ] as const) {
        const next = transformBracketLayout(original, layout);
        expect(new Set(next.nodes.map((node) => node.match.id)).size).toBe(
          original.nodes.length,
        );
        for (const node of next.nodes) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.y).toBeGreaterThanOrEqual(0);
          expect(node.x + node.width).toBeLessThan(next.width);
          expect(node.y + node.height).toBeLessThan(next.height);
          for (const other of next.nodes.filter((other) => other !== node)) {
            const overlap =
              node.x < other.x + other.width &&
              node.x + node.width > other.x &&
              node.y < other.y + other.height &&
              node.y + node.height > other.y;
            expect(
              overlap,
              `${layout}: ${node.match.id} / ${other.match.id}`,
            ).toBe(false);
          }
        }
      }
      expect(JSON.stringify(original)).toBe(before);
    },
  );
  it("centers the final between two real source trees and keeps placement below it", () => {
    const original = graph(8),
      centered = transformBracketLayout(original, "centered");
    const final = centered.nodes.find(
      (node) => node.match.metadata.championship,
    )!;
    expect(centered.nodes.some((node) => node.x < final.x)).toBe(true);
    expect(centered.nodes.some((node) => node.x > final.x)).toBe(true);
    const placement = centered.nodes.find(
      (node) => node.match.bracket === "placement",
    );
    expect(placement!.y).toBeGreaterThan(final.y + final.height);
  });
  it("keeps double elimination in its supported layout when centered is requested", () => {
    const original = graph(8, true);
    expect(supportsCenteredBracket(original)).toBe(false);
    expect(transformBracketLayout(original, "centered")).toBe(original);
    expect(transformBracketLayout(original, "vertical").nodes).toHaveLength(
      original.nodes.length,
    );
  });
  it("connects vertical sources downward and right-side sources back toward the center", () => {
    const original = graph(8),
      vertical = transformBracketLayout(original, "vertical");
    const target = vertical.nodes.find((n) =>
      n.match.slots.some((slot) => slot.source),
    )!;
    const source = vertical.nodes.find(
      (n) => n.match.id === target.match.slots[0].source!.matchId,
    )!;
    expect(source.y + source.height).toBeLessThan(target.y);
    expect(
      bracketConnectorPath(
        source,
        target,
        0,
        "vertical",
        false,
        vertical.width,
      ),
    ).toMatch(/^M[\d.]+,[\d.]+V/);
    const centered = transformBracketLayout(original, "centered"),
      final = centered.nodes.find((n) => n.match.metadata.championship)!;
    const right = centered.nodes.find(
      (n) => n.match.id === final.match.slots[1].source!.matchId,
    )!;
    expect(right.x).toBeGreaterThan(final.x);
    expect(
      bracketConnectorPath(right, final, 1, "centered", false, centered.width),
    ).toContain(`M${right.x},`);
  });
});
