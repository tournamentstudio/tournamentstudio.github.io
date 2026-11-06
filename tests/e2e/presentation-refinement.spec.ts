import { expect, test } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

for (const locale of ["en", "fa"] as const)
  test(`${locale} mobile playlist keeps scene fields usable and sponsor drafts intact`, async ({
    page,
  }) => {
    const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    let doc = createTournament(
      "Northside cup / جام آفتاب",
      ["North", "South", "East", "West"].map((name, index) =>
        createParticipant(name, index + 1),
      ),
    );
    doc = generateStage(doc, doc.stages[0].id);
    await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
    await page
      .getByRole("button", {
        name: t("Save local copy", "ذخیره کپی محلی"),
        exact: true,
      })
      .click();
    const saved = () =>
      expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
    await saved();
    await page
      .getByRole("navigation", {
        name: t("Tournament sections", "بخش‌های مسابقات"),
      })
      .getByRole("button", { name: t("Presentation", "نمایش"), exact: true })
      .click();
    const scene = page.locator(".scene-editor").first();
    const title = scene.getByLabel(t("Title", "عنوان"), { exact: true });
    await expect(title).toBeVisible();
    const cardBounds = (await scene.boundingBox())!;
    const titleBounds = (await title.boundingBox())!;
    expect(titleBounds.width).toBeGreaterThan(cardBounds.width * 0.6);
    const fields = (await scene.locator(".scene-editor-fields").boundingBox())!;
    const actions = (await scene.locator(".scene-actions").boundingBox())!;
    expect(actions.y).toBeGreaterThanOrEqual(fields.y + fields.height);

    await page
      .getByRole("button", {
        name: t("Add sponsor card", "افزودن کارت حامی"),
        exact: true,
      })
      .click();
    const sponsorName = page.getByLabel(t("Sponsor name", "نام حامی"), {
      exact: true,
    });
    await sponsorName.fill("Sun Partners / همراهان آفتاب");
    await title.fill("Final session / بخش پایانی");
    await saved();
    await expect(sponsorName).toHaveValue("Sun Partners / همراهان آفتاب");
    await page
      .getByRole("button", {
        name: t("Save sponsor cards", "ذخیره کارت حامیان"),
        exact: true,
      })
      .click();
    await expect(page.locator(".save-status")).toHaveText(
      t("Saved locally", "محلی ذخیره شد"),
    );
    await saved();
    await page.reload();
    await page
      .getByRole("navigation", {
        name: t("Tournament sections", "بخش‌های مسابقات"),
      })
      .getByRole("button", { name: t("Presentation", "نمایش"), exact: true })
      .click();
    await expect(sponsorName).toHaveValue("Sun Partners / همراهان آفتاب");
    await expect(title).toHaveValue("Final session / بخش پایانی");
  });
