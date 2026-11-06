import { expect, test } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

for (const locale of ["en", "fa"] as const) {
  const text = (en: string, fa: string) => (locale === "fa" ? fa : en);

  test(`${locale} library search stays usable at narrow widths and filters recover`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    const draft = createTournament("Autumn cup جام پاییز", [
      createParticipant("سپهر Sepehr", 1),
      createParticipant("Cedar سرو", 2),
    ]);
    draft.locale = locale;
    const doc = generateStage(draft, draft.stages[0].id);
    await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
    await page
      .getByRole("button", {
        name: text("Save local copy", "ذخیره کپی محلی"),
        exact: true,
      })
      .click();
    await expect(page.locator(".save-status")).toHaveText(
      text("Saved locally", "محلی ذخیره شد"),
    );
    await page.goto("/#/");
    await expect(page.locator(".tournament-card")).toHaveCount(1);
    await expect(page.locator(".hero")).toHaveCount(0);
    const search = page.getByRole("textbox", {
      name: text("Search tournaments", "جستجوی مسابقات"),
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await search.fill("جام");
      await expect(page.locator(".tournament-card")).toHaveCount(1);
      expect((await search.boundingBox())!.width).toBeGreaterThan(170);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`library-${width}.png`),
        fullPage: true,
      });
    }
    await search.fill("No matching cup");
    const emptyHeading = page.getByRole("heading", {
      name: text(
        "No tournaments match these filters",
        "مسابقه‌ای با این فیلترها پیدا نشد",
      ),
    });
    await expect(emptyHeading).toBeVisible();
    const reset = page.getByRole("button", {
      name: text("Clear filters", "پاک کردن فیلترها"),
      exact: true,
    });
    await reset.click();
    await expect(page.locator(".tournament-card")).toHaveCount(1);
    for (const name of [
      text("Favorites", "علاقه‌مندی‌ها"),
      text("In progress", "فعال"),
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(emptyHeading).toBeVisible();
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await reset.click();
      await expect(page.locator(".tournament-card")).toHaveCount(1);
    }
    await page.goto("/#/library");
    await expect(search).toBeVisible();
    await search.fill("Autumn");
    await expect(page.locator(".tournament-card")).toHaveCount(1);
  });

  test(`${locale} empty title placeholder follows the interface after language switching`, async ({
    page,
  }) => {
    await page.goto("/#/create");
    if (locale === "fa")
      await page
        .getByRole("button", { name: "Switch to Persian", exact: true })
        .click();
    const title = page.getByLabel(text("Tournament title", "عنوان مسابقات"), {
      exact: true,
    });
    await expect(title).toHaveCSS("direction", locale === "fa" ? "rtl" : "ltr");
    await title.fill(locale === "fa" ? "Autumn cup" : "جام پاییز");
    await expect(title).toHaveCSS("direction", locale === "fa" ? "ltr" : "rtl");
    await page
      .getByRole("button", {
        name: text("Switch to Persian", "تغییر به انگلیسی"),
        exact: true,
      })
      .click();
    const switchedTitle = page.getByLabel(
      text("عنوان مسابقات", "Tournament title"),
      { exact: true },
    );
    await expect(switchedTitle).toHaveCSS(
      "direction",
      locale === "fa" ? "ltr" : "rtl",
    );
    await switchedTitle.fill("");
    await expect(switchedTitle).toHaveCSS(
      "direction",
      locale === "fa" ? "ltr" : "rtl",
    );
  });
}
