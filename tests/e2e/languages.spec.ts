import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Locale, Tournament } from "../../src/domain/types";
import {
  languages,
  localeCodes,
  localeDirection,
  localeTag,
} from "../../src/i18n/locales";

const catalogs = new Map<Locale, Record<string, string>>();
function label(locale: Locale, en: string, fa?: string) {
  if (locale === "en") return en;
  if (locale === "fa") {
    expect(fa, `Persian test label for ${en}`).toBeDefined();
    return fa!;
  }
  if (!catalogs.has(locale))
    catalogs.set(
      locale,
      JSON.parse(
        readFileSync(resolve("src/i18n/catalogs", `${locale}.json`), "utf8"),
      ),
    );
  const value = catalogs.get(locale)![en];
  expect(value, `${locale} translation for ${en}`).toBeTruthy();
  return value;
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function language(page: Page, locale: Locale) {
  await page.getByTestId("language-select").selectOption(locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    localeDirection(locale),
  );
  await expect(page.getByTestId("language-select")).toHaveValue(locale);
  await expect(page.getByTestId("language-select")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
  ).toBe(locale);
}

async function saved(page: Page, locale: Locale) {
  await expect(page.locator(".save-status")).toHaveText(
    label(locale, "Saved locally", "محلی ذخیره شد"),
  );
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
}

async function stored(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const request = db
          .transaction("documents")
          .objectStore("documents")
          .get(location.hash.split("/")[2]);
        request.onsuccess = () => resolve(request.result.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function section(page: Page, locale: Locale, en: string, fa: string) {
  await page
    .locator(".workspace-tabs")
    .getByRole("button", {
      name: label(locale, en, fa),
      exact: true,
    })
    .click();
}

async function noOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".button, .field > span, .ranking-summary")
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              element.clientWidth > 0 &&
              (element.scrollWidth > element.clientWidth + 2 ||
                element.scrollHeight > element.clientHeight + 2),
          )
          .map((element) => element.textContent),
      ),
  ).toEqual([]);
  const selector = await page.getByTestId("language-select").boundingBox();
  expect(selector).not.toBeNull();
  expect(selector!.x).toBeGreaterThanOrEqual(0);
  expect(selector!.x + selector!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const header = (await page.locator(".topbar").boundingBox())!;
  expect(selector!.x).toBeGreaterThanOrEqual(header.x);
  expect(selector!.x + selector!.width).toBeLessThanOrEqual(
    header.x + header.width,
  );
  expect(selector!.y).toBeGreaterThanOrEqual(header.y);
  expect(selector!.y + selector!.height).toBeLessThanOrEqual(
    header.y + header.height,
  );
  const brand = page.locator(".topbar .brand");
  if (await brand.isVisible()) {
    const brandBox = (await brand.boundingBox())!;
    for (const navigation of await page.locator(".welcome-nav-action").all()) {
      if (!(await navigation.isVisible())) continue;
      const navigationBox = (await navigation.boundingBox())!;
      const sameRow =
        Math.min(
          brandBox.y + brandBox.height,
          navigationBox.y + navigationBox.height,
        ) > Math.max(brandBox.y, navigationBox.y);
      if (sameRow)
        expect(
          brandBox.x + brandBox.width <= navigationBox.x ||
            navigationBox.x + navigationBox.width <= brandBox.x,
          "The brand and navigation must not overlap",
        ).toBe(true);
    }
  }
}

test("all twenty languages update the interface and restore the saved selection", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/#/create");
  await expect(
    page.getByTestId("language-select").locator("option"),
  ).toHaveCount(20);
  await expect(
    page.getByTestId("language-select").locator("option"),
  ).toHaveText(languages.map((item) => item.nativeName));
  for (const locale of localeCodes) {
    await language(page, locale);
    await page.reload();
    const title = label(locale, "Tournament title", "عنوان مسابقات");
    await expect(page.getByLabel(title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: label(locale, "Continue", "ادامه"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByTestId("language-select")).toHaveValue(locale);
    await expect(page.getByLabel(title, { exact: true })).toBeVisible();
    await expect(page).toHaveTitle(
      label(
        locale,
        "TournaStudio | Tournament brackets, scores and displays",
        "TournaStudio | جدول مسابقات، امتیازها و نمایش",
      ),
    );
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
    }
    await page.getByLabel(title, { exact: true }).fill("Club cup / جام باشگاه");
    for (const [en, fa] of [
      ["Format and participants", "قالب و شرکت‌کنندگان"],
      ["Theme and privacy", "تم و حریم خصوصی"],
    ]) {
      await page
        .getByRole("button", {
          name: label(locale, "Continue", "ادامه"),
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: label(locale, en, fa),
          exact: true,
        }),
      ).toBeVisible();
      for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
      }
    }
  }
});

test("all twenty welcome layouts keep translated controls within the viewport", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  for (const locale of localeCodes) {
    await language(page, locale);
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
    }
  }
});

