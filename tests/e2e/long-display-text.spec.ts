import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Locale,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult, simulate } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const names = [
  `${"Sunshine".repeat(16)} باشگاه تهران`,
  `${"قهرمانان".repeat(17)} Northern team`,
  "University of Tehran Championship باشگاه دانشگاه تهران",
  "یاران آفتاب دانشگاه صنعتی امیرکبیر Southern Academy",
];
const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function openTournament(page: Page, doc: Tournament, locale: Locale) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", {
      name: text(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(page.locator(".save-status")).toHaveText(
    text(locale, "Saved locally", "محلی ذخیره شد"),
  );
}

async function section(page: Page, locale: Locale, en: string, fa: string) {
  await page
    .getByRole("navigation", {
      name: text(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", { name: text(locale, en, fa), exact: true })
    .click();
}

async function containedText(element: Locator) {
  return element.evaluate((container) => {
    const outer = container.getBoundingClientRect();
    const errors: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const box of range.getClientRects())
        if (
          box.left < outer.left - 1 ||
          box.right > outer.right + 1 ||
          box.top < outer.top - 1 ||
          box.bottom > outer.bottom + 1
        )
          errors.push(walker.currentNode.textContent!.trim().slice(0, 45));
    }
    return errors;
  });
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} theme preview retains long titles beside its artwork`, async ({
    page,
  }, testInfo) => {
    const title =
      locale === "en"
        ? `${"Championship".repeat(12)} جام آفتاب`
        : `${"قهرمانی".repeat(20)} University cup`;
    const doc = createTournament(
      title,
      names.map((name, index) => createParticipant(name, index + 1)),
      "single-elimination",
      "gol-ya-pooch",
    );
    doc.theme.preset = "gol-traditional";
    await openTournament(page, doc, locale);
    await section(page, locale, "Theme Studio", "استودیو تم");
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const preview = page.locator(".theme-preview");
      await expect(preview.locator("h3")).toHaveText(title);
      expect.soft(await containedText(preview.locator("h3"))).toEqual([]);
      expect
        .soft(
          await preview.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      await preview.screenshot({
        path: testInfo.outputPath(`theme-title-${locale}-${width}.png`),
      });
    }
  });

  for (const tied of [false, true])
    test(`${locale} podium keeps ${tied ? "tied" : "ranked"} long names inside their places`, async ({
      page,
    }, testInfo) => {
      let doc = createTournament(
        "Championship جام قهرمانی",
        names.map((name, index) => createParticipant(name, index + 1)),
        tied ? "round-robin" : "single-elimination",
        "gol-ya-pooch",
      );
      doc.theme.preset = "gol-traditional";
      doc.stages[0].config.thirdPlace = !tied;
      doc.rules.allowDraws = tied;
      doc.rules.tieBreakers = ["points"];
      doc = generateStage(doc, doc.stages[0].id);
      if (tied)
        for (const match of doc.matches)
          doc = recordResult(doc, match.id, {
            scores: [0, 0],
            winnerIds: [],
            outcome: "draw",
            recordedAt: doc.updatedAt,
          });
      else doc = simulate(doc);
      doc.presentation.autoRotate = false;
      doc.presentation.scenes = [
        { id: "podium", type: "podium", title: "", text: "", duration: 15 },
      ];
      await openTournament(page, doc, locale);
      await section(page, locale, "Presentation", "نمایش");
      await page
        .getByRole("button", {
          name: text(locale, "Preview presentation", "پیش‌نمایش"),
          exact: true,
        })
        .click();
      const podium = page.locator(".presentation-podium");
      const places = podium.locator(":scope > div");
      await expect(places).toHaveCount(tied ? 4 : 3);
      if (tied)
        await expect(places.locator("strong")).toHaveText(
          names.map(() => `${(1).toLocaleString(locale)}*`),
        );
      const visibleNames = await places.locator("h2").allTextContents();
      expect(visibleNames.every((name) => names.includes(name))).toBe(true);
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        for (const card of await places.all())
          expect.soft(await containedText(card)).toEqual([]);
        const collisions = await podium.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const boxes = Array.from(element.children, (child) =>
            child.getBoundingClientRect(),
          );
          const errors: string[] = [];
          for (const [index, box] of boxes.entries()) {
            if (box.left < bounds.left - 1 || box.right > bounds.right + 1)
              errors.push(`Place ${index} extends beyond the podium`);
            for (const next of boxes.slice(index + 1))
              if (
                box.left < next.right - 1 &&
                box.right > next.left + 1 &&
                box.top < next.bottom - 1 &&
                box.bottom > next.top + 1
              )
                errors.push(`Place ${index} overlaps another place`);
          }
          return errors;
        });
        expect.soft(collisions).toEqual([]);
        for (const selector of [".presentation-shell", ".presentation-content"])
          expect
            .soft(
              await page
                .locator(selector)
                .evaluate(
                  (element) => element.scrollWidth - element.clientWidth,
                ),
              selector,
            )
            .toBeLessThanOrEqual(1);
        const toolbarOverlap = await page
          .locator(".presentation-shell")
          .evaluate((element) => {
            const content = element.querySelector(".presentation-content")!;
            content.scrollTop = content.scrollHeight;
            const controls = element
              .querySelector(".presentation-controls")!
              .getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(
              element.querySelector(
                ".presentation-podium > div:last-child h2",
              )!,
            );
            return Array.from(range.getClientRects()).some(
              (box) =>
                box.left < controls.right &&
                box.right > controls.left &&
                box.top < controls.bottom &&
                box.bottom > controls.top,
            );
          });
        expect
          .soft(toolbarOverlap, "The controls must not cover the last name")
          .toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(
            `podium-${locale}-${tied ? "tied" : "ranked"}-${width}.png`,
          ),
        });
      }
    });
}
