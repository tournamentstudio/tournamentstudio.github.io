import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Locale,
} from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const names = [
  "باشگاه دانشگاه تهران و یاران آفتاب Championship 2026",
  "Northern University Championship باشگاه شیراز",
  "۱۲۳ قهرمانان اصفهان Team C",
  "2026 Western Academy گروه چهارم",
  "تیم پنجم گل یا پوچ دانشگاه صنعتی امیرکبیر",
  "Eastern Academy of Tournament Games تیم ششم",
  "گروه هفتم قهرمانان مشهد Championship",
  "Southern University Championship تیم هشتم",
];
const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function openBracket(page: Page, locale: Locale) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Switch to Persian", exact: true }),
  ).toBeVisible();
  if (locale === "fa") await switchLanguage(page, "en");
  const draft = createTournament(
    "University Championship جام دانشگاه تهران",
    names.map((name, index) => createParticipant(name, index + 1)),
  );
  draft.locale = locale;
  draft.theme = { ...draft.theme, preset: "gol-traditional", fontScale: 3 };
  const doc = simulate(generateStage(draft, draft.stages[0].id));
  doc.matches[0].label = "Tehran / دیدار ویژه";
  doc.matches[0].scheduledAt = "2027-01-01T10:00:00.000Z";
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
  await section(page, locale, "Brackets", "جدول حذفی");
  return page.url().split("#/t/")[1];
}