for (const [locale, width] of [
  ["de", 768],
  ["ar", 320],
] as const) {
  test(`${locale} welcome header keeps translated controls clear at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await language(page, locale);
    await expect(page.locator(".welcome-page")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`welcome-header-${locale}-${width}.png`),
      fullPage: true,
    });
  });
}

test("Spanish result entry survives language changes without rewriting tournament content", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await page.goto("/#/create");
  await language(page, "es");
  await page
    .getByLabel(label("es", "Tournament title"), { exact: true })
    .fill("Club del Mar باشگاه ساحل");
  await page
    .getByLabel(label("es", "Sport or activity"))
    .selectOption("petanque");
  await page
    .getByRole("button", { name: label("es", "Continue"), exact: true })
    .click();
  await page
    .getByLabel(label("es", "Participant count"), { exact: true })
    .fill("4");
  await page
    .getByLabel(label("es", "Or paste names, one per line"))
    .fill("Roma\nMadrid\nشیراز\n東京");
  await page
    .getByRole("button", { name: label("es", "Continue"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: label("es", "Create tournament"),
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await saved(page, "es");
  await section(page, "es", "Matches", "دیدارها");
  for (let index = 0; index < 6; index++) {
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('.score-entry input[type="number"]').nth(0).fill("13");
    await dialog
      .locator('.score-entry input[type="number"]')
      .nth(1)
      .fill(String(index + 4));
    await dialog
      .getByRole("button", { name: label("es", "Save result"), exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(page, "es");
  }
  const before = await stored(page);
  await expect(page.locator(".toast")).not.toBeVisible();
  expect(
    before.matches.filter((match) => match.status === "completed"),
  ).toHaveLength(6);
  await section(page, "es", "Standings", "جدول رتبه‌ها");
  const names = await page
    .locator(".standings-table tbody th")
    .allTextContents();
  for (const locale of ["it", "ar", "fa", "es", "en"] as const) {
    await language(page, locale);
    await saved(page, locale);
    await expect(
      page.getByRole("heading", { name: before.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".standings-table tbody th")).toHaveText(names);
    await expect(
      page.locator(".standings-table").getByRole("columnheader", {
        name: label(locale, "Point difference", "تفاضل امتیاز"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".standings-table tbody tr").first().locator("td").first(),
    ).toHaveText(new Intl.NumberFormat(localeTag(locale)).format(1));
    expect(await stored(page)).toEqual(before);
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`standings-${locale}-${width}.png`),
        fullPage: true,
      });
    }
    await section(page, locale, "Rules", "قوانین");
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`rules-${locale}-320.png`),
      fullPage: true,
    });
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await section(page, locale, "Standings", "جدول رتبه‌ها");
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.reload();
  await saved(page, "en");
  expect(await stored(page)).toEqual(before);
});

test("installed language catalogs stay available offline without a previous visit", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    for (const locale of localeCodes) {
      await language(page, locale);
      await expect(page.getByTestId("language-select")).toHaveAccessibleName(
        label(locale, "Language", "زبان"),
      );
    }
    await language(page, "it");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(page.getByTestId("language-select")).toHaveValue("it");
    await expect(
      page.getByRole("button", {
        name: label("it", "Create tournament"),
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("Turkish bracket searches and history timestamps follow the selected language", async ({
  page,
}) => {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Kulüp turnuvası");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Or paste names, one per line", { exact: true })
    .fill("IŞIK Spor\nİZMİR Spor\nWest\nEast");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await saved(page, "en");
  const before = await stored(page);
  await language(page, "tr");
  await section(page, "tr", "Matches", "دیدارها");
  const matchSearch = page.getByRole("searchbox", {
    name: label("tr", "Search matches"),
    exact: true,
  });
  await matchSearch.fill("ışık");
  await expect(page.locator("button.match-tile")).toHaveCount(1);
  await expect(page.locator("button.match-tile")).toContainText("IŞIK Spor");
  await language(page, "en");
  await expect(page.locator("button.match-tile")).toHaveCount(0);
  await language(page, "tr");
  await expect(page.locator("button.match-tile")).toHaveCount(1);
  await expect(matchSearch).toHaveValue("ışık");
  await section(page, "tr", "Brackets", "جدول حذفی");
  const highlight = page.getByRole("searchbox", {
    name: label("tr", "Highlight a participant"),
    exact: true,
  });
  for (const [query, participant] of [
    ["ışık", "IŞIK Spor"],
    ["izmir", "İZMİR Spor"],
  ]) {
    await highlight.fill(query);
    await expect(page.locator(".bracket-node.selected")).toHaveCount(1);
    await expect(page.locator(".bracket-node.selected")).toHaveAttribute(
      "aria-label",
      new RegExp(participant),
    );
  }
  await section(page, "tr", "History", "تاریخچه");
  const timestamp = page.locator(".revision-row time").first();
  await expect(timestamp).toBeVisible();
  const at = (await timestamp.getAttribute("datetime"))!;
  for (const locale of ["tr", "fa", "it"] as const) {
    await language(page, locale);
    const expected = await page.evaluate(
      ({ at, tag }) => {
        const value = new Date(at);
        return `${value.toLocaleDateString(tag, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })} · ${value.toLocaleTimeString(tag)}`;
      },
      { at, tag: localeTag(locale) },
    );
    await expect(timestamp).toHaveText(expected);
  }
  expect(await stored(page)).toEqual(before);
});

test("a captured storage notice updates when the language changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator.storage), "persist", {
      configurable: true,
      value: async () => true,
    });
  });
  await page.goto("/#/storage");
  await page
    .getByRole("button", { name: "Request persistent storage", exact: true })
    .click();
  const en = "Persistent storage granted. Continue keeping file backups.";
  const fa = "ذخیره پایدار مجاز شد. همچنان نسخه پشتیبان فایل نگه دارید.";
  await expect(page.getByText(en, { exact: true })).toBeVisible();
  for (const locale of ["it", "fa", "en"] as const) {
    await language(page, locale);
    await expect(
      page.getByText(label(locale, en, fa), { exact: true }),
    ).toBeVisible();
  }
});

test("an invalid saved language falls back safely and the mobile selector remains reachable", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("tournastudio-locale", "not-a-supported-language"),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("language-select")).toHaveValue("en");
  for (const locale of ["it", "es", "ar", "bn", "id", "ja"] as const) {
    await language(page, locale);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`home-${locale}-320.png`),
      fullPage: true,
    });
  }
});

test.describe("language loading and draft safety", () => {
  test.use({ serviceWorkers: "block" });

  const chunk = (locale: Locale) =>
    new RegExp(`/assets/${locale}-[^/]+\\.js(?:\\?.*)?$`);

  test("the latest language selection wins while an earlier download is still pending", async ({
    page,
    context,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = false;
    await context.route(chunk("it"), async (route) => {
      waiting = true;
      await gate;
      await route.continue();
    });
    await page.goto("/#/create");
    await page
      .getByLabel("Tournament title", { exact: true })
      .fill("Draft Roma باشگاه");
    await page.getByLabel("Sport or activity").selectOption("petanque");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Participant count", { exact: true }).fill("4");
    const names = "Roma\nMadrid\nشیراز\n東京";
    await page.getByLabel("Or paste names, one per line").fill(names);
    await page.getByTestId("language-select").selectOption("it");
    try {
      await expect.poll(() => waiting).toBe(true);
      await expect(page.getByTestId("language-select")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      expect(
        await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
      ).not.toBe("it");
      await language(page, "es");
      const response = page.waitForResponse(chunk("it"));
      release();
      await (await response).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page.getByTestId("language-select")).toHaveValue("es");
      expect(
        await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
      ).toBe("es");
      await expect(
        page.getByLabel(label("es", "Participant count"), { exact: true }),
      ).toHaveValue("4");
      await expect(
        page.getByLabel(label("es", "Or paste names, one per line")),
      ).toHaveValue(names);
      await expect(
        page.getByLabel(label("es", "Competition format")),
      ).toHaveValue("round-robin");
      await page
        .getByRole("button", { name: label("es", "Continue"), exact: true })
        .click();
      await page
        .getByRole("button", {
          name: label("es", "Create tournament"),
          exact: true,
        })
        .click();
      await saved(page, "es");
      const document = await stored(page);
      expect(document.title).toBe("Draft Roma باشگاه");
      expect(
        document.participants.map((participant) => participant.name),
      ).toEqual(names.split("\n"));
      expect(document.sport).toBe("petanque");
    } finally {
      release();
    }
  });

  test("a failed language download preserves the current form and can be retried", async ({
    page,
    context,
  }) => {
    let requests = 0;
    await context.route(chunk("it"), async (route) => {
      requests++;
      if (requests === 1) await route.abort("failed");
      else await route.continue();
    });
    await page.goto("/#/create");
    const draft = "Unsaved Italia 東京";
    await page.getByLabel("Tournament title", { exact: true }).fill(draft);
    await page.getByTestId("language-select").selectOption("it");
    await expect(page.getByRole("alert")).toContainText(
      "The language could not be loaded.",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByLabel("Tournament title", { exact: true }),
    ).toHaveValue(draft);
    expect(
      await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
    ).not.toBe("it");
    await page
      .getByRole("button", { name: "Retry language download", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(page.getByTestId("language-select")).toHaveValue("it");
    await expect(page.getByRole("alert")).not.toBeVisible();
    await expect(
      page.getByLabel(label("it", "Tournament title"), { exact: true }),
    ).toHaveValue(draft);
    expect(
      await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
    ).toBe("it");
    expect(requests).toBe(2);
  });

  test("a startup download failure keeps the preferred language available for retry", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("tournastudio-locale", "it"),
    );
    let failed = false;
    await context.route(chunk("it"), async (route) => {
      if (!failed) {
        failed = true;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto("/#/create");
    await expect(page.getByRole("alert")).toContainText(
      "The language could not be loaded.",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(
      await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
    ).toBe("it");
    await page
      .getByRole("button", { name: "Retry language download", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(
      page.getByLabel(label("it", "Tournament title"), { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).not.toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("tournastudio-locale")),
    ).toBe("it");
  });
});
