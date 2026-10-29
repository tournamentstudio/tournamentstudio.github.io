import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";

function fixture(complete = false) {
  let t = createTournament(
    "جام آفتاب & Sun cup",
    Array.from({ length: 13 }, (_, i) =>
      createParticipant(`شاهین ${i + 1} Team`, i + 1),
    ),
    "single-elimination",
  );
  t = generateStage(t, t.stages[0].id);
  if (complete) t = simulate(t);
  t.matches.find(
    (m) => m.status === "ready" || m.status === "completed",
  )!.private = { concealedPosition: "REFEREE-ONLY-HAND" };
  t.metadata.organizerNote = "ORGANIZER-ONLY-NOTE";
  t.presentation.scenes = [
    {
      id: "title",
      type: "title",
      title: "Opening",
      text: "The cup begins",
      duration: 10,
    },
    {
      id: "entrants",
      type: "participants",
      title: "Teams",
      text: "",
      duration: 10,
    },
    {
      id: "scoreboard",
      type: "current",
      title: "Scores",
      text: "",
      duration: 10,
    },
  ];
  return t;
}

async function openExports(page: Page, t: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "exports.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(t)),
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
  await expect(
    page.getByRole("heading", { name: "Graphics and slide files" }),
  ).toBeVisible();
}

async function download(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return {
    filename: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  };
}

test("downloads actual scoreboard PNG and safe SVG with embedded fonts", async ({
  page,
  browserName,
}) => {
  await openExports(page, fixture());
  const svg = await download(page, "Download SVG");
  expect(svg.filename).toMatch(/scoreboard\.svg$/);
  const text = svg.bytes.toString("utf8");
  expect(text).toContain("data:font/woff2;base64,");
  expect(text).toContain("شاهین");
  expect(text).not.toContain("REFEREE-ONLY-HAND");
  expect(text).not.toContain("ORGANIZER-ONLY-NOTE");
  const png = await download(page, "Download PNG");
  expect(png.bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.bytes.readUInt32BE(16)).toBe(3200);
  expect(png.bytes.readUInt32BE(20)).toBe(1800);
  const textPixels = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(400, 360, 2400, 420).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++;
    return dark;
  }, png.bytes.toString("base64"));
  expect(
    textPixels,
    "The downloaded PNG must contain visible entrant and score text",
  ).toBeGreaterThan(1000);
  await expect(
    page.getByRole("img", { name: "Graphic export preview" }),
  ).toBeVisible();
  await expect(page.locator(".export-studio-preview img")).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  if (browserName === "chromium") {
    await writeFile(".local/export-scoreboard.png", png.bytes);
    await page.screenshot({
      path: ".local/export-studio-desktop.png",
      fullPage: true,
    });
  }
});

test("exports decided champion and blocks a premature champion poster", async ({
  page,
}) => {
  await openExports(page, fixture());
  await page
    .getByRole("combobox", { name: "Graphic", exact: true })
    .selectOption("champion");
  await expect(
    page.getByText(
      "Complete the deciding stage and resolve first-place ties before exporting a champion poster.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download SVG", exact: true }),
  ).toBeDisabled();
  await openExports(page, fixture(true));
  await page
    .getByRole("combobox", { name: "Graphic", exact: true })
    .selectOption("champion");
  const poster = await download(page, "Download SVG");
  expect(poster.bytes.toString("utf8")).toContain("CHAMPION");
  await expect(page.locator(".export-studio-preview img")).toHaveJSProperty(
    "naturalWidth",
    1200,
  );
});

