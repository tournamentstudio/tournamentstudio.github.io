import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sports } from "../sports";
import { GameIcon, GolActionIcon } from "./GameIcon";
import {
  gameIconGeometry,
  getGameIconId,
  golActionGeometry,
  golHandOutline,
} from "./game-icons";
import { getThemesForSport } from "./index";
import { motifGeometry, motifSVG } from "./motifs";
import { GameIdentity, ThemeMotif } from "./ThemeMotif";

describe("activity icons", () => {
  it("covers every sport with a distinct icon and safely falls back for unknown IDs", () => {
    expect(Object.keys(gameIconGeometry).sort()).toEqual(
      sports.map((sport) => sport.id).sort(),
    );
    expect(
      new Set(
        Object.values(gameIconGeometry).map((shapes) => JSON.stringify(shapes)),
      ).size,
    ).toBe(sports.length);
    for (const sport of sports) {
      expect(getGameIconId(sport.id)).toBe(sport.id);
      const markup = renderToStaticMarkup(
        createElement(GameIcon, { sport: sport.id }),
      );
      expect(markup).toContain(`data-game-icon="${sport.id}"`);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toMatch(/script|foreignObject|image|href|<title/);
    }
    for (const sport of [
      "constructor",
      "toString",
      "__proto__",
      '<script>alert("x")</script>',
    ]) {
      expect(getGameIconId(sport)).toBe("generic");
      const markup = renderToStaticMarkup(createElement(GameIcon, { sport }));
      expect(markup).toContain('data-game-icon="generic"');
      expect(markup).not.toContain("script");
      const identity = renderToStaticMarkup(
        createElement(GameIdentity, { sport }),
      );
      expect(identity).toContain("Open competition");
    }
  });

  it("retains sport identity when the organizer selects an unrelated theme", () => {
    for (const preset of ["minimal-light", "football", "gol-traditional"]) {
      const markup = renderToStaticMarkup(
        createElement(GameIdentity, { sport: "gol-ya-pooch", preset }),
      );
      expect(markup).toContain(`data-theme="${preset}"`);
      expect(markup).toContain('data-game-icon="gol-ya-pooch"');
      expect(markup).not.toContain("data-motif=");
    }
    const markup = renderToStaticMarkup(
      createElement(GameIdentity, { sport: "football", preset: "gol-night" }),
    );
    expect(markup).toContain('data-game-icon="football"');
    expect(markup).toContain('data-theme="gol-night"');
  });

  it("distinguishes similar games through equipment and court geometry", () => {
    expect(gameIconGeometry.football[0]).toEqual({
      kind: "circle",
      cx: 32,
      cy: 32,
      r: 25,
      fill: false,
    });
    expect(gameIconGeometry.futsal[0]).toMatchObject({
      kind: "rect",
      width: 56,
      height: 46,
      rx: 9,
    });
    expect(
      gameIconGeometry.tennis.some(
        (shape) => shape.kind === "circle" && shape.r === 8,
      ),
    ).toBe(true);
    expect(
      gameIconGeometry["table-tennis"].some(
        (shape) => shape.kind === "circle" && shape.r === 6,
      ),
    ).toBe(true);
    expect(
      gameIconGeometry.basketball.some(
        (shape) =>
          shape.kind === "path" && shape.d.includes("M7 32H57M32 7V57"),
      ),
    ).toBe(true);
  });

  it("draws equal closed fists around a neutral bead without accepting gameplay state", () => {
    const hands = gameIconGeometry["gol-ya-pooch"];
    expect(
      hands.filter(
        (shape) => shape.kind === "path" && shape.d === golHandOutline,
      ),
    ).toHaveLength(2);
    expect(hands[2]).toMatchObject({
      d: golHandOutline,
      transform: "translate(64 0) scale(-1 1)",
    });
    expect(hands[4]).toMatchObject({
      kind: "circle",
      cx: 32,
      cy: 25,
      r: 3,
      fill: false,
    });
    const props = {
      sport: "gol-ya-pooch",
      secret: "private-hand-position",
      concealedSide: "left",
    };
    const markup = renderToStaticMarkup(createElement(GameIcon, props));
    expect(markup).not.toMatch(/secret|private-hand-position|concealedSide/);
    expect(markup).toContain('transform="translate(64 0) scale(-1 1)"');
  });

  it("offers local action symbols with opt-in accessible names", () => {
    for (const action of Object.keys(golActionGeometry) as Array<
      keyof typeof golActionGeometry
    >) {
      const markup = renderToStaticMarkup(
        createElement(GolActionIcon, { action, size: 32 }),
      );
      expect(markup).toContain(`data-gol-icon="${action}"`);
      expect(markup).toContain('width="32"');
      expect(markup).toContain('aria-hidden="true"');
    }
    const markup = renderToStaticMarkup(
      createElement(GameIcon, { sport: "gol-ya-pooch", label: "گل یا پوچ" }),
    );
    expect(markup).toContain('aria-label="گل یا پوچ"');
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain("aria-hidden");
  });

  it("preserves Gol motif transformations in rendered and serialized theme art", () => {
    for (const theme of getThemesForSport("gol-ya-pooch")) {
      const markup = renderToStaticMarkup(
        createElement(ThemeMotif, { preset: theme.id }),
      );
      const svg = motifSVG(theme.motif, "#246343");
      const transforms = motifGeometry[theme.motif].flatMap((shape) =>
        shape.transform ? [shape.transform] : [],
      );
      expect(transforms.length).toBeGreaterThan(0);
      for (const transform of transforms) {
        expect(markup).toContain(`transform="${transform}"`);
        expect(svg).toContain(`transform="${transform}"`);
      }
      expect(svg).not.toMatch(
        /script|image|href|foreignObject|secret|conceal/i,
      );
    }
  });
});
