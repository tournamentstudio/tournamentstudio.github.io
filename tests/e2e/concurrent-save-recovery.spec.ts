import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode, importArchive } from "../../src/sharing";

for (const failFirstSave of [false, true]) {
  test(`keeps a pending theme upload recoverable when the earlier save ${failFirstSave ? "fails" : "succeeds"}`, async ({
    page,
  }) => {
    const draft = createTournament("Theme recovery cup", [
      createParticipant("شاهین Team", 1),
      createParticipant("Phoenix هما", 2),
    ]);
    draft.theme.accent = "#112233";
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
      .getByRole("button", { name: "Theme Studio", exact: true })
      .click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 16;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#cc3311";
      context.fillRect(0, 0, 16, 16);
      return canvas.toDataURL("image/png");
    });
    await page.evaluate((fail) => {
      const decode = HTMLImageElement.prototype.decode;
      let firstImage = true;
      HTMLImageElement.prototype.decode = async function () {
        if (firstImage) {
          firstImage = false;
          document.documentElement.dataset.imagePending = "true";
          await new Promise<void>((resolve) => {
            document.addEventListener("release-image", () => resolve(), {
              once: true,
            });
          });
        }
        return decode.call(this);
      };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let firstSave = true;
      crypto.subtle.digest = async (
        ...args: Parameters<SubtleCrypto["digest"]>
      ) => {
        if (firstSave) {
          firstSave = false;
          document.documentElement.dataset.savePending = "true";
          await new Promise<void>((resolve) => {
            document.addEventListener("release-save", () => resolve(), {
              once: true,
            });
          });
        }
        return digest(...args);
      };
      if (fail) {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          if (this.name === "documents")
            throw new DOMException(
              "Test storage quota reached",
              "QuotaExceededError",
            );
          return key === undefined
            ? put.call(this, value)
            : put.call(this, value, key);
        };
      }
    }, failFirstSave);
    await page.getByLabel("Tournament logo", { exact: true }).setInputFiles({
      name: "local-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png.split(",")[1], "base64"),
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-image-pending",
      "true",
    );
    await page.getByLabel("Accent", { exact: true }).fill("#224466");
    await expect(page.locator("html")).toHaveAttribute(
      "data-save-pending",
      "true",
    );
    await expect(page.locator(".workspace-fieldset")).toHaveAttribute(
      "disabled",
      "",
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("release-image")),
    );
    const recovery = page.getByRole("button", {
      name: "Export unsaved copy",
      exact: true,
    });
    await expect(recovery).toBeVisible();
    await page.evaluate(() =>
      document.dispatchEvent(new Event("release-save")),
    );
    await expect(page.locator(".workspace-fieldset")).not.toHaveAttribute(
      "disabled",
    );
    await expect(recovery).toBeVisible();
    const downloading = page.waitForEvent("download");
    await recovery.click();
    const download = await downloading;
    const restored = await importArchive(
      new Uint8Array(await readFile((await download.path())!)),
    );
    expect(restored.id).toBe(tournament.id);
    expect(restored.theme.logo).toBe(png);
    expect(restored.theme.accent).toBe("#112233");
    const storedTheme = await page.evaluate(async (id) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<{ accent?: string; logo?: string }>(
          (resolve, reject) => {
            const request = database
              .transaction("documents")
              .objectStore("documents")
              .get(id);
            request.onsuccess = () => resolve(request.result.payload.theme);
            request.onerror = () => reject(request.error);
          },
        );
      } finally {
        database.close();
      }
    }, tournament.id);
    expect(storedTheme.accent).toBe(failFirstSave ? "#112233" : "#224466");
    expect(storedTheme.logo).toBeUndefined();
  });
}
