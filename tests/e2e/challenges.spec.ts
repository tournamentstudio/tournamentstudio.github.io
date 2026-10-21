import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";

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
async function setup(page: Page, mode: "invitations" | "king-of-hill") {
  const doc = createTournament(
    "Challenge policy cup",
    Array.from({ length: 5 }, (_, index) =>
      createParticipant(`Player ${index + 1}`, index + 1),
    ),
    "ladder",
  );
  doc.revision = 1;
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
      name: "challenge.json",
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
  await section(page, "Structure");
  await page.getByLabel("Challenge policy", { exact: true }).selectOption(mode);
  await saved(page);
  await section(page, "Matches");
  await page
    .getByRole("button", { name: "Initialize challenge stage", exact: true })
    .click();
  await saved(page);
}
async function invite(page: Page, challenger: string, opponent: string) {
  await page
    .getByLabel("Challenger", { exact: true })
    .selectOption({ label: challenger });
  await page
    .getByLabel("Challenged entrant", { exact: true })
    .selectOption({ label: opponent });
  await page
    .getByLabel("Private challenge note", { exact: true })
    .fill("Private local invitation");
  await page
    .getByRole("button", { name: "Create challenge invitation", exact: true })
    .click();
  await saved(page);
}
async function result(page: Page, challengerWins: boolean) {
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog
    .locator('.score-entry input[type="number"]')
    .nth(0)
    .fill(challengerWins ? "0" : "2");
  await dialog
    .locator('.score-entry input[type="number"]')
    .nth(1)
    .fill(challengerWins ? "2" : "0");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}
test("approves, declines and cancels invitations, then updates ranks from a real result", async ({
  page,
}) => {
  await setup(page, "invitations");
  await invite(page, "Player 5", "Player 1");
  await page
    .getByRole("button", { name: "Approve challenge", exact: true })
    .click();
  await saved(page);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Cancel challenge", exact: true })
    .click();
  await saved(page);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(0);
  await invite(page, "Player 4", "Player 1");
  await page
    .getByRole("button", { name: "Decline challenge", exact: true })
    .click();
  await saved(page);
  await invite(page, "Player 3", "Player 1");
  await page
    .getByRole("button", { name: "Approve challenge", exact: true })
    .click();
  await saved(page);
  await result(page, true);
  await page.getByText("Current ladder ranks", { exact: true }).click();
  await expect(
    page
      .locator("details")
      .filter({ has: page.getByText("Current ladder ranks", { exact: true }) })
      .locator("li")
      .first(),
  ).toHaveText("Player 3");
  await page.reload();
  await saved(page);
  await section(page, "Matches");
  await expect(page.locator(".challenge-invitations tbody tr")).toHaveCount(3);
  await expect(page.locator(".challenge-invitations tbody")).toContainText(
    "Result recorded",
  );
  await expect(page.locator(".challenge-invitations tbody")).toContainText(
    "Declined",
  );
  await expect(page.locator(".challenge-invitations tbody")).toContainText(
    "Canceled",
  );
  await page
    .getByRole("button", { name: "Close challenge stage", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Close challenge stage", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByText("This challenge stage is completed.", { exact: false }),
  ).toBeVisible();
});
test("moves the losing incumbent to the back of a saved King of the Hill queue", async ({
  page,
}) => {
  await setup(page, "king-of-hill");
  await result(page, false);
  const queue = page
    .locator("details")
    .filter({
      has: page.getByText("Incumbent and waiting order", { exact: true }),
    })
    .locator("li");
  await expect(queue.nth(0)).toHaveText("Player 1 (Incumbent)");
  await expect(queue.nth(1)).toHaveText("Player 3");
  await expect(queue.nth(4)).toHaveText("Player 2");
  await page
    .getByRole("button", { name: "Start next queue challenge", exact: true })
    .click();
  await saved(page);
  await result(page, true);
  await expect(queue.nth(0)).toHaveText("Player 3 (Incumbent)");
  await expect(queue.nth(4)).toHaveText("Player 1");
  await page.reload();
  await saved(page);
  await section(page, "Matches");
  await expect(queue.nth(0)).toHaveText("Player 3 (Incumbent)");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "صف پادشاه میدان", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
