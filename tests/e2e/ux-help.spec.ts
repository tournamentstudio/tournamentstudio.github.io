import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["en", "fa"] as const) {
  test(`${locale} mobile help and import replace the drawer and restore focus`, async ({
    page,
  }) => {
    const words = (en: string, fa: string) => (locale === "en" ? en : fa);
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menu = page.getByRole("button", {
      name: words("Open navigation", "باز کردن فهرست"),
      exact: true,
    });
    await menu.click();
    await page
      .getByRole("button", {
        name: words("How it works", "روش کار"),
        exact: true,
      })
      .click();
    const help = page.getByRole("dialog", {
      name: words("How to run a tournament", "راهنمای برگزاری مسابقات"),
      exact: true,
    });
    await expect(help).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(help.locator("ol > li")).toHaveCount(5);
    await expect(help).toContainText(
      words(
        "does not receive later results automatically",
        "نتیجه‌های بعدی را خودکار دریافت نمی‌کند",
      ),
    );
    await help.locator("summary").click();
    await expect(help).toContainText("Ctrl / Cmd + S");
    expect(
      await help.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include("dialog.modal")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    for (const closeWithEscape of [true, false]) {
      await menu.click();
      await page
        .getByRole("button", {
          name: words("Import & restore", "وارد کردن و بازیابی"),
          exact: true,
        })
        .click();
      const importer = page.getByRole("dialog", {
        name: words(
          "Bring a tournament into your studio",
          "مسابقات را به استودیو بیاورید",
        ),
        exact: true,
      });
      await expect(importer).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      if (closeWithEscape) await page.keyboard.press("Escape");
      else
        await importer
          .getByRole("button", {
            name: words("Close dialog", "بستن پنجره"),
            exact: true,
          })
          .click();
      await expect(menu).toBeFocused();
      await expect(page.locator(".app-body")).not.toHaveAttribute("inert");
    }
  });
}
