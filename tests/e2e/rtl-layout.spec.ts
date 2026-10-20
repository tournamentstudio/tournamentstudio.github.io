import { expect, test, type Locator, type Page } from "@playwright/test";

const title =
  "جشنواره بزرگ بین‌المللی گل یا پوچ دانشگاه تهران Championship 2026";
const names = [
  "تیم شیران دانشگاه صنعتی امیرکبیر Tehran A",
  "یاران سپهر و همسفران آفتاب اصفهان Team 2",
  "گروه قهرمانان مشهد Championship",
  "تیم شمالی",
  "تیم جنوبی",
  "تیم شرقی",
  "تیم غربی",
  "تیم مرکزی",
];

async function textFits(root: Locator) {
  const problems = await root.evaluate((container) => {
    const failures: string[] = [];
    for (const control of container.querySelectorAll<HTMLElement>(
      "button, .badge, h1, h2, h3, .score-side > bdi",
    )) {
      const box = control.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (
        (control.closest(".sidebar") &&
          control.closest(".sidebar") !== container) ||
        control.closest(".workspace-tabs, .bracket-viewport")
      )
        continue;
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement!;
        if (!node.textContent?.trim() || parent.closest("svg")) continue;
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") continue;
        // Match tiles expose the full entrant name as their accessible name.
        if (style.textOverflow === "ellipsis") {
          const fullName = node.textContent.trim();
          if (
            !control.textContent?.includes(fullName) ||
            (parent.closest(".stage-node") && control.title !== fullName)
          )
            failures.push(`Missing full name: ${fullName}`);
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (
            rect.width &&
            (rect.left < box.left - 2 ||
              rect.right > box.right + 2 ||
              rect.top < box.top - 2 ||
              rect.bottom > box.bottom + 2)
          )
            failures.push(
              `${control.className || control.tagName}: ${node.textContent.trim().slice(0, 80)}`,
            );
        }
      }
    }
    return [...new Set(failures)];
  });
  expect(problems, "Visible labels must fit their controls").toEqual([]);
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
}

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name, exact: true })
    .click();
}

for (const width of [320, 390, 768, 1280]) {
  test(`fits Persian labels and mixed-script names at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/create");
    await page
      .getByRole("button", { name: "Switch to Persian", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.evaluate(() => document.fonts.ready);
    if (width <= 760) {
      await expect(page.locator(".sidebar")).toBeHidden();
      await page.getByRole("button", { name: "باز کردن فهرست" }).click();
      await expect(page.locator(".sidebar")).toBeVisible();
      await textFits(page.locator(".sidebar"));
      await page.getByRole("button", { name: "بستن فهرست" }).press("Enter");
      await expect(page.locator(".sidebar")).toBeHidden();
    }
    await page.getByLabel("عنوان مسابقات", { exact: true }).fill(title);
    await page.getByLabel("ورزش یا فعالیت").selectOption("gol-ya-pooch");
    await textFits(page.locator(".create-page"));
    await page.getByRole("button", { name: "ادامه", exact: true }).click();
    await page.getByLabel("قالب مسابقات").selectOption("groups");
    await page.getByLabel("تعداد گروه‌ها", { exact: true }).fill("2");
    await page.getByLabel("افزودن مرحله حذفی پایانی").check();
    await page
      .getByLabel("یا نام‌ها را وارد کنید، هر نام در یک خط")
      .fill(names.join("\n"));
    await textFits(page.locator(".create-page"));
    await page.getByRole("button", { name: "ادامه", exact: true }).click();
    await textFits(page.locator(".create-page"));
    await noPageOverflow(page);
    await page
      .getByRole("button", { name: "ساخت مسابقات", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/t\/[^/]+$/);
    await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
    await textFits(page.locator(".workspace-page"));
    await noPageOverflow(page);

    await section(page, "استودیو تم");
    await expect(page.locator(".theme-choice")).toHaveCount(8);
    await textFits(page.locator(".theme-studio"));
    await noPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`persian-themes-${width}.png`),
      fullPage: true,
    });

    await section(page, "مرکز اشتراک");
    await page
      .getByRole("combobox", { name: "محافظت", exact: true })
      .selectOption("encrypted");
    await textFits(page.locator(".workspace-page"));
    await noPageOverflow(page);

    await section(page, "ساختار");
    await page.getByLabel("نام مرحله", { exact: true }).fill(title);
    await page.getByLabel("نام مرحله", { exact: true }).blur();
    await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
    const stage = page.locator(".stage-node").first();
    await expect(stage).toHaveAttribute("title", title);
    await expect(stage).toHaveAccessibleName(new RegExp("جشنواره بزرگ"));
    await textFits(page.locator(".structure-studio"));
    const overlap = await page
      .locator(".structure-graph-node")
      .first()
      .evaluate((node) => {
        const handle = node
          .querySelector(".stage-move-handle")!
          .getBoundingClientRect();
        const label = node
          .querySelector(".stage-node-order")!
          .getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node.querySelector(".stage-node-order")!);
        const text = range.getBoundingClientRect();
        return (
          handle.left < text.right &&
          handle.right > text.left &&
          handle.top < label.bottom &&
          handle.bottom > label.top
        );
      });
    expect(
      overlap,
      "The move handle must not cover the Persian stage label",
    ).toBe(false);
    await noPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`persian-structure-${width}.png`),
      fullPage: true,
    });

    await section(page, "دیدارها");
    const firstMatch = page.locator("button.match-tile.ready").first();
    await expect(firstMatch).toHaveAccessibleName(
      new RegExp("تیم شیران دانشگاه صنعتی امیرکبیر Tehran A"),
    );
    await firstMatch.click();
    const dialog = page.getByRole("dialog", { name: "کنترل دیدار" });
    await expect(dialog.locator(".score-side > bdi").first()).toHaveText(
      names[0],
    );
    await textFits(dialog);
    const winnerFits = await page
      .getByRole("combobox", { name: "تعیین برنده", exact: true })
      .evaluate((element) => {
        const select = element as HTMLSelectElement;
        const style = getComputedStyle(select);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        context.font = style.font;
        return (
          context.measureText(select.selectedOptions[0].text).width +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            24 <=
          select.clientWidth
        );
      });
    expect(winnerFits, "The default winner decision must be readable").toBe(
      true,
    );
    await dialog.getByRole("button", { name: "حالت داور" }).click();
    await textFits(dialog);
    await noPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`persian-referee-${width}.png`),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "بستن پنجره" }).click();
    await section(page, "نمایش");
    await textFits(page.locator(".presentation-studio"));
    await noPageOverflow(page);
    await page.getByRole("button", { name: "پیش‌نمایش", exact: true }).click();
    await textFits(page.locator(".presentation-shell"));
    expect(
      await page
        .locator(".presentation-shell")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 2),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`persian-presentation-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "خروج از نمایش", exact: true })
      .click();
  });
}
