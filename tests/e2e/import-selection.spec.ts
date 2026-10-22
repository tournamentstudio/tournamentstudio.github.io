import { expect, test } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";

for (const obsoleteValid of [true, false]) {
  test(`ignores a delayed ${obsoleteValid ? "valid" : "invalid"} file after a new import selection`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = File.prototype.text;
      File.prototype.text = async function () {
        if (this.name === "pending.json") {
          document.documentElement.dataset.filePending = "true";
          await new Promise<void>((resolve) => {
            document.addEventListener("release-pending-file", () => resolve(), {
              once: true,
            });
          });
          const text = await original.call(this);
          document.documentElement.dataset.fileFinished = "true";
          return text;
        }
        return original.call(this);
      };
    });
    const make = (title: string) =>
      createTournament(title, [
        createParticipant("آفتاب A", 1),
        createParticipant("سپهر B", 2),
      ]);
    const old = make("Old selection");
    const current = make("انتخاب جدید Current");
    await page.goto("/");
    await page
      .getByRole("button", { name: "Import a tournament", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Bring a tournament into your studio",
      exact: true,
    });
    await dialog
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "pending.json",
        mimeType: "application/json",
        buffer: Buffer.from(obsoleteValid ? JSON.stringify(old) : "{"),
      });
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-file-pending",
      "true",
    );
    await dialog
      .getByRole("textbox", { name: "Import code", exact: true })
      .fill(JSON.stringify(current));
    await expect(
      dialog.getByRole("button", { name: "Preview import", exact: true }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: current.title, exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      document.dispatchEvent(new Event("release-pending-file")),
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-file-finished",
      "true",
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      dialog.getByRole("heading", { name: current.title, exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: old.title, exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await expect(page.locator(".workspace-title h1")).toHaveText(current.title);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    await page.reload();
    await expect(page.locator(".workspace-title h1")).toHaveText(current.title);
  });
}
