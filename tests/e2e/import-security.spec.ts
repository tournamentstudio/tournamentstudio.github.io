import { expect, test, type Page } from "@playwright/test";

const archiveSecret = "test-only-archive-secret";
const originalVaultSecret = "test-only-original-vault-secret";

async function createTournament(page: Page, vaultSecret?: string) {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Replacement security cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Participant count", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (vaultSecret) {
    await page.getByLabel("Keep this tournament in a protected vault").check();
    await page.getByLabel("Vault secret", { exact: true }).fill(vaultSecret);
  }
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Replacement security cup",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  return page.url().split("/").at(-1)!;
}

async function currentRecord(page: Page, id: string) {
  return page.evaluate(async (documentId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{
        protected: boolean;
        revision: number;
        serialized: string;
      }>((resolve, reject) => {
        const request = database
          .transaction("documents", "readonly")
          .objectStore("documents")
          .get(documentId);
        request.onsuccess = () =>
          resolve({
            protected: request.result.protected,
            revision: request.result.revision,
            serialized: JSON.stringify(request.result),
          });
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, id);
}

async function previewEncryptedBackup(page: Page) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Share Center", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Protection/ })
    .selectOption("encrypted");
  await page
    .getByLabel("Separate sharing secret (8+ characters)", { exact: true })
    .fill(archiveSecret);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  await page
    .getByRole("button", { name: "Import a package", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "protected-backup.tourney",
    mimeType: "application/octet-stream",
    buffer: await (await import("node:fs/promises")).readFile(path!),
  });
  await dialog
    .getByLabel("Separate secret, if encrypted", { exact: true })
    .fill(archiveSecret);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByText("This is a read-only preview.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Save in a protected local vault"),
  ).toBeChecked();
  await expect(
    dialog.getByText("Replacing a copy keeps its existing vault settings", {
      exact: false,
    }),
  ).toBeVisible();
  return dialog;
}

test("rejects a protected replacement into standard storage before writing and permits a protected fork", async ({
  page,
}) => {
  const originalId = await createTournament(page);
  const before = await currentRecord(page, originalId);
  expect(before.protected).toBe(false);
  const dialog = await previewEncryptedBackup(page);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog
    .getByRole("button", { name: "Replace current copy", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Protect the current tournament first",
  );
  const unchanged = await currentRecord(page, originalId);
  expect(unchanged.revision).toBe(before.revision);
  expect(unchanged.protected).toBe(false);
  await dialog
    .getByRole("button", { name: "Fork with new identity", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const forkId = page.url().split("/").at(-1)!;
  expect(forkId).not.toBe(originalId);
  const fork = await currentRecord(page, forkId);
  expect(fork.protected).toBe(true);
  expect(fork.serialized).not.toContain("Replacement security cup");
  expect((await currentRecord(page, originalId)).revision).toBe(
    before.revision,
  );
});

test("replacing an existing vault retains its original secret instead of the archive secret", async ({
  page,
}) => {
  const originalId = await createTournament(page, originalVaultSecret);
  const before = await currentRecord(page, originalId);
  const dialog = await previewEncryptedBackup(page);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog
    .getByRole("button", { name: "Replace current copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const replaced = await currentRecord(page, originalId);
  expect(replaced.protected).toBe(true);
  expect(replaced.revision).toBe(before.revision + 1);
  expect(replaced.serialized).not.toContain("Replacement security cup");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page
    .getByRole("button", { name: "Protected tournament", exact: true })
    .click();
  const unlock = page.getByRole("dialog", { name: "Unlock your tournament" });
  await unlock.getByLabel("Vault secret", { exact: true }).fill(archiveSecret);
  await unlock
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(unlock.getByRole("alert")).toContainText("Incorrect secret");
  await unlock
    .getByLabel("Vault secret", { exact: true })
    .fill(originalVaultSecret);
  await unlock
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(unlock).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Replacement security cup",
      exact: true,
    }),
  ).toBeVisible();
});