test("exports selected slides and standalone HTML with no private state", async ({
  page,
}, testInfo) => {
  await openExports(page, fixture());
  await page
    .getByRole("checkbox", { name: "1. Opening", exact: true })
    .uncheck();
  const downloaded = await download(page, "Download slide ZIP");
  const files = unzipSync(downloaded.bytes);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.slides).toHaveLength(3);
  expect(
    manifest.slides.map((slide: { sceneId: string }) => slide.sceneId),
  ).toEqual(["entrants", "entrants", "scoreboard"]);
  for (const content of Object.values(files)) {
    expect(strFromU8(content)).not.toContain("REFEREE-ONLY-HAND");
    expect(strFromU8(content)).not.toContain("ORGANIZER-ONLY-NOTE");
  }
  expect(strFromU8(files["index.html"])).toContain("slide-003.svg");
  const directory = testInfo.outputPath("slide-files");
  await mkdir(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(directory, name), bytes);
  const viewer = await page.context().newPage();
  await viewer.goto(pathToFileURL(join(directory, "index.html")).href);
  await expect(viewer.locator("section img").first()).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  await viewer
    .getByRole("navigation", { name: "Slide list" })
    .getByRole("link")
    .nth(2)
    .click();
  await expect(viewer).toHaveURL(/#slide-3$/);
  await viewer.close();
  const html = await download(page, "Download print HTML");
  expect(html.bytes.toString("utf8")).toContain("data:font/woff2;base64,");
  expect(html.bytes.toString("utf8")).not.toContain("REFEREE-ONLY-HAND");
  const printed = await page.context().newPage();
  await printed.setContent(html.bytes.toString("utf8"));
  await expect(
    printed.getByRole("heading", { name: "جام آفتاب & Sun cup", exact: true }),
  ).toBeVisible();
  await expect(printed.locator("svg")).toHaveCount(1);
  await printed.close();
});

