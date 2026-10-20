import { expect, test, type Page } from "@playwright/test";

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

async function createGol(page: Page) {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Courtyard cup");
  await page.getByLabel("Sport or activity").selectOption("gol-ya-pooch");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Competition format")
    .selectOption("single-elimination");
  await page.getByLabel("Participant count", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Game theme suggestions" })
      .getByRole("button"),
  ).toHaveCount(8);
  await page
    .getByRole("group", { name: "Game theme suggestions" })
    .getByRole("button", { name: "Gol Ya Pooch Courtyard", exact: true })
    .click();
  await expect(page.locator(".creation-theme-preview")).toHaveAttribute(
    "data-theme",
    "gol-turquoise",
  );
  await expect(
    page.locator(".creation-theme-preview .theme-motif").first(),
  ).toHaveAttribute("data-motif", "gol-arch");
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await saved(page);
}

test("keeps game collections searchable and persists a selected theme", async ({
  page,
}) => {
  await createGol(page);
  await expect(page.locator(".game-workspace")).toHaveAttribute(
    "data-theme",
    "gol-turquoise",
  );
  await section(page, "Theme Studio");
  await expect(page.locator(".theme-choice")).toHaveCount(8);
  await page.getByLabel("Search themes", { exact: true }).fill("velvet");
  await expect(page.locator(".theme-choice")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Gol Ya Pooch Velvet", exact: true })
    .click();
  await saved(page);
  await page.getByLabel("Search themes", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Show all 50 themes", exact: true })
    .click();
  await expect(page.locator(".theme-choice")).toHaveCount(50);
  await page.getByLabel("Search themes", { exact: true }).fill("badminton");
  await expect(page.locator(".theme-choice")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".game-workspace")).toHaveAttribute(
    "data-theme",
    "gol-velvet",
  );
  await section(page, "Theme Studio");
  await expect(
    page.getByRole("button", { name: "Gol Ya Pooch Velvet", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("uses equal public emblems and target progress in Gol scorekeeping", async ({
  page,
}) => {
  await createGol(page);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await expect(
    dialog.locator(".game-match-banner .theme-motif"),
  ).toHaveAttribute("data-motif", "gol-arch");
  await expect(dialog.locator(".score-side .theme-motif")).toHaveCount(2);
  const leftArt = await dialog
    .locator(".score-side .theme-motif")
    .nth(0)
    .innerHTML();
  const rightArt = await dialog
    .locator(".score-side .theme-motif")
    .nth(1)
    .innerHTML();
  expect(leftArt).toBe(rightArt);
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("4");
  await expect(
    dialog.locator(".gol-target-track progress").nth(0),
  ).toHaveAttribute("value", "4");
  await expect(
    dialog.locator(".gol-target-track progress").nth(0),
  ).toHaveAttribute("max", "6");
  await dialog
    .getByRole("button", { name: "Referee mode", exact: true })
    .click();
  await dialog
    .getByLabel("Concealed position (private)", { exact: true })
    .fill("PRIVATE-TABLE-POSITION");
  expect(
    await dialog.locator(".score-side .theme-motif").nth(0).innerHTML(),
  ).toBe(leftArt);
  await expect(dialog.locator(".game-match-banner")).not.toContainText(
    "PRIVATE-TABLE-POSITION",
  );
  await dialog
    .getByRole("button", { name: "Quick scorekeeping", exact: true })
    .click();
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("6");
  await dialog.locator('.score-entry input[type="number"]').nth(1).fill("2");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await expect(page.locator(".game-workspace")).toHaveAttribute(
    "data-theme",
    "gol-turquoise",
  );
});

test("shows Persian theme search on a narrow screen without overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createGol(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name: "استودیو تم", exact: true })
    .click();
  await expect(page.locator(".theme-studio")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("جستجوی قالب‌ها", { exact: true }).fill("زعفران");
  await expect(page.locator(".theme-choice")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "گل یا پوچ زعفرانی", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("persian-theme-gallery.png"),
    fullPage: true,
  });
});
