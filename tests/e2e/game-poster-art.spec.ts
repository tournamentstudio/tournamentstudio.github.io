import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";
import { gameSceneSVG } from "../../src/export/game-art";
import { sports } from "../../src/sports";

async function openExports(page: Page, sport: string) {
  let tournament = createTournament(
    "جام دست‌ها Hands cup",
    [
      createParticipant("شاهین‌های آفتاب Sunshine champions", 1),
      createParticipant("هما Phoenix team", 2),
    ],
    "single-elimination",
    sport,
  );
  tournament.theme.preset = "minimal-light";
  tournament.subtitle = "قهرمانان رقابت دوستانه Community championship";
  tournament = simulate(generateStage(tournament, tournament.stages[0].id));
  tournament.matches[0].private = { concealedPosition: "PRIVATE-POSTER-HAND" };
  tournament.matches[0].notes = "PRIVATE-POSTER-NOTES";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "game-poster.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tournament)),
  });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Export Studio", exact: true })
    .click();
}

async function download(page: Page, label: string) {
  const next = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const file = await next;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!);
}

test("exports game-specific Gol artwork with readable Persian and no private state", async ({
  page,
  browserName,
}) => {
  await openExports(page, "gol-ya-pooch");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  const scoreboard = (await download(page, "دانلود SVG")).toString("utf8");
  expect(scoreboard.match(/data-game-emblem="gol-ya-pooch"/g)).toHaveLength(2);
  expect(scoreboard).toContain('data-game-art="gol-ya-pooch"');
  await page
    .getByRole("combobox", { name: "نوع تصویر", exact: true })
    .selectOption("champion");
  const champion = (await download(page, "دانلود SVG")).toString("utf8");
  expect(champion).toContain('data-game-art="gol-ya-pooch"');
  expect(champion).toContain("قهرمان");
  const png = await download(page, "دانلود PNG");
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.readUInt32BE(16)).toBe(2400);
  const viewer = await page.context().newPage();
  try {
    for (const [name, svg] of [
      ["scoreboard", scoreboard],
      ["champion", champion],
    ]) {
      expect(svg).not.toContain("PRIVATE-POSTER-HAND");
      expect(svg).not.toContain("PRIVATE-POSTER-NOTES");
      expect(svg).toContain("data:font/woff2;base64,");
      await viewer.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`,
      );
      await viewer.evaluate(async () => {
        await document.fonts.load("80px TournaExportArabic", "قهرمان");
        await document.fonts.load("80px TournaExportLatin", "champions");
        await document.fonts.ready;
      });
      const layout = await viewer.evaluate(() => {
        const svg = document.querySelector("svg")!;
        return {
          width: svg.viewBox.baseVal.width,
          height: svg.viewBox.baseVal.height,
          text: Array.from(svg.querySelectorAll("text"), (element) => {
            const box = element.getBBox();
            return {
              value: element.textContent,
              left: box.x,
              right: box.x + box.width,
              top: box.y,
              bottom: box.y + box.height,
            };
          }),
          names: Array.from(
            svg.querySelectorAll<SVGGElement>(
              '[data-text-region="scoreboard-name"]',
            ),
            (element) => {
              const box = element.getBBox();
              return { left: box.x, right: box.x + box.width };
            },
          ),
        };
      });
      for (const box of layout.text) {
        expect(box.left, `${name}: ${box.value}`).toBeGreaterThanOrEqual(0);
        expect(box.right, `${name}: ${box.value}`).toBeLessThanOrEqual(
          layout.width,
        );
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(layout.height);
      }
      for (const box of layout.names) {
        expect(box.left).toBeGreaterThan(220);
        expect(box.right).toBeLessThan(1260);
      }
      if (browserName === "chromium") {
        await mkdir(".local", { recursive: true });
        await viewer.setViewportSize({
          width: layout.width,
          height: layout.height,
        });
        await viewer.screenshot({
          path: `.local/gol-${name}-art.png`,
          fullPage: true,
          timeout: 10000,
        });
      }
    }
  } finally {
    await viewer.close();
  }
});

test("renders distinct local compositions for all activity presets", async ({
  page,
  browserName,
}) => {
  const art = sports
    .map(
      (sport) =>
        `<article><h2>${sport.name}</h2><svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">${gameSceneSVG(sport.id, { accent: "#25634a", card: "#ffffff" }, 0, 0, 640)}</svg></article>`,
    )
    .join("");
  await page.setContent(
    `<!doctype html><html><head><style>body{font-family:system-ui;margin:24px;background:#eef3ee;display:grid;grid-template-columns:repeat(4,1fr);gap:18px}article{background:white;border-radius:14px;padding:12px}h2{font-size:17px;margin:0 0 10px}svg{display:block;width:100%}</style></head><body>${art}</body></html>`,
  );
  await expect(page.locator("[data-game-art]")).toHaveCount(sports.length);
  expect(
    await page
      .locator("svg")
      .evaluateAll((elements) =>
        elements.every((element) => element.getBoundingClientRect().height > 0),
      ),
  ).toBe(true);
  if (browserName === "chromium") {
    await mkdir(".local", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.screenshot({
      path: ".local/game-poster-art-gallery.png",
      fullPage: true,
    });
  }
});
