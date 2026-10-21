import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function persianTournament(page: Page) {
  await page.goto("/#/create");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page
    .getByLabel("عنوان مسابقات", { exact: true })
    .fill("جام دسترس‌پذیر تهران");
  await page.getByRole("button", { name: "ادامه", exact: true }).click();
  await page.getByLabel("تعداد شرکت‌کنندگان", { exact: true }).fill("4");
  await page.getByRole("button", { name: "ادامه", exact: true }).click();
  await page.getByRole("button", { name: "ساخت مسابقات", exact: true }).click();
  await expect(page.locator(".workspace-title h1")).toHaveText(
    "جام دسترس‌پذیر تهران",
  );
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator(".loading-state")).toHaveCount(0);
}

async function noViolations(page: Page, context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations, context).toEqual([]);
}

test("Persian score errors and match labels survive keyboard control and reload", async ({
  page,
}) => {
  await persianTournament(page);
  await section(page, "دیدارها");
  const opener = page.locator("button.match-tile.ready").first();
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: "کنترل دیدار" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toContainText("دور ۱، بازی ۱");
  await dialog.getByRole("spinbutton").first().fill("2");
  await dialog
    .getByRole("combobox", { name: "تعیین برنده", exact: true })
    .selectOption({ index: 2 });
  await dialog
    .getByRole("button", { name: "تأیید نتیجه", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "برنده انتخاب‌شده با امتیازهای واردشده سازگار نیست.",
  );
  await noViolations(page, "Persian match error dialog");
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await section(page, "برنامه");
  await expect(page.locator(".data-table")).toContainText("دور ۱، بازی ۱");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await section(page, "دیدارها");
  await expect(page.locator("button.match-tile").first()).toContainText(
    "دور ۱، بازی ۱",
  );
});

test("Persian import errors keep focus inside the dialog and return to the opener", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  const opener = page
    .getByRole("button", { name: "ورود مسابقات", exact: true })
    .first();
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "مسابقات را به استودیو بیاورید",
  });
  await dialog.getByLabel("کد ورود", { exact: true }).fill("TS1:broken");
  await dialog
    .getByRole("button", { name: "پیش‌نمایش ورود", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "کدی با قالب TS1 لازم است.",
  );
  await noViolations(page, "Persian import error");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("remaining operator sections pass Persian automated AA checks", async ({
  page,
}) => {
  await persianTournament(page);
  for (const name of [
    "ساختار",
    "جدول حذفی",
    "برنامه",
    "قوانین",
    "تبادل آفلاین",
    "تاریخچه",
    "تنظیمات",
  ]) {
    await section(page, name);
    await noViolations(page, `Persian ${name}`);
  }
});
