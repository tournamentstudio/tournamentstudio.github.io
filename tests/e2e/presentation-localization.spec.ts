import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Locale,
  type Tournament,
} from "../../src/domain/types";
import { defaultOverlay } from "../../src/domain/display-options";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const names = [
  "باشگاه دانشگاه تهران Alpha",
  "باشگاه اصفهان Beta",
  "شیراز Gamma",
  "تبریز Delta",
];
const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function openTournament(page: Page, doc: Tournament, locale: Locale) {
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", {
      name: text(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(page.locator(".workspace-title h1")).toHaveText(doc.title);
  await expect(page.locator(".save-status")).toHaveText(
    text(locale, "Saved locally", "محلی ذخیره شد"),
  );
  return page.url().split("#/t/")[1];
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} presentation localizes labels and keeps scene keys separate from bracket and table keys`, async ({
    page,
  }) => {
    const draft = createTournament(
      "جام دانشگاه",
      names.map((name, index) => createParticipant(name, index + 1)),
    );
    draft.locale = locale;
    draft.presentation.autoRotate = false;
    draft.presentation.scenes = [
      { id: "schedule", type: "schedule", title: "", text: "", duration: 15 },
      {
        id: "countdown",
        type: "countdown",
        title: "",
        text: "307",
        duration: 15,
      },
      { id: "bracket", type: "bracket", title: "", text: "", duration: 15 },
      { id: "standings", type: "standings", title: "", text: "", duration: 15 },
      { id: "rules", type: "rules", title: "", text: "", duration: 15 },
    ];
    const doc = generateStage(draft, draft.stages[0].id);
    doc.matches[0].scheduledAt = "2027-01-01T10:00:00.000Z";
    doc.matches[1].scheduledAt = "2027-01-01T11:00:00.000Z";
    doc.matches[1].label = "Tehran / دیدار ویژه";
    const id = await openTournament(page, doc, locale);
    await page.goto(`/#/present/${id}`);
    const display = page.getByRole("dialog", {
      name: text(locale, "Tournament presentation", "نمایش مسابقات"),
      exact: true,
    });
    const heading = display.locator(".presentation-scene-heading h1");
    await expect(display.locator(".presentation-result-list")).toContainText(
      text(locale, "R1 M1", "دور ۱، بازی ۱"),
    );
    await expect(display.locator(".presentation-result-list")).toContainText(
      "Tehran / دیدار ویژه",
    );
    const next = display.getByRole("button", {
      name: text(locale, "Next scene", "نمای بعدی"),
      exact: true,
    });
    const previous = display.getByRole("button", {
      name: text(locale, "Previous scene", "نمای قبلی"),
      exact: true,
    });
    await expect(next).toHaveText(locale === "fa" ? "←" : "→");
    await expect(previous).toHaveText(locale === "fa" ? "→" : "←");
    await next.click();
    const countdown = display.locator(".countdown-time");
    await expect(countdown).toHaveAttribute("dir", "ltr");
    await expect(countdown).toHaveText(
      locale === "fa" ? /^[۰-۹]+:[۰-۹]{2}$/ : /^\d+:\d{2}$/,
    );
    await display.focus();
    await page.keyboard.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
    await expect(heading).toHaveText(
      text(locale, "Tournament bracket", "جدول مسابقات"),
    );
    const bracket = display.locator(".bracket-scroll");
    await bracket.focus();
    await bracket.press("ArrowRight");
    await expect(heading).toHaveText(
      text(locale, "Tournament bracket", "جدول مسابقات"),
    );
    await next.click();
    await expect(heading).toHaveText(text(locale, "Standings", "رده‌بندی"));
    const table = display.getByRole("region", {
      name: text(locale, "Scrollable standings", "جدول قابل پیمایش"),
    });
    await table.focus();
    await table.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
    await expect(heading).toHaveText(text(locale, "Standings", "رده‌بندی"));
    await display.focus();
    await page.keyboard.press(locale === "fa" ? "ArrowLeft" : "ArrowRight");
    await expect(heading).toHaveText(text(locale, "Rules", "قوانین"));
    await expect(display.locator(".presentation-prose")).toContainText(
      `${text(locale, "Win points", "امتیاز برد")}: ${doc.rules.pointsWin.toLocaleString(locale)}`,
    );
    await page.keyboard.press(locale === "fa" ? "ArrowRight" : "ArrowLeft");
    await expect(heading).toHaveText(text(locale, "Standings", "رده‌بندی"));
    await page.keyboard.press("Escape");
    await expect(display).toHaveCount(0);
  });

  test(`${locale} broadcast announces confirmed score changes without exposing private notes`, async ({
    page,
    context,
  }) => {
    const draft = createTournament(
      "جام دانشگاه",
      names
        .slice(0, 2)
        .map((name, index) => createParticipant(name, index + 1)),
    );
    draft.locale = locale;
    draft.presentation.overlay = { ...defaultOverlay, enabled: true };
    const doc = generateStage(draft, draft.stages[0].id);
    doc.matches[0].private = { concealedPosition: "REFEREE-ONLY-POSITION" };
    const id = await openTournament(page, doc, locale);
    const display = await context.newPage();
    await display.goto(`/#/present/${id}`);
    const announcement = display
      .locator(".broadcast-overlay")
      .getByRole("status");
    await expect(announcement).toHaveAttribute("aria-atomic", "true");
    await expect(announcement).toContainText(
      `${names[0]}: ${(0).toLocaleString(locale)}`,
    );
    await page
      .getByRole("navigation", {
        name: text(locale, "Tournament sections", "بخش‌های مسابقات"),
      })
      .getByRole("button", {
        name: text(locale, "Matches", "دیدارها"),
        exact: true,
      })
      .click();
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
    await expect(announcement).toContainText(
      `${names[0]}: ${(4).toLocaleString(locale)}`,
    );
    await expect(announcement).toContainText(
      `${names[1]}: ${(2).toLocaleString(locale)}`,
    );
    await expect(display.locator(".presentation-shell")).not.toContainText(
      "REFEREE-ONLY-POSITION",
    );
  });
}
