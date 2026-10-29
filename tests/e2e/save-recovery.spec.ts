import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode, importArchive } from "../../src/sharing";

async function failedSave(page: Page, pending = false) {
  const draft = createTournament("Saved recovery cup", [
    createParticipant("شاهین Team", 1),
    createParticipant("Phoenix هما", 2),
  ]);
  const tournament = generateStage(draft, draft.stages[0].id);
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeCode(tournament))}`,
  );
  await page
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.evaluate((delay) => {
    if (delay) {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let first = true;
      crypto.subtle.digest = async (
        ...args: Parameters<SubtleCrypto["digest"]>
      ) => {
        if (first) {
          first = false;
          document.documentElement.dataset.savePending = "true";
          await new Promise<void>((resolve) => {
            document.addEventListener("release-save", () => resolve(), {
              once: true,
            });
          });
        }
        return digest(...args);
      };
    }
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "documents")
        throw new DOMException(
          "Test storage quota reached",
          "QuotaExceededError",
        );
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  }, pending);
  await page
    .getByLabel("Title", { exact: true })
    .fill("نسخه بازیابی Recovery copy");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  if (pending)
    await expect(page.locator("html")).toHaveAttribute(
      "data-save-pending",
      "true",
    );
  else
    await expect(
      page.getByRole("button", { name: "Export unsaved copy", exact: true }),
    ).toBeVisible();
  return tournament.id;
}

test("pending saves block internal departure and competing imports until recovery is available", async ({
  page,
}) => {
  const id = await failedSave(page, true);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/t/${id}$`));
  await expect(
    page.getByText("Wait for the current save before leaving.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const other = createTournament("A different competition", [
    createParticipant("One", 1),
    createParticipant("Two", 2),
  ]);
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill(await encodeCode(other));
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(
    dialog.getByText("Wait for the current save before importing changes.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.press("Escape");
  await page.evaluate(() => document.dispatchEvent(new Event("release-save")));
  await expect(
    page.getByRole("button", { name: "Export unsaved copy", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/t/${id}$`));
});

test("failed saves survive canceled reload and navigation, and export the attempted edit", async ({
  page,
}) => {
  const id = await failedSave(page);
  const warning = page.waitForEvent("dialog").then(async (dialog) => {
    const type = dialog.type();
    await dialog.dismiss();
    return type;
  });
  await page.evaluate(() => location.reload());
  expect(await warning).toBe("beforeunload");
  await expect(page).toHaveURL(new RegExp(`#/t/${id}$`));
  await page.getByRole("link", { name: "Home", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Leave without the unsaved copy?",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/t/${id}$`));
  await confirm.getByRole("button", { name: "Stay here", exact: true }).click();
  const nextDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export unsaved copy", exact: true })
    .click();
  const download = await nextDownload;
  const restored = await importArchive(
    new Uint8Array(await readFile((await download.path())!)),
  );
  expect(restored.title).toBe("نسخه بازیابی Recovery copy");
  expect(restored.id).toBe(id);
  await page
    .getByRole("button", { name: "Reload saved version", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export unsaved copy", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Saved recovery cup",
  );
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Let the games begin.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Persian recovery navigation can explicitly discard without deleting the saved tournament", async ({
  page,
}, testInfo) => {
  await failedSave(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    location.hash = "/library";
  });
  const confirm = page.getByRole("dialog", {
    name: "خروج بدون نسخه ذخیره‌نشده؟",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  const bounds = await confirm.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath("persian-recovery.png"),
    animations: "disabled",
  });
  await confirm
    .getByRole("button", { name: "صرف‌نظر و خروج", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Saved recovery cup", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("نسخه بازیابی Recovery copy", { exact: true }),
  ).toHaveCount(0);
});
