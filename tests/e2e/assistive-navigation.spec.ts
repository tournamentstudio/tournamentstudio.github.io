import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Locale,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const title = "جام دانشگاه تهران Accessible competition";
const names = [
  "باشگاه ورزشی دانشگاه تهران Alpha",
  "باشگاه ورزشی دانشگاه شیراز Beta",
];
const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function openTournament(page: Page, locale: Locale) {
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
  const draft = createTournament(
    title,
    names.map((name, index) => createParticipant(name, index + 1)),
  );
  draft.locale = locale;
  draft.presentation.scenes = [
    { id: "score", type: "current", title: "", text: "", duration: 15 },
    { id: "teams", type: "participants", title: "", text: "", duration: 15 },
  ];
  draft.presentation.autoRotate = false;
  const doc = generateStage(draft, draft.stages[0].id);
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", {
      name: text(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(page.locator(".workspace-title h1")).toHaveText(title);
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  return page.url().split("#/t/")[1];
}

async function selectSection(
  page: Page,
  locale: Locale,
  en: string,
  fa: string,
) {
  const button = page
    .getByRole("navigation", {
      name: text(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", { name: text(locale, en, fa), exact: true });
  await button.focus();
  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#workspace-section")).toHaveAccessibleName(
    text(locale, en, fa),
  );
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: `${text(locale, "Section", "بخش")}:` }),
  ).toHaveText(`${text(locale, "Section", "بخش")}: ${text(locale, en, fa)}`);
  await expect(page.locator(".loading-state")).toHaveCount(0);
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} mobile navigation contains focus, closes with Escape and identifies current route`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    await page.goto("/");
    const trigger = page.getByRole("button", {
      name: text(locale, "Open navigation", "باز کردن فهرست"),
      exact: true,
    });
    await trigger.focus();
    await trigger.press("Enter");
    const drawer = page.getByRole("dialog", {
      name: text(locale, "Studio navigation", "فهرست استودیو"),
      exact: true,
    });
    await expect(drawer).toBeFocused();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".mobile-menu")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.locator(".app-body")).toHaveAttribute("inert", "");
    const snapshot = await drawer.ariaSnapshot();
    expect(snapshot).toContain(text(locale, "Main navigation", "فهرست اصلی"));
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press(index % 3 === 0 ? "Shift+Tab" : "Tab");
      expect(
        await drawer.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.press("Enter");
    const destination = drawer.getByRole("link", {
      name: text(locale, "My tournaments", "مسابقات من"),
      exact: false,
    });
    await destination.focus();
    await destination.press("Enter");
    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(page).toHaveTitle(
      `${text(locale, "My tournaments", "مسابقات من")} | TournaStudio`,
    );
    await trigger.focus();
    await trigger.press("Enter");
    await expect(destination).toHaveAttribute("aria-current", "page");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`${locale} zoom-equivalent reflow keeps forms, table regions and keyboard controls usable`, async ({
    page,
  }) => {
    await openTournament(page, locale);
    for (const width of [640, 320]) {
      // 1280 CSS pixels at 200% and 400% zoom correspond to these layout widths.
      await page.setViewportSize({ width, height: (720 * width) / 1280 });
      await selectSection(page, locale, "Standings", "جدول رتبه‌ها");
      const region = page.getByRole("region", {
        name: text(locale, "Scrollable standings", "جدول قابل پیمایش"),
      });
      await region.focus();
      const before = await region.evaluate((node) => node.scrollLeft);
      await region.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
      await expect
        .poll(() => region.evaluate((node) => node.scrollLeft))
        .not.toBe(before);
      expect(await region.locator("th[scope='col']").count()).toBeGreaterThan(
        8,
      );
      expect(await region.locator("th[scope='row']").count()).toBe(2);
      await selectSection(page, locale, "Matches", "دیدارها");
      await page.locator("button.match-tile.ready").first().focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: text(locale, "Match control", "کنترل دیدار"),
        exact: true,
      });
      const score = dialog.getByRole("spinbutton").first();
      await score.focus();
      await score.fill("4");
      await expect(score).toBeFocused();
      expect(
        await score.evaluate((node) => getComputedStyle(node).outlineStyle),
      ).not.toBe("none");
      const overflow = await dialog.evaluate(
        (node) => node.scrollWidth - node.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(
        page.locator("button.match-tile.ready").first(),
      ).toBeFocused();
    }
  });

  test(`${locale} presentation announces confirmed scores and scenes without repeated timer updates`, async ({
    page,
    context,
  }) => {
    const id = await openTournament(page, locale);
    const display = await context.newPage();
    await display.goto(`/#/present/${id}`);
    const scoreboard = display
      .getByTestId("presentation-scoreboard")
      .getByRole("status");
    await expect(scoreboard).toHaveAttribute("aria-atomic", "true");
    await expect(scoreboard).toContainText(names[0]);
    const initial = await scoreboard.textContent();
    await selectSection(page, locale, "Matches", "دیدارها");
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", {
      name: text(locale, "Match control", "کنترل دیدار"),
      exact: true,
    });
    await dialog.getByRole("spinbutton").first().fill("4");
    await dialog.getByRole("spinbutton").nth(1).fill("2");
    await dialog
      .getByRole("button", {
        name: text(locale, "Confirm result", "تأیید نتیجه"),
        exact: true,
      })
      .click();
    await expect(page.locator(".save-status")).toHaveText(
      text(locale, "Saved locally", "محلی ذخیره شد"),
    );
    await expect(scoreboard).toContainText(`: ${(4).toLocaleString(locale)}`);
    expect(await scoreboard.textContent()).not.toBe(initial);
    const confirmed = await scoreboard.textContent();
    await expect
      .poll(async () => {
        await display.waitForTimeout(1100);
        return scoreboard.textContent();
      })
      .toBe(confirmed);
    await display
      .getByRole("button", {
        name: text(locale, "Next scene", "نمای بعدی"),
        exact: true,
      })
      .click();
    await expect(
      display
        .getByRole("status")
        .filter({ hasText: text(locale, "Scene", "نما") }),
    ).toContainText(text(locale, "Participants", "شرکت‌کنندگان"));
  });
}

test("reduced motion and forced colors preserve keyboard focus and drawer operation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe("none");
  await trigger.press("Enter");
  const drawer = page.getByRole("dialog", {
    name: "Studio navigation",
    exact: true,
  });
  expect(
    await drawer.evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
  await drawer.press("Escape");
  await expect(trigger).toBeFocused();
});
