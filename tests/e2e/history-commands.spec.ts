import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function fixture(page: Page) {
  let doc = createTournament(
    "Undo cup",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
  );
  doc.revision = 1;
  doc = generateStage(doc, doc.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "undo.json",
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
  await saved(page);
}
async function changeTheme(page: Page) {
  await section(page, "Theme Studio");
  await page.getByRole("button", { name: "Minimal Dark", exact: true }).click();
  await saved(page);
}
test("undoes and redoes confirmed changes through previews and clears on an external write", async ({
  page,
  context,
}) => {
  await fixture(page);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeDisabled();
  await changeTheme(page);
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "minimal-dark",
  );
  await page.locator(".workspace-title h1").click();
  await page.keyboard.press("Control+z");
  const review = page.getByRole("dialog", { name: "Review undo" });
  await expect(review).toContainText("Changed areas: Theme");
  await review
    .getByRole("button", { name: "Apply reviewed restoration", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  await saved(page);
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "minimal-light",
  );
  await expect(undo).toBeDisabled();
  await redo.click();
  await page
    .getByRole("dialog", { name: "Review redo" })
    .getByRole("button", { name: "Apply reviewed restoration", exact: true })
    .click();
  await saved(page);
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "minimal-dark",
  );
  await expect(undo).toBeEnabled();
  const other = await context.newPage();
  await other.goto(page.url());
  await saved(other);
  await section(other, "Theme Studio");
  await other.getByRole("button", { name: "Editorial", exact: true }).click();
  await saved(other);
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "editorial",
  );
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await other.close();
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(5);
  await page.reload();
  await saved(page);
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(5);
});

test("keeps Persian records and restoration controls inside a narrow viewport", async ({
  page,
}) => {
  await fixture(page);
  await changeTheme(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name: "آمار", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "رتبه الو و تاریخچه محلی", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "جدول پیش‌بینی و رتبه‌بندی محلی",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "واگرد", exact: true }).click();
  const review = page.getByRole("dialog", { name: "بررسی واگرد", exact: true });
  await expect(
    review.getByRole("button", {
      name: "اعمال بازیابی بررسی‌شده",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("blocks a restoration review when another tab changes the saved tournament", async ({
  page,
  context,
}) => {
  await fixture(page);
  await changeTheme(page);
  await section(page, "History");
  await page
    .locator(".revision-row")
    .filter({ hasText: "Revision 1" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Restore revision",
    exact: true,
  });
  const apply = review.getByRole("button", {
    name: "Apply reviewed restoration",
    exact: true,
  });
  await expect(apply).toBeEnabled();
  const other = await context.newPage();
  await other.goto(page.url());
  await saved(other);
  await section(other, "Theme Studio");
  await other.getByRole("button", { name: "Editorial", exact: true }).click();
  await saved(other);
  await expect(review).toContainText(
    "The saved tournament changed while this review was open.",
  );
  await expect(apply).toBeDisabled();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "editorial",
  );
  await other.close();
});
test("requires explicit played-match confirmation and preserves the undone result", async ({
  page,
}) => {
  await fixture(page);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const match = page.getByRole("dialog", { name: "Match control" });
  await match.locator('.score-entry input[type="number"]').nth(0).fill("3");
  await match.locator('.score-entry input[type="number"]').nth(1).fill("1");
  await match
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(match).not.toBeVisible();
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review undo" });
  const apply = review.getByRole("button", {
    name: "Apply reviewed restoration",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await expect(review).toContainText(
    "This restoration changes recorded or started matches.",
  );
  await review
    .getByLabel(
      "I reviewed the affected matches and accept restoring their earlier state",
      { exact: true },
    )
    .check();
  await apply.click();
  await expect(review).not.toBeVisible();
  await saved(page);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Review redo" })
    .getByRole("button", { name: "Apply reviewed restoration", exact: true })
    .click();
  await saved(page);
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(4);
  const target = page
    .locator(".revision-row")
    .filter({ hasText: "Revision 1" });
  await target.getByRole("button", { name: "Restore", exact: true }).click();
  const restore = page.getByRole("dialog", {
    name: "Restore revision",
    exact: true,
  });
  await expect(
    restore.getByRole("button", {
      name: "Apply reviewed restoration",
      exact: true,
    }),
  ).toBeDisabled();
  await restore
    .getByLabel(
      "I reviewed the affected matches and accept restoring their earlier state",
      { exact: true },
    )
    .check();
  await restore
    .getByRole("button", { name: "Apply reviewed restoration", exact: true })
    .click();
  await expect(restore).not.toBeVisible();
  await saved(page);
  await expect(page.locator(".revision-row")).toHaveCount(5);
});
