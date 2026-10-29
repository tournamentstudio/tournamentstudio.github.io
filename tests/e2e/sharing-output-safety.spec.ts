import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { decodeCode } from "../../src/sharing";

const testSecret = "synthetic-share-output-secret";
const privateNote = "Referee-only import audit note";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function createCup(page: Page, protectedMode = false) {
  if (protectedMode) await page.clock.install();
  const doc = createTournament("Private sharing cup", [
    createParticipant("سپهر Team A", 1),
    createParticipant("Team B", 2),
  ]);
  doc.description = privateNote;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill(JSON.stringify(doc));
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  if (protectedMode) {
    await section(page, "Settings");
    await page
      .getByLabel("Lock after inactivity", { exact: true })
      .selectOption("1");
    await page.getByLabel("New vault secret", { exact: true }).fill(testSecret);
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
}

async function holdEncryption(page: Page) {
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    let first = true;
    crypto.subtle.encrypt = async (
      ...args: Parameters<SubtleCrypto["encrypt"]>
    ) => {
      if (first) {
        first = false;
        document.documentElement.dataset.exportEncryptionPending = "true";
        await new Promise<void>((resolve) =>
          document.addEventListener(
            "release-export-encryption",
            () => resolve(),
            { once: true },
          ),
        );
      }
      const value = await original(...args);
      document.documentElement.dataset.exportEncryptionFinished = "true";
      return value;
    };
  });
}

async function releaseEncryption(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-export-encryption")),
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-export-encryption-finished",
    "true",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("changing sharing privacy or protection invalidates the previous portable output", async ({
  page,
}) => {
  await createCup(page);
  await section(page, "Share Center");
  await page
    .getByLabel("Included information", { exact: true })
    .selectOption("private");
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  const code = page.getByLabel("Portable code", { exact: true });
  await expect(code).toBeVisible();
  expect((await decodeCode(await code.inputValue())).description).toBe(
    privateNote,
  );
  await page
    .getByLabel("Included information", { exact: true })
    .selectOption("public");
  await expect(code).toHaveCount(0);
  await expect(page.locator(".qr-output")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  await expect(code).toBeVisible();
  expect((await decodeCode(await code.inputValue())).description).not.toBe(
    privateNote,
  );
  await expect(page.locator(".output-panel")).toContainText(
    "Public spectator data",
  );
  await page
    .getByLabel("Protection", { exact: true })
    .selectOption("encrypted");
  await expect(code).toHaveCount(0);
});

test("a delayed private snapshot cannot appear after public settings replace its scope", async ({
  page,
}) => {
  await createCup(page);
  await section(page, "Share Center");
  await page
    .getByLabel("Included information", { exact: true })
    .selectOption("private");
  await page
    .getByLabel("Protection", { exact: true })
    .selectOption("encrypted");
  await page
    .getByLabel("Separate sharing secret (8+ characters)", { exact: true })
    .fill(testSecret);
  await holdEncryption(page);
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-export-encryption-pending",
    "true",
  );
  for (const name of ["SVG", "PNG", "PDF / Print"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await page
    .getByLabel("Included information", { exact: true })
    .selectOption("public");
  await page.getByLabel("Protection", { exact: true }).selectOption("plain");
  await releaseEncryption(page);
  for (const name of ["SVG", "PNG", "PDF / Print"])
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  await expect(page.getByLabel("Portable code", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  const code = page.getByLabel("Portable code", { exact: true });
  await expect(code).toBeVisible();
  expect((await decodeCode(await code.inputValue())).description).not.toBe(
    privateNote,
  );
});

for (const target of ["Share Center", "History"]) {
  test(`${target} cancels a pending private export when the vault locks`, async ({
    page,
  }) => {
    await createCup(page, true);
    await section(page, target);
    const downloads: string[] = [];
    page.on("download", (download) =>
      downloads.push(download.suggestedFilename()),
    );
    await holdEncryption(page);
    await page
      .getByRole("button", {
        name:
          target === "History"
            ? "Export this revision"
            : "Download private backup",
        exact: true,
      })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-export-encryption-pending",
      "true",
    );
    await page.clock.fastForward(61_000);
    await expect(page.locator(".workspace-page")).toHaveCount(0);
    await releaseEncryption(page);
    await expect(
      page.waitForEvent("download", { timeout: 1000 }),
    ).rejects.toThrow(/Timeout/);
    expect(downloads).toEqual([]);
    await expect(page.locator("body")).not.toContainText("Private sharing cup");
  });
}

test("leaving Share Center cancels a pending private QR image archive", async ({
  page,
}) => {
  await createCup(page);
  await section(page, "Share Center");
  await page
    .getByLabel("Included information", { exact: true })
    .selectOption("private");
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  await page
    .getByText("Transfer with numbered QR parts", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create numbered QR parts", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "QR transfer part 1", exact: true }),
  ).toBeVisible();
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    let first = true;
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,
      value(
        this: HTMLCanvasElement,
        ...args: Parameters<HTMLCanvasElement["toDataURL"]>
      ) {
        const image = original.apply(this, args);
        if (!first) return image;
        first = false;
        document.documentElement.dataset.qrArchivePending = "true";
        return new Promise<string>((resolve) =>
          document.addEventListener(
            "release-qr-archive",
            () => {
              document.documentElement.dataset.qrArchiveFinished = "true";
              resolve(image);
            },
            { once: true },
          ),
        );
      },
    });
  });
  await page
    .getByRole("button", { name: "Download all QR images", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-qr-archive-pending",
    "true",
  );
  await section(page, "Overview");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-qr-archive")),
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-qr-archive-finished",
    "true",
  );
  await expect(
    page.waitForEvent("download", { timeout: 1000 }),
  ).rejects.toThrow(/Timeout/);
  expect(downloads).toEqual([]);
});
