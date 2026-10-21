import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";

const dialogName = "Bring a tournament into your studio";
const transferSecret = "test-only-transfer-secret";
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
  let document = createTournament("Transfer tools cup", [
    createParticipant("تهران", 1),
    createParticipant("Team B", 2),
    createParticipant("Team C", 3),
    createParticipant("Team D", 4),
  ]);
  document.revision = 1;
  document.description = "Private initial description";
  document = generateStage(document, document.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "transfer.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  return document;
}

test("opens an embedded-key encrypted link on a fresh profile without a separate secret", async ({
  page,
  browser,
}) => {
  const document = await fixture(page);
  await section(page, "Share Center");
  await page
    .getByRole("button", {
      name: "Generate encrypted link with embedded key",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Portable code", { exact: true })).toHaveValue(
    /^TSK1:/,
  );
  const url = await page
    .getByLabel("Snapshot link", { exact: true })
    .inputValue();
  expect(url).toContain("TSK1");
  await expect(
    page.getByText("An embedded-key link includes its decryption key.", {
      exact: false,
    }),
  ).toBeVisible();
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto(url);
    const dialog = recipient.getByRole("dialog", { name: dialogName });
    await expect(
      dialog.getByRole("heading", { name: document.title, exact: true }),
    ).toBeVisible();
    expect(recipient.url()).not.toContain("TSK1");
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(recipient);
    await section(recipient, "Settings");
    await expect(
      recipient.getByLabel("Private description", { exact: true }),
    ).toHaveValue("");
    await recipient.reload();
    await saved(recipient);
    await expect(
      recipient.getByRole("heading", { name: document.title, exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("compares saved revisions and exports an encrypted history backup through the transfer assistant", async ({
  page,
  browser,
}) => {
  await fixture(page);
  await section(page, "Settings");
  await page.getByLabel("Title", { exact: true }).fill("Revised transfer cup");
  await page
    .getByLabel("Private description", { exact: true })
    .fill("Private later description");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await saved(page);
  await section(page, "History");
  const comparison = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Compare saved revisions",
        exact: true,
      }),
    });
  await comparison
    .getByRole("button", { name: "Compare revisions", exact: true })
    .click();
  await expect(
    comparison.locator("summary").filter({ hasText: /^Title/ }),
  ).toBeVisible();
  await expect(
    comparison.locator("summary").filter({ hasText: /^Description/ }),
  ).toHaveCount(0);
  await comparison
    .locator("summary")
    .filter({ hasText: /^Title/ })
    .click();
  await expect(
    comparison.getByText('"Transfer tools cup"', { exact: true }),
  ).toBeVisible();
  await expect(
    comparison.getByText('"Revised transfer cup"', { exact: true }),
  ).toBeVisible();
  await comparison
    .getByLabel("Include private organizer and referee details", {
      exact: true,
    })
    .check();
  await comparison
    .locator("summary")
    .filter({ hasText: /^Description/ })
    .click();
  await expect(
    comparison.getByText('"Private later description"', { exact: true }),
  ).toBeVisible();
  await section(page, "Share Center");
  await page
    .getByLabel("What do you want to transfer?", { exact: true })
    .selectOption("backup");
  const prepare = page.getByRole("button", {
    name: "Prepare recommended transfer",
    exact: true,
  });
  await expect(prepare).toBeDisabled();
  await page
    .getByLabel("Transfer secret (8+ characters)", { exact: true })
    .fill(transferSecret);
  const downloadPromise = page.waitForEvent("download");
  await prepare.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto("/");
    await recipient
      .getByRole("button", { name: "Import & restore", exact: true })
      .click();
    const dialog = recipient.getByRole("dialog", { name: dialogName });
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({
        name: "history.tourney",
        mimeType: "application/octet-stream",
        buffer: bytes,
      });
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(dialog.getByText(/encrypted.*separate secret/i)).toBeVisible();
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill(transferSecret);
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByText(/2 saved revisions are included/),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(recipient);
    await section(recipient, "History");
    await expect(recipient.locator(".revision-row")).toHaveCount(2);
    await expect(
      recipient.getByRole("button", { name: "Lock", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("remembers local backup reminder preferences and clears reminders after a confirmed backup", async ({
  page,
}) => {
  const document = await fixture(page);
  await page.getByRole("link", { name: "Storage health", exact: true }).click();
  const enabled = page.getByLabel("Remind me to back up changed tournaments", {
    exact: true,
  });
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await page
    .getByLabel("Backup reminder interval", { exact: true })
    .selectOption("3");
  await expect(
    page.getByText("1 tournaments need a backup", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(enabled).toBeChecked();
  await expect(
    page.getByLabel("Backup reminder interval", { exact: true }),
  ).toHaveValue("3");
  await page.goto(`/#/t/${document.id}`);
  await saved(page);
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  await download;
  await expect(
    page.getByText("1 tournaments need a backup", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Storage health", exact: true }).click();
  await expect(
    page.getByText("No backup recorded", { exact: true }),
  ).toHaveCount(0);
  await expect(enabled).toBeChecked();
});
