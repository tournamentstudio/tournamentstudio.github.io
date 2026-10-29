import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

function fixture() {
  const t = createTournament(`${"W".repeat(180)} جام آفتاب Championship`, [
    createParticipant("شاهین Sun", 1),
    createParticipant("Moon آفتاب", 2),
  ]);
  t.presentation.scenes = [
    {
      id: "sponsors",
      type: "sponsors",
      title: "حامیان Partners",
      text: "",
      duration: 10,
    },
  ];
  t.presentation.sponsorCards = Array.from({ length: 8 }, (_, index) => ({
    id: `sponsor-${index}`,
    name:
      index % 2 === 0
        ? `${"W".repeat(80)} حامی آفتاب Partners ${index}`
        : `${"شرکت آفتاب Sun ".repeat(6)}${index}`,
    tier: index === 0 ? "main" : "partner",
    logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=",
  }));
  const generated = generateStage(t, t.stages[0].id);
  generated.matches[0].private = {
    concealedPosition: "REFEREE-ONLY-LAYOUT-TEST",
  };
  return generated;
}

async function openTournament(page: Page, tournament: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "layout.json",
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
}

async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!);
}

async function loadSVG(viewer: Page, svg: string, path: string) {
  expect(svg).not.toContain("REFEREE-ONLY-LAYOUT-TEST");
  await writeFile(path, svg);
  await viewer.goto(pathToFileURL(path).href);
  await viewer.evaluate(async () => {
    await document.fonts.load("28px TournaExportArabic", "فارسی");
    await document.fonts.load("28px TournaExportLatin", "Partners");
    await document.fonts.ready;
  });
}

test("keeps long bilingual sponsor names and logos inside each exported card", async ({
  page,
}, testInfo) => {
  const tournament = fixture();
  await openTournament(page, tournament);
  const viewer = await page.context().newPage();
  try {
    for (const layout of ["grid", "strip", "spotlight"]) {
      await page
        .getByRole("navigation", { name: "Tournament sections" })
        .getByRole("button", { name: "Presentation", exact: true })
        .click();
      await page
        .getByLabel("Sponsor layout", { exact: true })
        .selectOption(layout);
      await page
        .getByRole("button", { name: "Save sponsor cards", exact: true })
        .click();
      await expect(page.locator(".save-status")).toHaveText("Saved locally");
      await page
        .getByRole("navigation", { name: "Tournament sections" })
        .getByRole("button", { name: "Export Studio", exact: true })
        .click();
      const files = unzipSync(await download(page, "Download slide ZIP"));
      const svg = strFromU8(files["slide-001.svg"]);
      await loadSVG(viewer, svg, testInfo.outputPath(`${layout}.svg`));
      const geometry = await viewer.evaluate(() => {
        const root = document.querySelector("svg")!;
        const bounds = (element: SVGGraphicsElement) => {
          const box = element.getBBox();
          return {
            left: box.x,
            top: box.y,
            right: box.x + box.width,
            bottom: box.y + box.height,
          };
        };
        return {
          width: root.viewBox.baseVal.width,
          height: root.viewBox.baseVal.height,
          cards: Array.from(
            root.querySelectorAll<SVGGElement>("[data-sponsor-card]"),
            (card) => ({
              card: bounds(card.querySelector("rect")!),
              text: bounds(
                card.querySelector<SVGGElement>("[data-text-region]")!,
              ),
              logo: bounds(card.querySelector("image")!),
              name: Array.from(
                card.querySelectorAll("text"),
                (text) => text.textContent,
              ).join(""),
            }),
          ),
          footer: bounds(
            Array.from(root.querySelectorAll("text")).find(
              (text) => text.textContent === "TournaStudio",
            )!,
          ),
        };
      });
      expect(geometry.cards).toHaveLength(8);
      for (const [index, card] of geometry.cards.entries()) {
        expect(card.name.replace(/\s/g, "")).toBe(
          tournament.presentation.sponsorCards![index].name.replace(/\s/g, ""),
        );
        for (const content of [card.text, card.logo]) {
          expect(content.left).toBeGreaterThanOrEqual(card.card.left);
          expect(content.right).toBeLessThanOrEqual(card.card.right);
          expect(content.top).toBeGreaterThanOrEqual(card.card.top);
          expect(content.bottom).toBeLessThanOrEqual(card.card.bottom);
        }
        expect(
          card.text.left >= card.logo.right ||
            card.text.top >= card.logo.bottom,
        ).toBe(true);
        expect(card.card.bottom).toBeLessThan(geometry.footer.top);
        const nextRow = geometry.cards
          .slice(index + 1)
          .find((other) => other.card.left === card.card.left);
        if (nextRow) expect(card.card.bottom).toBeLessThan(nextRow.card.top);
      }
      await viewer.goto("about:blank", { timeout: 10000 });
      await viewer.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`,
        { timeout: 10000 },
      );
      await viewer.screenshot({
        path: testInfo.outputPath(`${layout}.png`),
        fullPage: true,
        timeout: 10000,
      });
    }
  } finally {
    await viewer.close();
  }
});

test("keeps a wrapped compact overlay title clear of entrants in both languages", async ({
  page,
}, testInfo) => {
  const tournament = fixture();
  await openTournament(page, tournament);
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Presentation", exact: true })
    .click();
  await page
    .getByLabel("Overlay layout", { exact: true })
    .selectOption("compact");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const viewer = await page.context().newPage();
  try {
    for (const locale of ["en", "fa"]) {
      if (locale === "fa")
        await page
          .getByRole("button", { name: "Switch to Persian", exact: true })
          .click();
      const svg = (
        await download(
          page,
          locale === "fa" ? "دانلود SVG لایه پخش" : "Download overlay SVG",
        )
      ).toString("utf8");
      await loadSVG(viewer, svg, testInfo.outputPath(`overlay-${locale}.svg`));
      const geometry = await viewer.evaluate(() => {
        const title = document.querySelector<SVGGElement>(
          "[data-overlay-title]",
        )!;
        const bounds = (element: SVGGraphicsElement) => {
          const box = element.getBBox();
          return {
            left: box.x,
            top: box.y,
            right: box.x + box.width,
            bottom: box.y + box.height,
          };
        };
        return {
          card: bounds(title.querySelector("rect")!),
          lines: Array.from(title.querySelectorAll("text"), (text) => ({
            ...bounds(text),
            value: text.textContent,
          })),
          firstEntrant: bounds(title.nextElementSibling as SVGGraphicsElement),
        };
      });
      expect(geometry.lines.length).toBeGreaterThan(2);
      expect(
        geometry.lines
          .map((line) => line.value)
          .join("")
          .replace(/\s/g, ""),
      ).toBe(tournament.title.replace(/\s/g, ""));
      for (const line of geometry.lines) {
        expect(line.left).toBeGreaterThanOrEqual(geometry.card.left);
        expect(line.right).toBeLessThanOrEqual(geometry.card.right);
        expect(line.top).toBeGreaterThanOrEqual(geometry.card.top);
        expect(line.bottom).toBeLessThanOrEqual(geometry.card.bottom);
      }
      expect(geometry.card.bottom).toBeLessThan(geometry.firstEntrant.top);
    }
  } finally {
    await viewer.close();
  }
});
