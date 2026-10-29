import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Locale,
} from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const names = [
  `${"Tehran".repeat(25)} باشگاه آفتاب`,
  `${"شاهین".repeat(30)} University Team`,
  "دانشگاه تهران و یاران آفتاب Championship 2026",
  "Northern University Championship باشگاه شیراز",
];
const text = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;

async function openTournament(page: Page, locale: Locale) {
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
  let doc = createTournament(
    "University Championship جام آفتاب",
    names.map((name, index) => createParticipant(name, index + 1)),
  );
  doc.theme = { ...doc.theme, preset: "gol-traditional", reducedMotion: true };
  doc.presentation.autoRotate = false;
  doc.presentation.scenes = ["participants", "results", "schedule"].map(
    (type) => ({
      id: type,
      type: type as "participants" | "results" | "schedule",
      title: "",
      text: "",
      duration: 15,
    }),
  );
  doc = simulate(generateStage(doc, doc.stages[0].id));
  doc.schedule.resources[0].name = `${"Field".repeat(16)} زمین دانشگاه`;
  for (const [index, match] of doc.matches.entries()) {
    match.scheduledAt = new Date(
      Date.UTC(2027, 0, 1, 10 + index),
    ).toISOString();
    match.resourceId = doc.schedule.resources[0].id;
    if (match.result)
      match.result.scores = match.slots.map((slot) =>
        match.result!.winnerIds.includes(slot.participantId!)
          ? 123456789
          : 98765432,
      );
  }
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", {
      name: text(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(page.locator(".save-status")).toHaveText(
    text(locale, "Saved locally", "محلی ذخیره شد"),
  );
  await page
    .getByRole("navigation", {
      name: text(locale, "Tournament sections", "بخش‌های مسابقات"),
    })
    .getByRole("button", {
      name: text(locale, "Presentation", "نمایش"),
      exact: true,
    })
    .click();
  return doc;
}

for (const locale of ["en", "fa"] as const)
  test(`${locale} presentation lists contain long mixed-script names and score pairs`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const doc = await openTournament(page, locale);
    for (const active of [locale, locale === "en" ? "fa" : "en"] as const) {
      if (active !== locale)
        await page
          .getByRole("button", {
            name: text(locale, "Switch to Persian", "تغییر به انگلیسی"),
            exact: true,
          })
          .click();
      await page
        .getByRole("button", {
          name: text(active, "Preview presentation", "پیش‌نمایش"),
          exact: true,
        })
        .click();
      const display = page.locator(".presentation-shell");
      await expect(display).toHaveAttribute(
        "dir",
        active === "fa" ? "rtl" : "ltr",
      );
      for (const [index, selector] of [
        ".presentation-team-list",
        ".presentation-result-list",
        ".presentation-result-list",
      ].entries()) {
        const list = display.locator(selector);
        await expect(list).toBeVisible();
        for (const name of names) await expect(list).toContainText(name);
        if (index === 0) await expect(list.locator("bdi")).toHaveText(names);
        if (index === 1)
          await expect(list.locator("strong")).toHaveText(
            doc.matches
              .slice()
              .reverse()
              .map((match) =>
                match
                  .result!.scores.map((score) => score.toLocaleString(active))
                  .join(" : "),
              ),
          );
        if (index === 2)
          await expect(list.locator("small")).toHaveText(
            doc.matches.map(() => doc.schedule.resources[0].name),
          );
        await page.evaluate(() => document.fonts.ready);
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const overflow = await list.evaluate((list) => {
            const failures: string[] = [];
            const listBox = list.getBoundingClientRect();
            for (const [index, card] of Array.from(list.children).entries()) {
              const box = card.getBoundingClientRect();
              if (box.left < listBox.left - 1 || box.right > listBox.right + 1)
                failures.push(`Card ${index} extends beyond the list`);
              for (const child of Array.from(card.children)) {
                const content = child.getBoundingClientRect();
                if (
                  content.left < box.left - 1 ||
                  content.right > box.right + 1
                )
                  failures.push(
                    `Card ${index} content extends beyond the card: ${child.tagName}`,
                  );
              }
            }
            return failures;
          });
          expect.soft(overflow).toEqual([]);
          expect
            .soft(
              await display.evaluate(
                (element) => element.scrollWidth - element.clientWidth,
              ),
            )
            .toBeLessThanOrEqual(1);
          await display.screenshot({
            path: testInfo.outputPath(
              `presentation-${active}-${index}-${width}.png`,
            ),
          });
        }
        await page
          .getByRole("button", {
            name: text(active, "Next scene", "نمای بعدی"),
            exact: true,
          })
          .click();
      }
      await page.keyboard.press("Escape");
      await expect(display).toHaveCount(0);
    }
  });
