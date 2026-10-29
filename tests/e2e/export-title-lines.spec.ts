import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";

const title =
  "Cup جام\nSeries رقابت\nFinals پایان\nCommunity دوستانه\nTeams تیم‌ها\nChampionship قهرمانی\nTournament مسابقات\nSun آفتاب";
const normalizedTitle = title.replace(/\s+/gu, " ").trim();
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=";

async function openExports(page: Page) {
  let tournament = createTournament(
    title,
    [
      createParticipant("شاهین Sun team", 1),
      createParticipant("Moon آفتاب", 2),
    ],
    "single-elimination",
    "gol-ya-pooch",
  );
  tournament.theme.logo = logo;
  tournament = simulate(generateStage(tournament, tournament.stages[0].id));
  tournament.presentation.scenes = [
    {
      id: "title",
      type: "title",
      title: "Opening آغاز",
      text: "Welcome خوش آمدید",
      duration: 10,
    },
    {
      id: "participants",
      type: "participants",
      title: "Teams تیم‌ها",
      text: "",
      duration: 10,
    },
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "multiline-title.json",
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

async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!);
}

for (const locale of ["en", "fa"] as const)
  test(`keeps multiline ${locale} export titles separate from artwork and body text`, async ({
    page,
  }, testInfo) => {
    await openExports(page);
    if (locale === "fa")
      await page
        .getByRole("button", { name: "Switch to Persian", exact: true })
        .click();
    const graphics: { name: string; svg: string }[] = [];
    for (const kind of ["scoreboard", "champion"]) {
      await page
        .getByRole("combobox", {
          name: locale === "fa" ? "نوع تصویر" : "Graphic",
          exact: true,
        })
        .selectOption(kind);
      graphics.push({
        name: kind,
        svg: (
          await download(page, locale === "fa" ? "دانلود SVG" : "Download SVG")
        ).toString("utf8"),
      });
    }
    const archive = unzipSync(
      await download(
        page,
        locale === "fa" ? "دانلود ZIP نمایش" : "Download slide ZIP",
      ),
    );
    for (const [name, bytes] of Object.entries(archive))
      if (name.endsWith(".svg")) graphics.push({ name, svg: strFromU8(bytes) });
    const viewer = await page.context().newPage();
    try {
      for (const graphic of graphics) {
        const path = testInfo.outputPath(`${graphic.name}.html`);
        await writeFile(
          path,
          `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${graphic.svg}</body></html>`,
        );
        await viewer.goto(pathToFileURL(path).href, { timeout: 10000 });
        await viewer.evaluate(async () => {
          await document.fonts.load("28px TournaExportArabic", "فارسی");
          await document.fonts.load("28px TournaExportLatin", "Championship");
          await document.fonts.ready;
        });
        const geometry = await viewer.evaluate((expectedTitle) => {
          const root = document.querySelector("svg")!;
          const outer = Array.from(root.children).find(
            (child) => child.tagName.toLowerCase() === "g",
          )!;
          const header: Element[] = [];
          let joined = "";
          for (const child of outer.children) {
            if (child.hasAttribute("data-export-masthead")) {
              header.push(...child.querySelectorAll("text"));
              joined = child.textContent ?? "";
              break;
            }
            if (child.tagName.toLowerCase() !== "text") break;
            header.push(child);
            joined += ` ${child.textContent ?? ""}`;
            if (joined.replace(/\s+/gu, " ").trim() === expectedTitle) break;
          }
          const bounds = (element: Element) => {
            const box = element.getBoundingClientRect();
            return {
              left: box.left,
              top: box.top,
              right: box.right,
              bottom: box.bottom,
            };
          };
          const headerBoxes = header.map(bounds);
          const obstacles = Array.from(
            root.querySelectorAll(
              "text, [data-game-art], [data-game-emblem], image",
            ),
          )
            .filter((element) => !header.includes(element))
            .map((element) => ({
              ...bounds(element),
              label: element.textContent || element.tagName,
            }));
          return {
            headerText: joined.replace(/\s+/gu, " ").trim(),
            headerBoxes,
            intersections: obstacles.filter((obstacle) =>
              headerBoxes.some(
                (box) =>
                  Math.min(box.right, obstacle.right) >
                    Math.max(box.left, obstacle.left) + 0.5 &&
                  Math.min(box.bottom, obstacle.bottom) >
                    Math.max(box.top, obstacle.top) + 0.5,
              ),
            ),
            canvas: bounds(root),
          };
        }, normalizedTitle);
        expect(geometry.headerText, graphic.name).toBe(normalizedTitle);
        expect(geometry.headerBoxes, graphic.name).toHaveLength(1);
        expect
          .soft(
            geometry.intersections,
            `${graphic.name}: masthead must avoid body text and artwork`,
          )
          .toEqual([]);
        for (const box of geometry.headerBoxes) {
          expect(box.left).toBeGreaterThanOrEqual(geometry.canvas.left + 100);
          expect(box.right).toBeLessThanOrEqual(geometry.canvas.right - 100);
          expect(box.top).toBeGreaterThanOrEqual(geometry.canvas.top + 12);
        }
        await viewer.screenshot({
          path: testInfo.outputPath(`${graphic.name}.png`),
          fullPage: true,
          timeout: 10000,
        });
      }
    } finally {
      await viewer.close();
    }
  });
