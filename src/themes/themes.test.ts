import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { applySport, sports } from "../sports";
import { validateTournament } from "../domain/validate";
import { getTheme, themes, themeStyle } from "./index";
import { themeFileSchema } from "./ThemeStudio";

describe("theme presets and sport defaults", () => {
  it("has all 50 unique themes with meaningful geometry, patterns and font choices", () => {
    expect(themes).toHaveLength(50);
    expect(new Set(themes.map((t) => t.id)).size).toBe(themes.length);
    expect(
      new Set(themes.map((t) => `${t.radius}:${t.font}:${t.pattern}`)).size,
    ).toBeGreaterThan(15);
    for (const theme of themes) {
      expect(theme.accent).toMatch(/^#[\da-f]{6}$/i);
      expect(theme.fa.length).toBeGreaterThan(1);
      expect(
        themeStyle({ preset: theme.id, reducedMotion: false }),
      ).toHaveProperty("--theme-font");
    }
    expect(getTheme("unknown")).toBe(themes[0]);
  });
  it("applies all sport presets without changing results or participant identities", () => {
    const source = createTournament(
      "فینال",
      Array.from({ length: 8 }, (_, i) =>
        createParticipant(`Team ${i}`, i + 1),
      ),
    );
    const copy = structuredClone(source);
    for (const sport of sports) {
      const tournament = applySport(source, sport.id);
      expect(tournament.participants.map((p) => p.id)).toEqual(
        source.participants.map((p) => p.id),
      );
      expect(tournament.matches).toEqual(source.matches);
      expect(validateTournament(tournament).sport).toBe(sport.id);
      expect(themes.some((t) => t.id === sport.theme)).toBe(true);
    }
    expect(source).toEqual(copy);
    const gol = applySport(source, "gol-ya-pooch");
    expect(gol.rules.gol.playersPerTeam).toBe(3);
    expect(gol.rules.gol.cards).toEqual([]);
    expect(gol.rules.targetScore).toBe(6);
  });
  it("rejects remote or executable theme content", () => {
    expect(
      themeFileSchema.safeParse({
        version: 1,
        theme: {
          preset: "minimal-light",
          reducedMotion: false,
          backgroundImage: "https://example.com/a.png",
        },
      }).success,
    ).toBe(false);
    expect(
      themeFileSchema.safeParse({
        version: 1,
        theme: {
          preset: "minimal-light",
          reducedMotion: false,
          logo: 'data:image/svg+xml,<svg onload="alert(1)"/>',
        },
      }).success,
    ).toBe(false);
    expect(
      themeFileSchema.safeParse({
        version: 1,
        theme: {
          preset: "minimal-light",
          reducedMotion: false,
          logo: "data:image/png;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+",
        },
      }).success,
    ).toBe(false);
    expect(
      themeFileSchema.safeParse({
        version: 1,
        theme: {
          preset: "minimal-light",
          reducedMotion: false,
          accent: "url(https://example.com)",
        },
      }).success,
    ).toBe(false);
    expect(
      themeFileSchema.safeParse({
        version: 1,
        theme: {
          preset: "gol-night",
          reducedMotion: true,
          accent: "#ac9830",
          radius: 16,
        },
      }).success,
    ).toBe(true);
  });
});
