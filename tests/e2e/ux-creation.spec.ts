import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_CONFIG, type Tournament } from "../../src/domain/types";

async function begin(page: Page, locale: "en" | "fa") {
  await page.addInitScript((value) => {
    localStorage.setItem("tournastudio-locale", value);
  }, locale);
  await page.goto("/#/create");
  await page
    .getByLabel(locale === "en" ? "Tournament title" : "عنوان مسابقات", {
      exact: true,
    })
    .fill("Community Cup جام محله");
  const next = page.getByRole("button", {
    name: locale === "en" ? "Continue" : "ادامه",
    exact: true,
  });
  await expect(next).toHaveAccessibleDescription(
    locale === "en"
      ? "Next: choose the format and participants."
      : "بعدی: انتخاب قالب و شرکت‌کنندگان.",
  );
  await next.click();
  return next;
}

async function readCreated(page: Page, locale: "en" | "fa") {
  await page
    .getByRole("button", {
      name: locale === "en" ? "Create tournament" : "ساخت مسابقات",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  return page.evaluate(async () => {
    const open = indexedDB.open("TournaStudio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const read = db
          .transaction("documents")
          .objectStore("documents")
          .get(location.hash.split("/")[2]);
        read.onsuccess = () => resolve(read.result.payload);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} creation shows only useful round controls and ignores hidden drafts`, async ({
    page,
  }) => {
    const next = await begin(page, locale);
    await page.setViewportSize({ width: 768, height: 1000 });
    const formWidth = await page
      .locator(".create-form")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(formWidth).toBeGreaterThan(450);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(768);
    const format = page.getByLabel(
      locale === "en" ? "Competition format" : "قالب مسابقات",
      { exact: true },
    );
    const rounds = page.getByLabel(
      locale === "en" ? "Number of rounds" : "تعداد دورها",
      { exact: true },
    );
    for (const value of [
      "single-elimination",
      "double-elimination",
      "triple-elimination",
      "gauntlet",
      "round-robin",
      "groups",
      "gsl",
    ]) {
      await format.selectOption(value);
      await expect(rounds).toHaveCount(0);
      await expect(format).not.toHaveAccessibleDescription("");
    }
    for (const value of [
      "swiss",
      "ladder",
      "free-for-all",
      "time-trial",
      "grand-prix",
    ]) {
      await format.selectOption(value);
      await expect(rounds).toBeVisible();
    }
    await rounds.fill("0");
    await expect(page.getByRole("alert")).toBeVisible();
    await format.selectOption("single-elimination");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(next).toHaveAccessibleDescription(
      locale === "en"
        ? "Next: choose a theme and review before creating."
        : "بعدی: انتخاب تم و بازبینی پیش از ساخت.",
    );
    await next.click();
    const doc = await readCreated(page, locale);
    expect(doc.stages[0].config.rounds).toBe(DEFAULT_CONFIG.rounds);
    expect(doc.matches).toHaveLength(7);
  });

  test(`${locale} creation catches duplicate names early and explains actual qualifiers`, async ({
    page,
  }) => {
    const next = await begin(page, locale);
    const names = page.getByLabel(
      locale === "en"
        ? "Or paste names, one per line"
        : "یا نام‌ها را وارد کنید، هر نام در یک خط",
      { exact: true },
    );
    await names.fill("Kite\nKITE");
    await next.click();
    await expect(names).toBeFocused();
    await expect(names).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText(
      locale === "en" ? "duplicate names" : "نام تکراری",
    );
    await names.fill("Kite\nسیمرغ\nAtlas");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page
      .getByLabel(locale === "en" ? "Competition format" : "قالب مسابقات", {
        exact: true,
      })
      .selectOption("groups");
    await page
      .getByLabel(locale === "en" ? "Number of groups" : "تعداد گروه‌ها", {
        exact: true,
      })
      .fill("2");
    await page
      .getByRole("checkbox", {
        name:
          locale === "en"
            ? "Add a knockout playoff stage"
            : "افزودن مرحله حذفی پایانی",
        exact: true,
      })
      .check();
    const qualification =
      locale === "en"
        ? "The top 1 from each group qualify for knockout playoffs."
        : "۱ شرکت‌کننده برتر هر گروه به مرحله حذفی صعود می‌کنند.";
    await expect(page.getByText(qualification, { exact: true })).toBeVisible();
    await next.click();
    await expect(page.locator(".creation-summary")).toContainText(
      qualification,
    );
    await expect(page.locator(".creation-summary")).toContainText(
      locale === "en"
        ? "Create playoff matches in Structure"
        : "دیدارهای حذفی را در بخش ساختار بسازید",
    );
    const doc = await readCreated(page, locale);
    expect(doc.participants.map((participant) => participant.name)).toEqual([
      "Kite",
      "سیمرغ",
      "Atlas",
    ]);
    expect(doc.stages[1].sources[0]).toMatchObject({
      count: 1,
      perGroup: true,
    });
    expect(
      doc.matches.every((match) => match.stageId === doc.stages[0].id),
    ).toBe(true);
  });

  test(`${locale} home names import and editable templates before starting setup`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    await page.goto("/#/");
    await expect(
      page.getByRole("button", {
        name: locale === "en" ? "Import & restore" : "وارد کردن و بازیابی",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: locale === "en" ? "Use a template" : "شروع با الگو",
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".template-card").first().click();
    await expect(page).toHaveURL(/#\/create/);
    await expect(
      page.getByLabel(
        locale === "en" ? "Sport or activity" : "ورزش یا فعالیت",
        { exact: true },
      ),
    ).toHaveValue("football");
  });
}
