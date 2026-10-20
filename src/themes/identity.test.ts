import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTournament } from "../domain/types";
import { sports } from "../sports";
import { contrastRatio } from "./contrast";
import { getTheme, getThemesForSport, themes, themeStyle } from "./index";
import { materialBackgrounds, motifGeometry, motifSVG } from "./motifs";
import { GameIdentity, ThemeMotif } from "./ThemeMotif";
import { ThemeStudio, themeFileSchema } from "./ThemeStudio";

const originalIds = [
  "minimal-light",
  "minimal-dark",
  "modern-glass",
  "editorial",
  "corporate",
  "championship-gold",
  "university",
  "festival",
  "football",
  "basketball",
  "volleyball",
  "tennis",
  "racing",
  "boxing",
  "broadcast",
  "esports-neon",
  "retro-arcade",
  "cyber-arena",
  "fantasy",
  "chess",
  "board-game",
  "persian-heritage",
  "gol-traditional",
  "gol-modern",
  "gol-night",
  "winter",
  "summer",
];

describe("game theme collections", () => {
  it("offers multiple related identities for every preset activity", () => {
    expect(sports).toHaveLength(14);
    for (const sport of sports) {
      const collection = getThemesForSport(sport.id);
      expect(collection.length, sport.id).toBeGreaterThanOrEqual(2);
      expect(collection.every((theme) => theme.sports.includes(sport.id))).toBe(
        true,
      );
      expect(
        new Set(collection.map((theme) => theme.material)).size,
        sport.id,
      ).toBeGreaterThanOrEqual(2);
      expect(
        new Set(
          collection.map(
            (theme) =>
              `${theme.radius}:${theme.font}:${theme.pattern}:${theme.border}`,
          ),
        ).size,
        sport.id,
      ).toBeGreaterThanOrEqual(2);
      expect(
        collection.every((theme) => theme.description && theme.descriptionFa),
      ).toBe(true);
      expect(collection.some((theme) => theme.id === sport.theme)).toBe(true);
    }
    expect(
      getThemesForSport("gol-ya-pooch").filter((theme) =>
        theme.id.startsWith("gol-"),
      ),
    ).toHaveLength(7);
    expect(
      new Set(getThemesForSport("gol-ya-pooch").map((theme) => theme.motif))
        .size,
    ).toBe(4);
    expect(getThemesForSport("future-activity")).toEqual(
      getThemesForSport("generic"),
    );
  });

  it("preserves original preset IDs and portable theme files", () => {
    expect(new Set(originalIds).size).toBe(27);
    for (const preset of originalIds) {
      expect(getTheme(preset).id).toBe(preset);
      const settings = {
        preset,
        reducedMotion: true,
        radius: 9,
        accent: "#246343",
      };
      const roundtrip = themeFileSchema.parse(
        JSON.parse(JSON.stringify({ version: 1, theme: settings })),
      );
      expect(roundtrip.theme).toEqual(settings);
      expect(
        themeStyle(roundtrip.theme)[
          "--theme-art" as keyof ReturnType<typeof themeStyle>
        ],
      ).toContain("data:image/svg+xml");
    }
    expect(
      themeFileSchema.parse({
        version: 1,
        theme: { preset: "future-theme", reducedMotion: false },
      }).theme.preset,
    ).toBe("future-theme");
  });

  it("uses readable predefined foreground, secondary and accent text", () => {
    for (const theme of themes) {
      for (const ink of [theme.foreground, theme.muted, theme.accent]) {
        for (const surface of [theme.background, theme.card]) {
          expect(
            contrastRatio(ink, surface),
            `${theme.id} ${ink} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(materialBackgrounds[theme.material]).toBeDefined();
      expect(motifGeometry[theme.motif].length).toBeGreaterThan(2);
    }
  });

  it("renders only local decorative geometry without gameplay state or executable markup", () => {
    for (const theme of getThemesForSport("gol-ya-pooch")) {
      const rendered = renderToStaticMarkup(
        createElement(ThemeMotif, { preset: theme.id }),
      );
      expect(rendered).toContain('aria-hidden="true"');
      expect(rendered).toContain(`data-motif="${theme.motif}"`);
      expect(rendered).not.toMatch(
        /script|image|href|foreignObject|secret|conceal|position|hiddenObject/i,
      );
      expect(rendered).not.toContain("<title");
    }
    const unsafe = "<img src=x onerror=alert(1)>";
    const rendered = renderToStaticMarkup(
      createElement(ThemeMotif, { preset: unsafe }),
    );
    expect(rendered).not.toContain("onerror");
    expect(rendered).toContain('data-motif="constellation"');
    const svg = motifSVG("gol-palms", unsafe);
    expect(svg).toContain('stroke="#25634a"');
    expect(svg).not.toContain("onerror");
    expect(svg.slice(svg.indexOf("<g"))).not.toContain("http://");
  });

  it("shows recommended collections and translates their identity", () => {
    const tournament = createTournament("Local cup", []);
    tournament.sport = "gol-ya-pooch";
    tournament.theme.preset = "gol-turquoise";
    const rendered = renderToStaticMarkup(
      createElement(ThemeStudio, { tournament, onChange: () => undefined }),
    );
    expect(rendered).toContain("Turquoise");
    expect(rendered).toContain("Show all 50 themes");
    expect(rendered).not.toContain('aria-label="Football Stadium"');
    const persian = renderToStaticMarkup(
      createElement(GameIdentity, {
        sport: "gol-ya-pooch",
        preset: "gol-turquoise",
        locale: "fa",
      }),
    );
    expect(persian).toContain("گل یا پوچ");
    expect(persian).toContain("فیروزه");
    expect(persian).not.toContain("Gol Ya Pooch");
  });
});
