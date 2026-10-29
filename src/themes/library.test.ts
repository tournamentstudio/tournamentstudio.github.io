import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../persistence";
import { createTournament } from "../domain/types";
import { themeDesignSchema } from "../domain/display-options";
import {
  deletePersonalTheme,
  loadPersonalThemes,
  parsePortableTheme,
  renamePersonalTheme,
  savePersonalTheme,
  serializePortableTheme,
} from "./library";

beforeEach(async () => {
  await db.preferences.clear();
});

describe("personal theme library", () => {
  it("persists theme-only copies without tournament results or default asset copies", async () => {
    const t = createTournament("Private title", [], "single-elimination");
    t.theme.logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=";
    const before = JSON.stringify(t);
    await savePersonalTheme("Persian courtyard", {
      ...t.theme,
      design: {
        fontWeight: 650,
        gradient: { from: "#102030", to: "#304050", angle: 45 },
      },
    });
    const saved = await loadPersonalThemes();
    expect(saved).toHaveLength(1);
    expect(saved[0].theme.design?.fontWeight).toBe(650);
    expect(saved[0].theme.logo).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain("Private title");
    expect(JSON.stringify(t)).toBe(before);
  });
  it("preserves explicitly selected local assets and supports rename, duplicate and delete", async () => {
    const logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=";
    const first = await savePersonalTheme(
      "A",
      { preset: "minimal-light", reducedMotion: false, logo },
      true,
    );
    await renamePersonalTheme(first.id, "B");
    const second = await savePersonalTheme("C", first.theme, true);
    expect(second.id).not.toBe(first.id);
    expect(
      (await loadPersonalThemes()).find((theme) => theme.id === first.id)?.name,
    ).toBe("B");
    expect(second.theme.logo).toBe(logo);
    await deletePersonalTheme(first.id);
    expect(await loadPersonalThemes()).toHaveLength(1);
  });
  it("serializes concurrent library writes in one IndexedDB transaction", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        savePersonalTheme(`Theme ${i}`, {
          preset: "minimal-light",
          reducedMotion: false,
        }),
      ),
    );
    expect(await loadPersonalThemes()).toHaveLength(8);
  });
  it("enforces count and validation limits before replacing stored data", async () => {
    for (let i = 0; i < 50; i++)
      await savePersonalTheme(`Theme ${i}`, {
        preset: "minimal-light",
        reducedMotion: false,
      });
    await expect(
      savePersonalTheme("Overflow", {
        preset: "minimal-light",
        reducedMotion: false,
      }),
    ).rejects.toThrow("limited to 50");
    await expect(
      savePersonalTheme("", { preset: "minimal-light", reducedMotion: false }),
    ).rejects.toThrow();
    expect(await loadPersonalThemes()).toHaveLength(50);
  });
  it("roundtrips versioned designs and accepts legacy themes", () => {
    const theme = {
      preset: "minimal-dark",
      reducedMotion: true,
      design: {
        bracketLayout: "centered" as const,
        cardStyle: "glass" as const,
        animationSeconds: 0.4,
      },
    };
    expect(parsePortableTheme(serializePortableTheme(theme))).toEqual(theme);
    expect(
      parsePortableTheme(
        '{"version":1,"theme":{"preset":"minimal-light","reducedMotion":false}}',
      ).preset,
    ).toBe("minimal-light");
    expect(() => parsePortableTheme('{"version":3,"theme":{}}')).toThrow();
  });
  it("rejects executable style inputs, unknown keys and invalid ranges", () => {
    expect(
      themeDesignSchema.safeParse({
        gradient: {
          from: "url(https://example.com)",
          to: "#ffffff",
          angle: 45,
        },
      }).success,
    ).toBe(false);
    expect(themeDesignSchema.safeParse({ html: "<script>" }).success).toBe(
      false,
    );
    expect(
      themeDesignSchema.safeParse({ animationSeconds: Infinity }).success,
    ).toBe(false);
    expect(themeDesignSchema.safeParse({ fontWeight: 10000 }).success).toBe(
      false,
    );
    expect(() =>
      parsePortableTheme(
        '{"version":1,"theme":{"preset":"minimal-light","reducedMotion":false,"logo":"https://example.com/image.png"}}',
      ),
    ).toThrow();
  });
});
