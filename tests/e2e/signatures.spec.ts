import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";
import { signPacket, verifySignedPacket } from "../../src/sharing/signatures";
import {
  createSigningKey,
  decodeSigningData,
  displayFingerprint,
  encodeSigningData,
  exportPublicSigningKey,
} from "../../src/security/signatures";

const testSecret = "synthetic-signing-browser-secret";
async function openStudio(page: Page, persian = false) {
  const initial = createTournament("Signing workspace", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
  const doc = generateStage(initial, initial.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "signing-workspace.json",
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
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  if (persian)
    await page
      .getByRole("button", { name: "Switch to Persian", exact: true })
      .click();
  await page
    .getByRole("navigation", {
      name: persian ? "بخش‌های مسابقات" : "Tournament sections",
    })
    .getByRole("button", {
      name: persian ? "مرکز اشتراک" : "Share Center",
      exact: true,
    })
    .click();
  const studio = page.locator(".signature-studio");
  await studio.locator("summary").click();
  return studio;
}
async function generateKey(page: Page) {
  const studio = page.locator(".signature-studio");
  await studio
    .getByLabel("Signing key secret (8+ characters)", { exact: true })
    .fill(testSecret);
  await studio
    .getByRole("button", { name: "Create signing key", exact: true })
    .click();
  await expect(
    studio.getByRole("button", { name: "Lock signing key now", exact: true }),
  ).toBeVisible();
  return studio;
}

test("keeps the selected packet fixed while its signature is being created", async ({
  page,
}) => {
  await openStudio(page);
  const studio = await generateKey(page);
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  await expect(page.getByLabel("Portable code", { exact: true })).toBeVisible();
  const source = "TS1:synthetic-selected-packet.checksum";
  await studio.getByLabel("Packet to sign", { exact: true }).fill(source);
  await page.evaluate(() => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    crypto.subtle.sign = async (...args: Parameters<SubtleCrypto["sign"]>) => {
      document.documentElement.dataset.signaturePending = "true";
      await new Promise<void>((resolve) =>
        document.addEventListener("release-signature", () => resolve(), {
          once: true,
        }),
      );
      return sign(...args);
    };
  });
  await studio
    .getByRole("button", { name: "Sign packet", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-signature-pending",
    "true",
  );
  const replace = studio.getByRole("button", {
    name: "Use the generated share code",
    exact: true,
  });
  await expect.soft(replace).toBeDisabled();
  if (await replace.isEnabled()) await replace.click();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-signature")),
  );
  const output = studio.getByLabel("Signed packet code", { exact: true });
  await expect(output).toHaveValue(/^TSS1:/);
  const verified = await verifySignedPacket(await output.inputValue());
  expect(verified.payload).toBe(
    await studio.getByLabel("Packet to sign", { exact: true }).inputValue(),
  );
  await expect(replace).toBeEnabled();
});

test("generates, encrypts, locks and recovers a signing key without persistent private material", async ({
  page,
}) => {
  await openStudio(page);
  const studio = await generateKey(page);
  const fingerprint = await studio
    .getByLabel("Your key fingerprint", { exact: true })
    .inputValue();
  const downloadPromise = page.waitForEvent("download");
  await studio
    .getByRole("button", {
      name: "Download encrypted signing key",
      exact: true,
    })
    .click();
  const backup = await readFile(
    (await (await downloadPromise).path())!,
    "utf8",
  );
  expect(backup).toMatch(/^TSSK1:/);
  const decoded = JSON.stringify(decodeSigningData("TSSK1", backup, 8192));
  expect(decoded).not.toContain(testSecret);
  expect(decoded).not.toContain('"d":');
  await studio
    .getByLabel("Packet to sign", { exact: true })
    .fill("TS1:opaque.checksum");
  await studio
    .getByRole("button", { name: "Sign packet", exact: true })
    .click();
  await expect(
    studio.getByLabel("Signed packet code", { exact: true }),
  ).toHaveValue(/^TSS1:/);
  await studio
    .getByRole("button", { name: "Lock signing key now", exact: true })
    .click();
  await expect(
    studio.getByLabel("Packet to sign", { exact: true }),
  ).toHaveValue("");
  await expect(
    studio.getByLabel("Signed packet code", { exact: true }),
  ).toHaveCount(0);
  await studio
    .getByLabel("Signing key secret (8+ characters)", { exact: true })
    .fill("synthetic-incorrect-secret");
  await studio
    .getByLabel("Encrypted signing key backup", { exact: true })
    .fill(backup);
  await studio
    .getByRole("button", { name: "Recover signing key", exact: true })
    .click();
  await expect(studio.getByRole("alert")).toContainText("Incorrect secret");
  await studio
    .getByLabel("Signing key secret (8+ characters)", { exact: true })
    .fill(testSecret);
  await studio
    .getByRole("button", { name: "Recover signing key", exact: true })
    .click();
  await expect(
    studio.getByLabel("Your key fingerprint", { exact: true }),
  ).toHaveValue(fingerprint);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Share Center", exact: true })
    .click();
  await studio.locator("summary").click();
  await expect(
    studio.getByRole("button", { name: "Create signing key", exact: true }),
  ).toBeVisible();
  await expect(
    studio.getByLabel("Signing key secret (8+ characters)", { exact: true }),
  ).toHaveValue("");
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await Promise.all(
      [...db.objectStoreNames].map(
        (name) =>
          new Promise<unknown>((resolve, reject) => {
            const request = db.transaction(name).objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
    db.close();
    return JSON.stringify(records);
  });
  expect(persisted).not.toContain(testSecret);
  expect(persisted).not.toContain('"d":');
});

test("verifies in an independent profile, requires fingerprint trust, and previews without applying", async ({
  browser,
  baseURL,
}) => {
  const { key } = await createSigningKey(testSecret);
  const doc = createTournament("Signed transfer cup", [
    createParticipant("East", 1),
    createParticipant("West", 2),
  ]);
  const signed = await signPacket(await encodeCode(doc), key);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    const studio = await openStudio(page);
    await studio
      .getByLabel("Received signed packet", { exact: true })
      .fill(signed);
    await studio
      .getByRole("button", { name: "Verify signature", exact: true })
      .click();
    await expect(
      studio.getByText("Signature valid", { exact: true }),
    ).toBeVisible();
    await expect(
      studio.getByText(
        "Unknown signer. This key has not been independently trusted.",
        { exact: true },
      ),
    ).toBeVisible();
    await studio
      .getByRole("button", { name: "Review this public key", exact: true })
      .click();
    await studio
      .getByRole("button", { name: "Review public signing key", exact: true })
      .click();
    await studio
      .getByLabel("Local signer label", { exact: true })
      .fill("Known referee");
    await studio
      .getByLabel("Fingerprint received through a separate trusted channel", {
        exact: true,
      })
      .fill("0".repeat(64));
    await studio
      .getByLabel(
        "I independently matched the full fingerprint with the intended signer.",
        { exact: true },
      )
      .check();
    await studio
      .getByRole("button", { name: "Trust the reviewed key", exact: true })
      .click();
    await expect(studio.getByRole("alert")).toContainText("does not match");
    await studio
      .getByLabel("Fingerprint received through a separate trusted channel", {
        exact: true,
      })
      .fill(displayFingerprint(key.fingerprint));
    await studio
      .getByRole("button", { name: "Trust the reviewed key", exact: true })
      .click();
    await expect(
      studio.getByText("Trusted key: Known referee", { exact: true }),
    ).toBeVisible();
    await studio
      .getByRole("button", { name: "Review extracted import", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Bring a tournament into your studio",
    });
    await expect(
      dialog.getByRole("button", { name: "Save local copy", exact: true }),
    ).toBeVisible();
    await expect(dialog).toContainText("Signed transfer cup");
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(page.locator(".workspace-title")).toContainText(
      "Signing workspace",
    );
    const otherPage = await context.newPage();
    const otherStudio = await openStudio(otherPage);
    await expect(
      otherStudio.getByText("Known referee", { exact: true }),
    ).toBeVisible();
    await otherStudio
      .getByRole("button", {
        name: "Remove trust for Known referee",
        exact: true,
      })
      .click();
    const confirm = otherPage.getByRole("dialog", {
      name: "Remove trusted signing key",
    });
    await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      studio.getByText(
        "Unknown signer. This key has not been independently trusted.",
        { exact: true },
      ),
    ).toBeVisible();
    await otherPage.close();
    const corrupted = decodeSigningData("TSS1", signed, 100000) as Record<
      string,
      unknown
    >;
    corrupted.payload = "TS1:substituted.checksum";
    await studio
      .getByLabel("Received signed packet", { exact: true })
      .fill(encodeSigningData("TSS1", corrupted));
    await studio
      .getByRole("button", { name: "Verify signature", exact: true })
      .click();
    await expect(studio.getByRole("alert")).toContainText(
      "Signature verification failed",
    );
    await expect(
      studio.getByRole("button", {
        name: "Review extracted import",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("automatically discards an inactive in-memory signing key", async ({
  page,
}) => {
  await page.clock.install();
  await openStudio(page);
  const studio = await generateKey(page);
  await studio
    .getByLabel("Packet to sign", { exact: true })
    .fill("TS1:private-draft.checksum");
  await page.clock.fastForward(15 * 60_000 + 6000);
  await expect(
    studio.getByRole("button", { name: "Create signing key", exact: true }),
  ).toBeVisible();
  await expect(
    studio.getByLabel("Packet to sign", { exact: true }),
  ).toHaveValue("");
  await expect(
    studio.getByRole("button", { name: "Sign packet", exact: true }),
  ).toBeDisabled();
});

test("Persian signature review fits 320 pixels and exposes labeled keyboard controls", async ({
  page,
}) => {
  const { key } = await createSigningKey(testSecret);
  const studio = await openStudio(page, true);
  await page.setViewportSize({ width: 320, height: 800 });
  await studio
    .getByLabel("کد کلید عمومی امضا", { exact: true })
    .fill(exportPublicSigningKey(key.publicKey));
  await studio
    .getByRole("button", { name: "بررسی کلید عمومی امضا", exact: true })
    .click();
  await studio
    .getByLabel("برچسب محلی امضاکننده", { exact: true })
    .fill("داور دارای نام طولانی برای بررسی اعتبار بسته مسابقات");
  await studio
    .getByLabel("اثر انگشت دریافتی از مسیر جداگانه مورد اعتماد", {
      exact: true,
    })
    .fill(displayFingerprint(key.fingerprint));
  const checkbox = studio.getByLabel(
    "اثر انگشت کامل را به‌طور مستقل با امضاکننده مورد نظر تطبیق داده‌ام.",
    { exact: true },
  );
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    studio.getByRole("button", {
      name: "اعتماد به کلید بررسی‌شده",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    studio.getByText("کلید عمومی به فهرست اعتماد این مرورگر اضافه شد.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".signature-studio")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await studio.screenshot({ path: ".local/signatures-persian-mobile.png" });
});
