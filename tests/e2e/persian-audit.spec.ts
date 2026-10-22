import { expect, test, type Page } from "@playwright/test";

const cardName =
  "کارت‌ویژه‌قهرمانان‌بین‌المللی‌دانشگاه‌صنعتی‌امیرکبیر‌گل‌یا‌پوچ";
const playerName = "محمدرضا قهرمانی دانشگاه امیرکبیر Tehran A";

async function createPersianCup(page: Page) {
  await page.goto("/#/create");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.getByLabel("عنوان مسابقات", { exact: true }).fill("جام گل یا پوچ");
  await page.getByLabel("ورزش یا فعالیت").selectOption("gol-ya-pooch");
  await page.getByRole("button", { name: "ادامه", exact: true }).click();
  await page.getByLabel("تعداد شرکت‌کنندگان", { exact: true }).fill("4");
  await page.getByRole("button", { name: "ادامه", exact: true }).click();
  await page.getByRole("button", { name: "ساخت مسابقات", exact: true }).click();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function pageFits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
    "Persian content must not widen the page",
  ).toBe(true);
}

for (const width of [320, 390]) {
  test(`Persian half-space card names wrap after save and reload at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await createPersianCup(page);
    await section(page, "قوانین");
    await page
      .getByRole("button", { name: "افزودن کارت سفارشی", exact: true })
      .click();
    await page.getByLabel("نام کارت", { exact: true }).fill(cardName);
    const card = page.getByRole("group", { name: cardName, exact: true });
    await expect(card).toBeVisible();
    await pageFits(page);
    const textFits = await card.locator("legend").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].every(
        (rect) => rect.left >= box.left - 1 && rect.right <= box.right + 1,
      );
    });
    expect(textFits, "The full card legend must wrap inside its box").toBe(
      true,
    );
    await page
      .getByRole("button", { name: "ذخیره قوانین", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "واگرد", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
    await page.reload();
    await section(page, "قوانین");
    await expect(page.getByLabel("نام کارت", { exact: true })).toHaveValue(
      cardName,
    );
    await pageFits(page);
    await page.getByLabel("نام کارت", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("persian-card.png") });
  });

  test(`Persian roster names have a full row and preserve edits at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await createPersianCup(page);
    await section(page, "شرکت‌کنندگان");
    await page
      .getByRole("button", { name: "ویرایش", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "ویرایش شرکت‌کننده" });
    const firstName = dialog
      .getByRole("textbox", { name: "نام بازیکن", exact: true })
      .first();
    await firstName.fill(playerName);
    await dialog
      .getByRole("combobox", { name: "نقش", exact: true })
      .first()
      .selectOption("captain");
    const geometry = await firstName.evaluate((input) => {
      const row = input.closest(".roster-row")!;
      const name = input.getBoundingClientRect();
      const role = row.querySelector("select")!.getBoundingClientRect();
      const remove = row.querySelector("button")!.getBoundingClientRect();
      return {
        width: name.width,
        available: row.getBoundingClientRect().width,
        distinctRows: role.top >= name.bottom && remove.top >= name.bottom,
      };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(geometry.available - 2);
    expect(geometry.distinctRows).toBe(true);
    await dialog.locator(".roster-row").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("persian-roster.png") });
    await dialog
      .getByRole("button", { name: "ذخیره شرکت‌کننده", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "واگرد", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
    await page.reload();
    await section(page, "شرکت‌کنندگان");
    await page
      .getByRole("button", { name: "ویرایش", exact: true })
      .first()
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "نام بازیکن", exact: true }).first(),
    ).toHaveValue(playerName);
    await expect(
      dialog.getByRole("combobox", { name: "نقش", exact: true }).first(),
    ).toHaveValue("captain");
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 2),
    ).toBe(true);
    await pageFits(page);
  });
}
