import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";

async function open(page: Page) {
  const doc = createTournament(
    "Swiss acceleration",
    Array.from({ length: 8 }, (_, i) =>
      createParticipant(`بازیکن Player ${i + 1}`, i + 1),
    ),
    "swiss",
  );
  doc.stages[0].config.rounds = 4;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "swiss.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(doc)),
    });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Structure", exact: true })
    .click();
  const panel = page.locator(".swiss-policy-editor");
  await panel.locator(":scope > summary").click();
  return panel;
}
test("configures acceleration before drawing and preserves the locked group after reload", async ({
  page,
}) => {
  const panel = await open(page);
  await panel
    .getByLabel("Use temporary pairing points", { exact: true })
    .check();
  await panel
    .getByLabel("Accelerated opening rounds", { exact: true })
    .fill("1");
  await panel.getByLabel("Virtual pairing bonus", { exact: true }).fill("2");
  await panel.getByText("Fixed acceleration group", { exact: false }).click();
  await expect(
    panel.getByLabel("بازیکن Player 1", { exact: true }),
  ).toBeChecked();
  await expect(
    panel.getByLabel("بازیکن Player 5", { exact: true }),
  ).not.toBeChecked();
  await panel
    .getByRole("button", { name: "Apply Swiss policy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(
    panel.getByLabel("Use temporary pairing points", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Structure", exact: true })
    .click();
  await page.locator(".swiss-policy-editor > summary").click();
  await expect(
    page.getByLabel("Virtual pairing bonus", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Accelerated opening rounds", { exact: true }),
  ).toHaveValue("1");
});
test("Persian acceleration settings wrap at 320px and support keyboard input", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 900 });
  const checkbox = page.getByLabel("استفاده از امتیاز موقت زوج‌بندی", {
    exact: true,
  });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const findings = await new AxeBuilder({ page })
    .include(".swiss-policy-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(findings.violations).toEqual([]);
});