async function section(page: Page, locale: Locale, en: string, fa: string) {
  await page
    .getByRole("navigation", {
      name: text(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", { name: text(locale, en, fa), exact: true })
    .click();
}

async function switchLanguage(page: Page, from: Locale) {
  await page
    .getByRole("button", {
      name: text(from, "Switch to Persian", "تغییر به انگلیسی"),
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    from === "en" ? "rtl" : "ltr",
  );
}

async function savedDocument(page: Page, id: string) {
  return page.evaluate(
    (key) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .get(key);
          read.onsuccess = () => {
            resolve(JSON.stringify(read.result.payload));
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
    id,
  );
}

async function bracketTextFits(svg: Locator) {
  await expect(svg.locator(".bracket-node")).toHaveCount(7);
  expect(await svg.locator(".bracket-team").count()).toBe(14);
  const problems = await svg.evaluate((root) => {
    const failures: string[] = [];
    for (const node of root.querySelectorAll(".bracket-node")) {
      const card = node.querySelector<SVGRectElement>(".match-card")!.getBBox();
      for (const label of node.querySelectorAll<SVGTextElement>("text")) {
        const box = label.getBBox();
        const minX = Number(label.getAttribute("data-region-x") ?? card.x);
        const width = Number(
          label.getAttribute("data-region-width") ?? card.width,
        );
        if (
          box.x < minX - 1.5 ||
          box.x + box.width > minX + width + 1.5 ||
          box.y < card.y - 1.5 ||
          box.y + box.height > card.y + card.height + 1.5
        )
          failures.push(`${label.classList}: ${label.textContent}`);
      }
      for (const row of node.querySelectorAll("g")) {
        const name = row.querySelector<SVGTextElement>(".bracket-team");
        const score = row.querySelector<SVGTextElement>(".bracket-score");
        if (!name || !score) continue;
        const a = name.getBBox(),
          b = score.getBBox();
        if (a.x < b.x + b.width && a.x + a.width > b.x)
          failures.push(`Name overlaps score: ${name.textContent}`);
      }
    }
    return failures;
  });
  expect(
    problems,
    "SVG labels must stay inside their cards and text regions",
  ).toEqual([]);
}

for (const locale of ["en", "fa"] as const) {
  for (const width of [390, 1280]) {
    test(`${locale} bracket follows live language changes at ${width}px without editing data`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const id = await openBracket(page, locale);
      const before = await savedDocument(page, id);
      const svg = page.getByTestId("bracket-svg");
      const other: Locale = locale === "en" ? "fa" : "en";
      for (const [index, active] of [locale, other, locale].entries()) {
        if (index > 0)
          await switchLanguage(page, active === "fa" ? "en" : "fa");
        await expect(svg).toHaveAttribute(
          "data-direction",
          active === "fa" ? "rtl" : "ltr",
        );
        await page.evaluate(() => document.fonts.ready);
        await expect(() => bracketTextFits(svg)).toPass({ timeout: 12000 });
        await expect(svg.locator(".bracket-node").first()).toHaveAccessibleName(
          /Tehran|University|باشگاه/,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(2);
      }
      await switchLanguage(page, locale);
      await page.reload();
      await section(page, other, "Brackets", "جدول حذفی");
      await expect(svg).toHaveAttribute(
        "data-direction",
        other === "fa" ? "rtl" : "ltr",
      );
      await bracketTextFits(svg);
      expect(await savedDocument(page, id)).toBe(before);
      await page.screenshot({
        path: testInfo.outputPath(`switch-${locale}-${width}.png`),
        fullPage: true,
      });
      if (width === 1280) {
        const audit = await new AxeBuilder({ page })
          .include(".bracket-section")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(audit.violations).toEqual([]);
      }
    });
  }

  test(`${locale} exports preserve bilingual bracket alignment and localized match labels`, async ({
    page,
    context,
  }) => {
    await openBracket(page, locale);
    await section(page, locale, "Share Center", "مرکز اشتراک");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVG", exact: true }).click();
    const download = await pending;
    const svg = await readFile((await download.path())!, "utf8");
    expect(svg).toContain("data:font/woff2;base64,");
    expect(svg).not.toMatch(/(?:href|src)=["']https?:/);
    const exported = await context.newPage();
    await exported.setContent(
      `<html dir="${locale === "fa" ? "rtl" : "ltr"}"><body>${svg}</body></html>`,
    );
    await exported.evaluate(() => document.fonts.ready);
    await bracketTextFits(exported.locator("svg"));
    await exported
      .locator("html")
      .evaluate((node) =>
        node.setAttribute(
          "dir",
          node.getAttribute("dir") === "rtl" ? "ltr" : "rtl",
        ),
      );
    await bracketTextFits(exported.locator("svg"));
    await exported.close();
    // Prevent the system print dialog while retaining the real printable document.
    await context.addInitScript(() => {
      window.print = () => {};
    });
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", {
        name: text(locale, "PDF / Print", "PDF / چاپ"),
        exact: true,
      })
      .click();
    const printed = await popupPromise;
    await expect(printed.locator("tbody")).toContainText("Tehran / دیدار ویژه");
    await expect(printed.locator("tbody")).toContainText(
      text(locale, "R1 M2", "دور ۱، بازی ۲"),
    );
    await printed.evaluate(() => document.fonts.ready);
    expect(
      await printed.evaluate(() =>
        Array.from(document.fonts)
          .filter((font) => font.family.includes("TournaExport"))
          .map((font) => ({
            family: font.family.replace(/["']/g, ""),
            status: font.status,
          }))
          .sort((a, b) => a.family.localeCompare(b.family)),
      ),
    ).toEqual([
      { family: "TournaExportArabic", status: "loaded" },
      { family: "TournaExportLatin", status: "loaded" },
    ]);
    await bracketTextFits(printed.locator("svg"));
    await printed.close();
  });
}

test("manual bracket orientation survives language changes and can follow language again", async ({
  page,
}) => {
  await openBracket(page, "en");
  const svg = page.getByTestId("bracket-svg");
  const manual = page.getByRole("button", {
    name: "Right to left",
    exact: true,
  });
  await manual.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(manual).toBeFocused();
  expect(
    await manual.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe("none");
  await manual.press("Enter");
  await expect(svg).toHaveAttribute("data-direction", "rtl");
  await switchLanguage(page, "en");
  await switchLanguage(page, "fa");
  await expect(svg).toHaveAttribute("data-direction", "rtl");
  const automatic = page.getByRole("button", {
    name: "Follow language",
    exact: true,
  });
  await automatic.focus();
  await automatic.press("Enter");
  await expect(svg).toHaveAttribute("data-direction", "ltr");
  await switchLanguage(page, "en");
  await expect(svg).toHaveAttribute("data-direction", "rtl");
});