test("keeps long bilingual introduction and champion text inside downloaded slides", async ({
  page,
  browserName,
}, testInfo) => {
  const tournament = fixture(true);
  const winnerId = tournament.matches.find(
    (match) => match.metadata.championship,
  )!.result!.winnerIds[0];
  const participant = tournament.participants.find(
    (entrant) => entrant.id === winnerId,
  )!;
  participant.name =
    `${"W".repeat(28)} ${"باشگاه آفتاب Sun Falcons ".repeat(5)}`.trim();
  participant.organization =
    `${"W".repeat(65)} ${"دانشگاه نور University ".repeat(3)}`.trim();
  const lines = Array.from(
    { length: 12 },
    (_, index) =>
      `Line-${String(index).padStart(2, "0")} معرفی رقابت Tournament introduction`,
  );
  tournament.subtitle = Array.from(
    { length: 6 },
    (_, index) => `Subtitle-${index} رقابت Championship`,
  ).join("\n");
  tournament.presentation.scenes = [
    {
      id: "long-introduction",
      type: "introduction",
      title:
        `${"W".repeat(70)} ${"معرفی قهرمانان Championship ".repeat(3)}`.trim(),
      text: lines.join("\n"),
      participantIds: [participant.id],
      duration: 15,
    },
    {
      id: "champion",
      type: "champion",
      title: "قهرمان Champion",
      text: "",
      duration: 15,
    },
  ];
  await openExports(page, tournament);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  const downloaded = await download(page, "دانلود ZIP نمایش");
  const files = unzipSync(downloaded.bytes);
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as {
    slides: { file: string; sceneId: string }[];
  };
  const introductions = manifest.slides.filter(
    (slide) => slide.sceneId === "long-introduction",
  );
  expect(introductions.length).toBeGreaterThan(1);
  const introductionSVGs = introductions
    .map((slide) => strFromU8(files[slide.file]))
    .join("");
  for (const line of lines)
    expect(introductionSVGs.split(line)).toHaveLength(2);
  for (const content of Object.values(files)) {
    expect(strFromU8(content)).not.toContain("REFEREE-ONLY-HAND");
    expect(strFromU8(content)).not.toContain("ORGANIZER-ONLY-NOTE");
  }
  const directory = testInfo.outputPath("bilingual-slides");
  await mkdir(directory, { recursive: true });
  const viewer = await page.context().newPage();
  await viewer.setViewportSize({ width: 1600, height: 900 });
  try {
    for (const slide of manifest.slides) {
      const svg = strFromU8(files[slide.file]);
      expect(svg).toContain("data:font/woff2;base64,");
      await writeFile(join(directory, slide.file), files[slide.file]);
      await viewer.goto(pathToFileURL(join(directory, slide.file)).href);
      await viewer.evaluate(async () => {
        await document.fonts.load("72px TournaExportArabic", "فارسی");
        await document.fonts.load("72px TournaExportLatin", "Championship");
        await document.fonts.ready;
      });
      const geometry = await viewer.evaluate(() => {
        const svg = document.querySelector("svg")!;
        const bounds = (element: SVGGraphicsElement) => {
          const box = element.getBBox();
          return {
            left: box.x,
            top: box.y,
            right: box.x + box.width,
            bottom: box.y + box.height,
          };
        };
        const regions = Array.from(
          svg.querySelectorAll<SVGGraphicsElement>("[data-text-region]"),
          (region) => ({
            name: region.getAttribute("data-text-region"),
            ...bounds(region),
          }),
        );
        const footer = Array.from(svg.querySelectorAll("text")).find(
          (text) => text.textContent === "TournaStudio",
        )!;
        return {
          width: svg.viewBox.baseVal.width,
          height: svg.viewBox.baseVal.height,
          regions,
          text: Array.from(svg.querySelectorAll("text"), bounds),
          footer: bounds(footer),
          fontsLoaded:
            document.fonts.check("72px TournaExportArabic", "فارسی") &&
            document.fonts.check("72px TournaExportLatin", "Championship"),
        };
      });
      expect(geometry.fontsLoaded).toBe(true);
      for (const block of geometry.text) {
        expect(block.left).toBeGreaterThanOrEqual(0);
        expect(block.right).toBeLessThanOrEqual(geometry.width);
        expect(block.top).toBeGreaterThanOrEqual(0);
        expect(block.bottom).toBeLessThanOrEqual(geometry.height);
      }
      for (let index = 1; index < geometry.regions.length; index++)
        expect(geometry.regions[index - 1].bottom).toBeLessThan(
          geometry.regions[index].top,
        );
      if (geometry.regions.length)
        expect(geometry.regions.at(-1)!.bottom).toBeLessThan(
          geometry.footer.top,
        );
      if (slide.file === introductions[0].file) {
        expect(geometry.regions.map((region) => region.name)).toEqual([
          "introduction-title",
          "introduction-name",
          "introduction-organization",
          "introduction-description",
        ]);
        if (browserName === "chromium") {
          await mkdir(".local", { recursive: true });
          await viewer.goto("about:blank", { timeout: 10000 });
          await viewer.setContent(
            `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`,
            { timeout: 10000 },
          );
          await viewer.screenshot({
            path: ".local/introduction-export.png",
            fullPage: true,
            timeout: 10000,
          });
        }
      }
      if (slide.sceneId === "champion")
        expect(geometry.regions.map((region) => region.name)).toEqual([
          "champion-name",
          "champion-subtitle",
        ]);
    }
  } finally {
    await viewer.close();
  }
});

test("keeps Persian export controls readable at 320px with accessible labels", async ({
  page,
  browserName,
}) => {
  await openExports(page, fixture());
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(
    page.getByRole("heading", { name: "تصاویر و فایل‌های نمایش" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const report = await new AxeBuilder({ page })
    .include(".export-studio")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
  await page
    .getByRole("combobox", { name: "نوع تصویر", exact: true })
    .selectOption("standings");
  await expect(
    page.getByRole("combobox", { name: "صفحه تصویر", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "صفحه تصویر", exact: true })
    .selectOption("1");
  const svg = await download(page, "دانلود SVG");
  expect(svg.bytes.toString("utf8")).toContain('direction="rtl"');
  if (browserName === "chromium")
    await page.screenshot({
      path: ".local/export-studio-mobile.png",
      fullPage: true,
    });
});
