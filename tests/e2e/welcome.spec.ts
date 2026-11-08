import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Locale,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function setLanguage(page: Page, locale: Locale) {
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} first visit fits narrow, tablet and desktop layouts with accessible content`, async ({
    page,
  }, testInfo) => {
    await setLanguage(page, locale);
    await page.goto("/");
    const welcome = page.locator(".welcome-page");
    await expect(welcome).toBeVisible();
    await expect(welcome.locator(".landing-demo-progress strong")).toHaveCSS(
      "direction",
      "ltr",
    );
    for (const score of await welcome
      .locator(".landing-demo-actions bdi")
      .all())
      await expect(score).toHaveCSS("direction", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      text(
        locale,
        "From the first draw to the final cheer.",
        "از قرعه‌کشی تا شادی قهرمانی",
      ),
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "fa" ? "rtl" : "ltr",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const headerBox = (await page.locator(".topbar").boundingBox())!;
      const languageBox = (await page
        .getByTestId("language-select")
        .boundingBox())!;
      expect(languageBox.y).toBeGreaterThanOrEqual(headerBox.y);
      expect(languageBox.y + languageBox.height).toBeLessThanOrEqual(
        headerBox.y + headerBox.height,
      );
      const firstNavigation = page.locator(".welcome-nav-action").first();
      if (await firstNavigation.isVisible()) {
        const brandBox = (await page.locator(".topbar .brand").boundingBox())!;
        const navigationBox = (await firstNavigation.boundingBox())!;
        const separation =
          locale === "fa"
            ? brandBox.x - (navigationBox.x + navigationBox.width)
            : navigationBox.x - (brandBox.x + brandBox.width);
        expect(separation).toBeGreaterThanOrEqual(10);
      }
      const clipped = await welcome
        .locator("h1,h2,h3,p,button")
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return (
                box.width > 0 && element.scrollWidth > element.clientWidth + 1
              );
            })
            .map((element) => element.textContent),
        );
      expect(clipped).toEqual([]);
      const create = welcome.getByRole("button", {
        name: text(locale, "Create tournament", "ساخت مسابقات"),
        exact: true,
      });
      const createBox = (await create.boundingBox())!;
      expect(createBox.y + createBox.height).toBeLessThan(900);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`welcome-${locale}-${width}.png`),
        fullPage: true,
      });
    }
  });

  test(`${locale} first-visit create and import commands work from the keyboard`, async ({
    page,
  }) => {
    await setLanguage(page, locale);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/");
    const create = page.locator(".welcome-page").getByRole("button", {
      name: text(locale, "Create tournament", "ساخت مسابقات"),
      exact: true,
    });
    await create.focus();
    await create.press("Enter");
    await expect(page).toHaveURL(/#\/create$/);
    await expect(
      page.getByLabel(text(locale, "Tournament title", "عنوان مسابقات"), {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: text(locale, "Open navigation", "باز کردن فهرست"),
      exact: true,
    });
    await trigger.focus();
    await trigger.press("Enter");
    const importer = page.getByRole("button", {
      name: text(locale, "Import & restore", "وارد کردن و بازیابی"),
      exact: true,
    });
    await importer.focus();
    await importer.press("Enter");
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".welcome-page")).toBeVisible();
  });

  test(`${locale} starter programs open editable settings without saving examples`, async ({
    page,
  }) => {
    await setLanguage(page, locale);
    await page.setViewportSize({ width: 390, height: 900 });
    for (const [sport, count, format] of [
      ["football", "16", "groups"],
      ["esports", "8", "double-elimination"],
      ["gol-ya-pooch", "8", "groups"],
    ]) {
      await page.goto("/");
      const template = page.locator(
        `.starter-programs [data-template="${sport}"]`,
      );
      await template.focus();
      await template.press("Enter");
      await expect(page).toHaveURL(/#\/create$/);
      await page
        .getByLabel(text(locale, "Tournament title", "عنوان مسابقات"), {
          exact: true,
        })
        .fill("Community cup جام محله");
      await page
        .getByRole("button", {
          name: text(locale, "Continue", "ادامه"),
          exact: true,
        })
        .click();
      await expect(
        page.getByLabel(text(locale, "Competition format", "قالب مسابقات"), {
          exact: true,
        }),
      ).toHaveValue(format);
      await expect(
        page.getByLabel(
          text(locale, "Participant count", "تعداد شرکت‌کنندگان"),
          { exact: true },
        ),
      ).toHaveValue(count);
    }
    await page.goto("/#/library");
    await expect(page.locator(".tournament-card")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: text(locale, "No tournaments yet", "هنوز مسابقه‌ای ندارید"),
        exact: true,
      }),
    ).toBeVisible();
  });

  test(`${locale} example can be tried from the keyboard and leaves the library empty`, async ({
    page,
  }) => {
    await setLanguage(page, locale);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const tryMatch = page.getByRole("button", {
      name: text(locale, "Try a match", "یک دیدار را امتحان کنید"),
      exact: true,
    });
    await tryMatch.focus();
    await tryMatch.press("Enter");
    const demo = page.getByRole("region", {
      name: text(locale, "Example tournament", "مسابقات نمونه"),
      exact: true,
    });
    const firstChoice = demo.getByRole("button", {
      name: text(locale, "Cedar wins, 2 to 1", "برد سرو، ۲ بر ۱"),
      exact: true,
    });
    await expect(firstChoice).toBeFocused();
    const choiceBox = (await firstChoice.boundingBox())!;
    expect(choiceBox.y).toBeGreaterThanOrEqual(0);
    expect(choiceBox.y + choiceBox.height).toBeLessThanOrEqual(568);
    await firstChoice.press("Enter");
    const reset = demo.getByRole("button", {
      name: text(locale, "Reset example", "شروع دوباره نمونه"),
      exact: true,
    });
    await reset.focus();
    await reset.press("Enter");
    await expect(firstChoice).toBeVisible();
    await expect(firstChoice).toBeFocused();
    await page.goto("/#/library");
    await expect(page.locator(".tournament-card")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: text(locale, "No tournaments yet", "هنوز مسابقه‌ای ندارید"),
        exact: true,
      }),
    ).toBeVisible();
  });

  test(`${locale} returning organizers and trash-only libraries keep their workspace`, async ({
    page,
  }) => {
    await setLanguage(page, locale);
    const draft = createTournament("Autumn cup جام پاییز", [
      createParticipant("سپهر Sepehr", 1),
      createParticipant("Cedar سرو", 2),
    ]);
    draft.locale = locale;
    const doc = generateStage(draft, draft.stages[0].id);
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
    await page.goto("/#/");
    await expect(page.locator(".tournament-card")).toHaveCount(1);
    await expect(page.locator(".welcome-page")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: text(locale, "Your tournament desk", "میز مسابقات شما"),
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: text(locale, "Tournament actions", "عملیات مسابقات"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: text(locale, "Move to trash", "انتقال به زباله‌دان"),
        exact: true,
      })
      .click();
    await expect(page.locator(".tournament-card")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".welcome-page")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: text(locale, "Trash", "زباله‌دان"),
        exact: true,
      })
      .click();
    await expect(page.locator(".tournament-card")).toHaveCount(1);
    await page
      .getByRole("button", {
        name: text(locale, "Tournament actions", "عملیات مسابقات"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: text(locale, "Restore", "بازیابی"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: text(locale, "All tournaments", "همه"),
        exact: true,
      })
      .click();
    await expect(page.locator(".tournament-card")).toHaveCount(1);
  });
}

test("first-visit language switching preserves the page and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await expect(page.locator(".welcome-page")).toBeVisible();
  await page.getByTestId("language-select").selectOption("fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "از قرعه‌کشی تا شادی قهرمانی",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.getByTestId("language-select").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "From the first draw to the final cheer.",
  );
  const persistentMotion = await page
    .locator(".welcome-page *")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.animationName !== "none" &&
            style.animationIterationCount === "infinite" &&
            Number.parseFloat(style.animationDuration) > 0.01
          );
        })
        .map((element) => element.className),
    );
  expect(persistentMotion).toEqual([]);
});
