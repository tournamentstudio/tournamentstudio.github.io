import { expect, test, type Locator, type Page } from "@playwright/test";

type Locale = "en" | "fa";
const label = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function switchLanguage(page: Page, current: Locale) {
  await page
    .getByRole("button", {
      name: label(current, "Switch to Persian", "تغییر به انگلیسی"),
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    current === "en" ? "rtl" : "ltr",
  );
}

async function section(page: Page, locale: Locale, en: string, fa: string) {
  await page
    .getByRole("navigation", {
      name: label(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", { name: label(locale, en, fa), exact: true })
    .click();
}

async function fieldDirection(
  field: Locator,
  value: string,
  direction: "ltr" | "rtl",
) {
  await expect(field).toHaveValue(value);
  await expect(field).toHaveCSS("direction", direction);
  const layout = await field.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return {
      fits: box.left >= parent.left - 2 && box.right <= parent.right + 2,
      alignment: getComputedStyle(element).textAlign,
    };
  });
  expect(layout.fits, "Editable text stays inside its field container").toBe(
    true,
  );
  expect(["start", direction === "rtl" ? "right" : "left"]).toContain(
    layout.alignment,
  );
}

async function editFirstParticipant(page: Page, locale: Locale) {
  await section(page, locale, "Participants", "شرکت‌کنندگان");
  await page
    .getByRole("button", { name: label(locale, "Edit", "ویرایش"), exact: true })
    .first()
    .click();
  return page.getByRole("dialog", {
    name: label(locale, "Edit participant", "ویرایش شرکت‌کننده"),
  });
}

for (const width of [390, 1280]) {
  for (const initialLocale of ["en", "fa"] as const) {
    test(`mixed-script fields survive ${initialLocale} language changes at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      const otherLocale: Locale = initialLocale === "en" ? "fa" : "en";
      const title = label(
        initialLocale,
        "2026 Atlas Cup جام پاییز",
        "۲۰۲۶ جام قهرمانان Atlas Cup",
      );
      const titleDirection = initialLocale === "en" ? "ltr" : "rtl";
      const entrants = [
        "Atlas تهران",
        "قهرمانان Team 2",
        "North Stars",
        "ستاره South",
      ].join("\n");
      const participant = "2026 Atlas United قهرمانان تهران";
      const player = "محمدرضا قهرمانی Tehran A";
      const organization = "دانشگاه صنعتی امیرکبیر University";
      const region = "Tehran تهران";
      const stageName = "مرحله نهایی Playoffs";
      await page.goto("/#/create");
      if (initialLocale === "fa") await switchLanguage(page, "en");
      await page
        .getByLabel(label(initialLocale, "Tournament title", "عنوان مسابقات"), {
          exact: true,
        })
        .fill(title);
      await switchLanguage(page, initialLocale);
      await fieldDirection(
        page.getByLabel(
          label(otherLocale, "Tournament title", "عنوان مسابقات"),
          {
            exact: true,
          },
        ),
        title,
        titleDirection,
      );
      await switchLanguage(page, otherLocale);
      await page
        .getByLabel(label(initialLocale, "Sport or activity", "ورزش یا فعالیت"))
        .selectOption("gol-ya-pooch");
      await page
        .getByRole("button", {
          name: label(initialLocale, "Continue", "ادامه"),
          exact: true,
        })
        .click();
      await page
        .getByLabel(
          label(
            initialLocale,
            "Or paste names, one per line",
            "یا نام‌ها را وارد کنید، هر نام در یک خط",
          ),
        )
        .fill(entrants);
      await switchLanguage(page, initialLocale);
      await fieldDirection(
        page.getByLabel(
          label(
            otherLocale,
            "Or paste names, one per line",
            "یا نام‌ها را وارد کنید، هر نام در یک خط",
          ),
        ),
        entrants,
        "ltr",
      );
      await switchLanguage(page, otherLocale);
      await page
        .getByRole("button", {
          name: label(initialLocale, "Continue", "ادامه"),
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: label(initialLocale, "Create tournament", "ساخت مسابقات"),
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/#\/t\/[^/]+$/);
      await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();

      const dialog = await editFirstParticipant(page, initialLocale);
      await dialog
        .getByLabel(label(initialLocale, "Display name", "نام نمایشی"), {
          exact: true,
        })
        .fill(participant);
      await dialog
        .getByLabel(label(initialLocale, "Organization", "سازمان"), {
          exact: true,
        })
        .fill(organization);
      await dialog
        .getByLabel(label(initialLocale, "Region", "منطقه"), { exact: true })
        .fill(region);
      await dialog
        .getByRole("textbox", {
          name: label(initialLocale, "Player name", "نام بازیکن"),
          exact: true,
        })
        .first()
        .fill(player);
      await dialog
        .getByRole("button", {
          name: label(initialLocale, "Save participant", "ذخیره شرکت‌کننده"),
          exact: true,
        })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();

      await section(page, initialLocale, "Settings", "تنظیمات");
      await page
        .getByLabel(label(initialLocale, "Subtitle", "زیرعنوان"), {
          exact: true,
        })
        .fill(organization);
      await switchLanguage(page, initialLocale);
      await fieldDirection(
        page.getByLabel(label(otherLocale, "Title", "عنوان"), { exact: true }),
        title,
        titleDirection,
      );
      await fieldDirection(
        page.getByLabel(label(otherLocale, "Subtitle", "زیرعنوان"), {
          exact: true,
        }),
        organization,
        "rtl",
      );
      await expect(
        page.getByLabel(
          label(otherLocale, "Timezone (IANA name)", "منطقه زمانی (نام IANA)"),
        ),
      ).toHaveCSS("direction", "ltr");
      await page
        .getByRole("button", {
          name: label(otherLocale, "Save settings", "ذخیره تنظیمات"),
          exact: true,
        })
        .click();
      await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
      await section(page, otherLocale, "Structure", "ساختار");
      await page
        .getByLabel(label(otherLocale, "Stage name", "نام مرحله"), {
          exact: true,
        })
        .fill(stageName);
      await page
        .getByLabel(label(otherLocale, "Stage name", "نام مرحله"), {
          exact: true,
        })
        .blur();
      await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
      await switchLanguage(page, otherLocale);
      await fieldDirection(
        page.getByLabel(label(initialLocale, "Stage name", "نام مرحله"), {
          exact: true,
        }),
        stageName,
        "rtl",
      );

      for (const locale of [initialLocale, otherLocale]) {
        if (locale === otherLocale) await switchLanguage(page, initialLocale);
        await page.reload();
        const savedDialog = await editFirstParticipant(page, locale);
        await fieldDirection(
          savedDialog.getByLabel(label(locale, "Display name", "نام نمایشی"), {
            exact: true,
          }),
          participant,
          "ltr",
        );
        await fieldDirection(
          savedDialog.getByLabel(label(locale, "Organization", "سازمان"), {
            exact: true,
          }),
          organization,
          "rtl",
        );
        await fieldDirection(
          savedDialog.getByLabel(label(locale, "Region", "منطقه"), {
            exact: true,
          }),
          region,
          "ltr",
        );
        await fieldDirection(
          savedDialog
            .getByRole("textbox", {
              name: label(locale, "Player name", "نام بازیکن"),
              exact: true,
            })
            .first(),
          player,
          "rtl",
        );
        await savedDialog
          .getByRole("button", {
            name: label(locale, "Close dialog", "بستن پنجره"),
            exact: true,
          })
          .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
        ).toBe(true);
      }
    });
  }
}
