import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";

const testSecret = "synthetic-inactivity-test-secret";
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function protectedCup(page: Page) {
  await page.clock.install();
  let doc = createTournament("Private inactivity cup", [
    createParticipant("Secret first", 1),
    createParticipant("Secret second", 2),
  ]);
  doc = generateStage(doc, doc.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await modal
    .locator('input[type="file"]')
    .setInputFiles({
      name: "cup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(doc)),
    });
  await modal
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await saved(page);
  await section(page, "Settings");
  await expect(
    page.getByLabel("Lock after inactivity", { exact: true }),
  ).toHaveValue("15");
  await page
    .getByLabel("Lock after inactivity", { exact: true })
    .selectOption("1");
  await page.getByLabel("New vault secret", { exact: true }).fill(testSecret);
  await page
    .getByRole("button", { name: "Encrypt tournament & history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lock tournament now", exact: true }),
  ).toBeVisible();
  return page.url();
}
async function unlock(page: Page) {
  await page
    .getByRole("button", { name: "Protected tournament", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Unlock your tournament" });
  await modal.getByLabel("Vault secret", { exact: true }).fill(testSecret);
  await modal
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await saved(page);
}

test("locks private drafts after inactivity and preserves confirmed encrypted changes", async ({
  page,
}) => {
  await protectedCup(page);
  await page
    .getByLabel("Private description", { exact: true })
    .fill("Confirmed private record");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await saved(page);
  await page
    .getByLabel("Private description", { exact: true })
    .fill("Discard this unconfirmed draft");
  await page.clock.fastForward(61_000);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Private inactivity cup",
  );
  await unlock(page);
  await section(page, "Settings");
  await expect(
    page.getByLabel("Private description", { exact: true }),
  ).toHaveValue("Confirmed private record");
  await expect(
    page.getByLabel("Lock after inactivity", { exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("resets on user input but not incoming saves and respects an explicit off setting", async ({
  page,
  context,
}) => {
  const route = await protectedCup(page);
  const other = await context.newPage();
  await other.goto(route);
  const modal = other.getByRole("dialog", { name: "Unlock your tournament" });
  await modal.getByLabel("Vault secret", { exact: true }).fill(testSecret);
  await modal
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await saved(other);
  await page.clock.fastForward(40_000);
  await page
    .getByLabel("Private description", { exact: true })
    .fill("Active operator");
  await section(other, "Theme Studio");
  await page.clock.fastForward(40_000);
  await expect(page.locator(".workspace-page")).toBeVisible();
  await other
    .getByRole("button", { name: "Minimal Dark", exact: true })
    .click();
  await saved(other);
  await expect(page.locator(".workspace-page")).toHaveAttribute(
    "data-theme",
    "minimal-dark",
  );
  await page.clock.fastForward(21_000);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await other.close();
  await unlock(page);
  await section(page, "Settings");
  await page
    .getByLabel("Lock after inactivity", { exact: true })
    .selectOption("0");
  await page.clock.fastForward(3_600_000);
  await expect(page.locator(".workspace-page")).toBeVisible();
  await page.reload();
  const locked = page.getByRole("dialog", { name: "Unlock your tournament" });
  await locked.getByLabel("Vault secret", { exact: true }).fill(testSecret);
  await locked
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await saved(page);
  await section(page, "Settings");
  await expect(
    page.getByLabel("Lock after inactivity", { exact: true }),
  ).toHaveValue("0");
});

test("locks protected event overlays and does not reopen after a delayed encrypted save", async ({
  page,
}) => {
  await protectedCup(page);
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    let first = true;
    Object.defineProperty(crypto.subtle, "encrypt", {
      configurable: true,
      value: async (...args: Parameters<SubtleCrypto["encrypt"]>) => {
        if (first) {
          first = false;
          await new Promise<void>((resolve) => {
            (
              window as unknown as { releaseEncryption: () => void }
            ).releaseEncryption = resolve;
          });
        }
        return original(...args);
      },
    });
  });
  await page
    .getByLabel("Private description", { exact: true })
    .fill("Confirmed after lock");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saving...");
  await page.waitForFunction(() => typeof (window as unknown as { releaseEncryption?: () => void }).releaseEncryption === "function");
  await page.clock.fastForward(61_000);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { releaseEncryption: () => void }
    ).releaseEncryption(),
  );
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open("TournaStudio");
          request.onsuccess = () => resolve(request.result);
        });
        const value = await new Promise<number>((resolve) => {
          const request = database
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          request.onsuccess = () => resolve(request.result[0].revision);
        });
        database.close();
        return value;
      }),
    )
    .toBe(2);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await unlock(page);
  await section(page, "Settings");
  await expect(
    page.getByLabel("Private description", { exact: true }),
  ).toHaveValue("Confirmed after lock");
  await page.goto("/#/events");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  const create = page.getByRole("dialog", {
    name: "Create event",
    exact: true,
  });
  await create
    .getByLabel("New event title", { exact: true })
    .fill("Private inactive event");
  await create
    .getByLabel("Event vault secret (optional)", { exact: true })
    .fill(testSecret);
  await create
    .getByRole("button", { name: "Save new event", exact: true })
    .click();
  await expect(page.locator(".event-workspace")).toBeVisible();
  await page
    .getByRole("button", { name: "Duplicate for next season", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create next season", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.locator(".event-workspace")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Private inactive event",
  );
  await page.getByRole("button", { name: "Open event", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Unlock event", exact: true }),
  ).toBeVisible();
});
