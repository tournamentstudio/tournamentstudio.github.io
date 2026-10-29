import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const secret = "synthetic-workspace-session-secret";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

for (const mode of ["local", "vault", "recovery"] as const) {
  test(`rejects a pending upload from an earlier ${mode} session after reopening the same tournament`, async ({
    page,
  }) => {
    const protectedMode = mode === "vault";
    const draft = createTournament("Session cup", [
      createParticipant("سپهر Team", 1),
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
    if (protectedMode) {
      await section(page, "Settings");
      await page.getByLabel("New vault secret", { exact: true }).fill(secret);
      await page
        .getByRole("button", {
          name: "Encrypt tournament & history",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Lock tournament now", exact: true }),
      ).toBeVisible();
    }
    await section(page, "Theme Studio");
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 16;
      canvas.getContext("2d")!.fillRect(0, 0, 16, 16);
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      let first = true;
      HTMLImageElement.prototype.decode = async function () {
        await decode.call(this);
        if (first) {
          first = false;
          document.documentElement.dataset.pendingUpload = "true";
          await new Promise<void>((resolve) =>
            document.addEventListener("release-old-upload", () => resolve(), {
              once: true,
            }),
          );
          document.documentElement.dataset.pendingUpload = "finished";
        }
      };
    });
    await page.getByLabel("Tournament logo", { exact: true }).setInputFiles({
      name: "session-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png.split(",")[1], "base64"),
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-pending-upload",
      "true",
    );
    if (protectedMode) {
      await section(page, "Settings");
      await page
        .getByRole("button", { name: "Lock tournament now", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Protected tournament", exact: true })
        .click();
      const unlock = page.getByRole("dialog", {
        name: "Unlock your tournament",
      });
      await unlock.getByLabel("Vault secret", { exact: true }).fill(secret);
      await unlock
        .getByRole("button", { name: "Unlock tournament", exact: true })
        .click();
      await expect(unlock).not.toBeVisible();
    } else if (mode === "recovery") {
      await section(page, "Settings");
      await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
          if (this.name === "documents")
            throw new DOMException("Test quota reached", "QuotaExceededError");
          return key === undefined
            ? put.call(this, value)
            : put.call(this, value, key);
        };
        document.addEventListener(
          "restore-storage",
          () => {
            IDBObjectStore.prototype.put = put;
          },
          { once: true },
        );
      });
      await page.getByLabel("Title", { exact: true }).fill("Failed edit");
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Export unsaved copy", exact: true }),
      ).toBeVisible();
      await page.evaluate(() =>
        document.dispatchEvent(new Event("restore-storage")),
      );
      await page
        .getByRole("button", { name: "Reload saved version", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Export unsaved copy", exact: true }),
      ).toHaveCount(0);
    } else {
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page
        .getByRole("button", { name: "Session cup", exact: true })
        .click();
    }
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    await section(page, "Theme Studio");
    await page.evaluate((id) => {
      const get = IDBObjectStore.prototype.get;
      let reads = 0;
      document.documentElement.dataset.staleSessionReads = "0";
      IDBObjectStore.prototype.get = function (key) {
        if (this.name === "documents" && key === id)
          document.documentElement.dataset.staleSessionReads = String(++reads);
        return get.call(this, key);
      };
      document.dispatchEvent(new Event("release-old-upload"));
    }, tournament.id);
    await expect(page.locator("html")).toHaveAttribute(
      "data-pending-upload",
      "finished",
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-stale-session-reads",
      "0",
    );
    await expect(page.locator(".theme-preview img")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Export unsaved copy", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
  });
}
