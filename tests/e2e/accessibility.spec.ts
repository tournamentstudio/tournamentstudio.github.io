import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home supports keyboard entry and has no detected AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let the games begin." }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("operator sections and score dialog pass automated AA checks", async ({
  page,
}) => {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Accessible cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page.locator(".workspace-title h1")).toHaveText(
    "Accessible cup",
  );
  for (const section of [
    "Overview",
    "Matches",
    "Participants",
    "Standings",
    "Theme Studio",
    "Presentation",
    "Share Center",
  ]) {
    await page
      .getByRole("navigation", { name: "Tournament sections" })
      .getByRole("button", { name: section, exact: true })
      .click();
    await expect(page.locator(".loading-state")).toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations, `Accessibility in ${section}`).toEqual([]);
  }
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await expect(dialog).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
