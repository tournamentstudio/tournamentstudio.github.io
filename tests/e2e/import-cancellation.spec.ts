import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";

const dialogName = "Bring a tournament into your studio";
const testSecret = "synthetic-import-cancellation-secret";

function fixture(title: string) {
  return createTournament(title, [
    createParticipant("سپهر Team A", 1),
    createParticipant("Team B", 2),
  ]);
}

async function importPreview(page: Page, value: ReturnType<typeof fixture>) {
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill(JSON.stringify(value));
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: value.title, exact: true }),
  ).toBeVisible();
  return dialog;
}

async function beginPendingCorrection(page: Page) {
  const incoming = fixture("Private imported schedule");
  incoming.schedule.startAt = "2026-10-29T18:00";
  incoming.timezone = "Asia/Tehran";
  const dialog = await importPreview(page, incoming);
  await dialog.getByRole("button", { name: "Use UTC", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    let completed = 0;
    crypto.subtle.digest = async (
      ...args: Parameters<SubtleCrypto["digest"]>
    ) => {
      calls++;
      document.documentElement.dataset.importDigestCalls = String(calls);
      if (calls === 1)
        await new Promise<void>((resolve) => {
          document.addEventListener(
            "release-import-preparation",
            () => resolve(),
            { once: true },
          );
        });
      const result = await original(...args);
      document.documentElement.dataset.importDigestCompleted = String(
        ++completed,
      );
      return result;
    };
  });
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-import-digest-calls",
    "1",
  );
  return dialog;
}

async function finishCanceledPreparation(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-import-preparation")),
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-import-digest-completed",
    "2",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  // Preparation hashes the original and corrected snapshots. A third hash
  // would mean the canceled operation reached repository.createWithHistory.
  await expect(page.locator("html")).toHaveAttribute(
    "data-import-digest-calls",
    "2",
  );
  return storedCount(page);
}

async function storedCount(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database
          .transaction("documents")
          .objectStore("documents")
          .count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test("closing a pending timezone import prevents a later save or closing a new preview", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await beginPendingCorrection(page);
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: dialogName })).toBeVisible();
  expect(await finishCanceledPreparation(page)).toBe(0);
  await expect(page.getByRole("dialog", { name: dialogName })).toBeVisible();
  await expect(page.locator(".workspace-page")).toHaveCount(0);
});

test("automatic vault lock cancels a pending timezone import before it can save or reopen", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const original = fixture("Private existing tournament");
  const dialog = await importPreview(page, original);
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
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
  await beginPendingCorrection(page);
  await page.clock.fastForward(61_000);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await finishCanceledPreparation(page)).toBe(1);
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(original.title);
  await expect(page.locator("body")).not.toContainText(
    "Private imported schedule",
  );
});

test("a started encrypted import can finish without reopening a dismissed importer", async ({
  page,
}) => {
  await page.goto("/");
  const original = fixture("Private delayed import");
  const dialog = await importPreview(page, original);
  await dialog
    .getByLabel("Save in a protected local vault", { exact: true })
    .check();
  await dialog
    .getByLabel("Vault secret (8+ characters)", { exact: true })
    .fill(testSecret);
  await page.evaluate(() => {
    const originalEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let first = true;
    crypto.subtle.encrypt = async (
      ...args: Parameters<SubtleCrypto["encrypt"]>
    ) => {
      if (first) {
        first = false;
        document.documentElement.dataset.importEncryptionPending = "true";
        await new Promise<void>((resolve) => {
          document.addEventListener(
            "release-import-encryption",
            () => resolve(),
            { once: true },
          );
        });
      }
      return originalEncrypt(...args);
    };
  });
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-import-encryption-pending",
    "true",
  );
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill("Keep this new import draft");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-import-encryption")),
  );
  await expect.poll(() => storedCount(page)).toBe(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Import code", { exact: true })).toHaveValue(
    "Keep this new import draft",
  );
  await expect(page.locator(".workspace-page")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(original.title);
});
