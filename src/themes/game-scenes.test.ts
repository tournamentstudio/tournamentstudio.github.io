import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameScene } from "./GameScene";
import { sports } from "../sports";

describe("game scenes", () => {
  it("renders a distinct local scene for every supported activity", () => {
    const scenes = sports.map(({ id }) =>
      renderToStaticMarkup(createElement(GameScene, { sport: id })),
    );
    expect(new Set(scenes).size).toBe(sports.length);
    scenes.forEach((scene, index) => {
      expect(scene).toContain(`data-game-scene="${sports[index].id}"`);
      expect(scene).toContain('aria-hidden="true"');
      expect(scene).not.toMatch(/<script|<foreignObject|href=|onload=/);
    });
  });

  it("falls back safely for unrecognized imported sport identifiers", () => {
    const unknown = renderToStaticMarkup(
      createElement(GameScene, { sport: "<script>alert(1)</script>" }),
    );
    const generic = renderToStaticMarkup(
      createElement(GameScene, { sport: "generic" }),
    );
    expect(unknown).toBe(generic);
  });

  it("keeps Gol artwork independent of hidden referee information", () => {
    const first = {
      sport: "gol-ya-pooch",
      concealedPosition: "left-hand",
      refereeNotes: "private",
    };
    const second = {
      ...first,
      concealedPosition: "right-hand",
      refereeNotes: "changed",
    };
    const render = (props: typeof first) =>
      renderToStaticMarkup(createElement(GameScene, props));
    expect(render(first)).toBe(render(second));
    expect(render(first)).not.toMatch(/left-hand|private|concealedPosition/);
  });
});
