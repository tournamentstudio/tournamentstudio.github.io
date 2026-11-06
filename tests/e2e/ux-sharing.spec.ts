import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";

type Locale = "en" | "fa";
const words = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function fixture(page: Page, locale: Locale) {
  await page.addInitScript(
    (language) => localStorage.setItem("tournastudio-locale", language),
    locale,
  );
  let tournament = createTournament(
    "جام دوستانه Community Cup",
    Array.from({ length: 8 }, (_, i) =>
      createParticipant(`Team ${i + 1}`, i + 1),
    ),
  );
  tournament.description = "Private organizer note";
  tournament = generateStage(tournament, tournament.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", {
      name: words(locale, "Import & restore", "وارد کردن و بازیابی"),
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  const chooseFile = dialog.getByRole("button", {
    name: words(locale, "Choose a file", "انتخاب فایل"),
    exact: true,
  });
  await chooseFile.focus();
  const chooser = page.waitForEvent("filechooser");
  await chooseFile.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "tournament.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tournament)),
  });
  await dialog
    .getByRole("button", {
      name: words(locale, "Preview import", "پیش‌نمایش ورود"),
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", {
      name: words(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText(
    words(locale, "Saved locally", "محلی ذخیره شد"),
  );
  await page
    .getByRole("navigation", {
      name: words(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", {
      name: words(locale, "Share Center", "مرکز اشتراک"),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: words(locale, "Share and back up", "اشتراک و پشتیبان‌گیری"),
      exact: true,
    }),
  ).toBeVisible();
  return tournament;
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale}: guided sharing names the output and brings it into view`, async ({
    page,
  }) => {
    await fixture(page, locale);
    const guide = page.locator(".transfer-guide");
    const advanced = page.locator(".share-advanced");
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(
      page.getByRole("button", { name: "Generate link & code", exact: true }),
    ).not.toBeVisible();
    await guide
      .getByRole("button", {
        name:
          locale === "en"
            ? /^Create share (link|code)$/
            : /^ساخت (پیوند|کد) اشتراک$/,
      })
      .click();
    const output = page.getByRole("region", {
      name: words(locale, "Ready to share", "آماده ارسال"),
    });
    await expect(output).toBeFocused();
    await expect(
      output.getByLabel(words(locale, "Portable code", "کد قابل انتقال"), {
        exact: true,
      }),
    ).toHaveValue(/^TS1:/);
    await expect(output.locator(".share-next-step")).toContainText(
      words(locale, "recipient", "گیرنده"),
    );
    await guide
      .getByLabel(
        words(
          locale,
          "What do you want to transfer?",
          "چه چیزی را منتقل می‌کنید؟",
        ),
        { exact: true },
      )
      .selectOption("recipe");
    await expect(output).not.toBeVisible();
    await guide
      .getByRole("button", {
        name: words(locale, "Create template code", "ساخت کد الگو"),
        exact: true,
      })
      .click();
    await expect(output).toBeFocused();
    await expect(
      output.getByLabel(words(locale, "Portable code", "کد قابل انتقال"), {
        exact: true,
      }),
    ).toHaveValue(/^TSR[12]:/);
    await guide
      .getByLabel(
        words(
          locale,
          "What do you want to transfer?",
          "چه چیزی را منتقل می‌کنید؟",
        ),
        { exact: true },
      )
      .selectOption("backup");
    const backup = guide.getByRole("button", {
      name: words(
        locale,
        "Download encrypted backup",
        "دریافت پشتیبان رمزگذاری‌شده",
      ),
      exact: true,
    });
    await expect(backup).toBeDisabled();
    await guide
      .getByLabel(
        words(
          locale,
          "Transfer secret (8+ characters)",
          "رمز انتقال (حداقل ۸ نویسه)",
        ),
        { exact: true },
      )
      .fill("test-only-backup-secret");
    const download = page.waitForEvent("download");
    await backup.click();
    expect((await download).suggestedFilename()).toMatch(/private\.tourney$/);
    await expect(page.locator(".share-feedback")).toContainText(
      words(locale, "Private backup downloaded", "پشتیبان خصوصی دریافت شد"),
    );
  });

  test(`${locale}: copy feedback identifies the item and links open an independent preview`, async ({
    page,
    browser,
  }) => {
    const tournament = await fixture(page, locale);
    await page.locator(".share-advanced > summary").click();
    await page
      .getByRole("button", {
        name: words(locale, "Generate link & code", "ساخت پیوند و کد"),
        exact: true,
      })
      .click();
    const output = page.locator(".output-panel");
    await expect(output).toBeFocused();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.clipboardTest = value;
          },
        },
      });
    });
    const link = await output
      .getByLabel(words(locale, "Snapshot link", "پیوند نسخه مسابقات"), {
        exact: true,
      })
      .inputValue();
    await output
      .getByRole("button", {
        name: words(locale, "Copy link", "کپی پیوند"),
        exact: true,
      })
      .click();
    await expect(
      output.getByRole("button", {
        name: words(locale, "Link copied", "پیوند کپی شد"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      output.getByRole("button", {
        name: words(locale, "Copy code", "کپی کد"),
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.locator("html").getAttribute("data-clipboard-test")).toBe(
      link,
    );
    await output
      .getByRole("button", {
        name: words(locale, "Copy code", "کپی کد"),
        exact: true,
      })
      .click();
    await expect(
      output.getByRole("button", {
        name: words(locale, "Code copied", "کد کپی شد"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      output.getByRole("button", {
        name: words(locale, "Copy link", "کپی پیوند"),
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.locator("html").getAttribute("data-clipboard-test"),
    ).toMatch(/^TS1:/);
    const context = await browser.newContext();
    try {
      await context.addInitScript(
        (language) => localStorage.setItem("tournastudio-locale", language),
        locale,
      );
      const recipient = await context.newPage();
      await recipient.goto(link);
      const preview = recipient.getByRole("dialog");
      await expect(
        preview.getByRole("heading", { name: tournament.title, exact: true }),
      ).toHaveAttribute("dir", "auto");
      await expect(
        preview.getByRole("button", {
          name: words(locale, "Save local copy", "ذخیره کپی محلی"),
          exact: true,
        }),
      ).toBeEnabled();
      await expect(preview.locator(".import-choice-help")).toContainText(
        words(locale, "later updates", "به‌روزرسانی"),
      );
      expect(recipient.url()).not.toContain("TS1");
    } finally {
      await context.close();
    }
  });

  test(`${locale}: import explains duplicate choices and preserves both tournaments`, async ({
    page,
  }) => {
    const tournament = await fixture(page, locale);
    const originalUrl = page.url();
    await page
      .getByRole("button", {
        name: words(locale, "Import a package", "وارد کردن فایل یا کد"),
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "tournament.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tournament)),
    });
    await dialog
      .getByRole("button", {
        name: words(locale, "Preview import", "پیش‌نمایش ورود"),
        exact: true,
      })
      .click();
    await expect(dialog.locator(".import-choice-help")).toContainText(
      words(locale, "already saved", "از قبل"),
    );
    await expect(
      dialog.getByRole("button", {
        name: words(locale, "Save local copy", "ذخیره کپی محلی"),
        exact: true,
      }),
    ).toBeDisabled();
    const fork = dialog.getByRole("button", {
      name: words(
        locale,
        "Save as new tournament",
        "ذخیره به‌عنوان مسابقات تازه",
      ),
      exact: true,
    });
    await expect(fork).toBeEnabled();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      await expect(dialog.locator(".import-summary h3")).toHaveAttribute(
        "dir",
        "auto",
      );
    }
    await fork.click();
    await expect(dialog).not.toBeVisible();
    await expect(page).not.toHaveURL(originalUrl);
    await page.goto(originalUrl);
    await expect(
      page.getByRole("heading", { name: tournament.title, exact: true }),
    ).toBeVisible();
  });
}
