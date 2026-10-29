import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, simulate } from "../engine";
import { sports } from "../sports";
import { gameEmblemSVG, gameSceneSVG } from "./game-art";
import { championPosterSVG, scoreboardSVG } from "./visuals";

const palette = { accent: "#25634a", card: "#ffffff" };
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fixture(sport = "gol-ya-pooch") {
  const doc = createTournament(
    "جام دست‌ها & Hands cup",
    [
      createParticipant("شاهین Team <A>", 1),
      createParticipant("هما Team B", 2),
    ],
    "single-elimination",
    sport,
  );
  doc.theme.preset = "minimal-light";
  return generateStage(doc, doc.stages[0].id);
}

describe("activity artwork in portable graphics", () => {
  it("gives every built-in activity its own equipment and scene geometry", () => {
    const scenes = sports.map(({ id }) =>
      gameSceneSVG(id, palette, 280, 150, 640),
    );
    expect(
      new Set(scenes.map((svg) => svg.replace(/data-game-art="[^"]+"/, "")))
        .size,
    ).toBe(sports.length);
    for (const [index, sport] of sports.entries()) {
      expect(scenes[index]).toContain(`data-game-art="${sport.id}"`);
      expect(scenes[index]).toContain('aria-hidden="true"');
      expect(scenes[index]).not.toMatch(/<script|<foreignObject|href=|onload=/);
    }
  });

  it("uses a safe generic scene for imported identifiers and invalid colors", () => {
    const svg = gameSceneSVG(
      '<image href="https://example.com">',
      {
        accent: '" onload="alert(1)',
        card: "url(https://example.com/image)",
      },
      0,
      0,
      640,
    );
    expect(svg).toContain('data-game-art="generic"');
    expect(svg).toContain('color="#25634a"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toMatch(/example\.com|onload|<image/);
    expect(gameEmblemSVG("__proto__", "invalid", 0, 0, 64)).toContain(
      'data-game-emblem="generic"',
    );
  });

  it("keeps Gol artwork independent of theme and concealed information", () => {
    const doc = fixture();
    const first = scoreboardSVG(doc, doc.matches[0].id, "fa");
    doc.matches[0].private = { concealedPosition: "PRIVATE-HAND-THREE" };
    doc.matches[0].notes = "PRIVATE-REFEREE-NOTES";
    const second = scoreboardSVG(doc, doc.matches[0].id, "fa");
    expect(second).toBe(first);
    expect(second.match(/data-game-emblem="gol-ya-pooch"/g)).toHaveLength(2);
    expect(second).toContain('data-game-art="gol-ya-pooch"');
    expect(second).toContain("&lt;A&gt;");
    expect(championPosterSVG(simulate(doc), "fa")).toContain(
      'data-game-art="gol-ya-pooch"',
    );
  });

  it("preserves validated entrant artwork and leaves room above the champion name", () => {
    const doc = fixture();
    doc.participants[0].logo = logo;
    const board = scoreboardSVG(doc, doc.matches[0].id);
    expect(board).toContain(`href="${logo}"`);
    expect(board.match(/data-entrant-logo="true"/g)).toHaveLength(1);
    expect(board.match(/data-game-emblem="gol-ya-pooch"/g)).toHaveLength(1);
    const poster = championPosterSVG(simulate(doc));
    expect(poster).toContain(`href="${logo}"`);
    expect(poster).toContain(
      'data-text-region="champion-name"><text x="600" y="820"',
    );
    doc.participants[0].logo = "https://example.com/private.svg";
    expect(() => scoreboardSVG(doc, doc.matches[0].id)).toThrow("embedded PNG");
  });
});
