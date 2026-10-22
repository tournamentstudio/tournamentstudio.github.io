import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import {
  createPatch,
  encodeCode,
  encodePatch,
  exportArchive,
  importArchiveBundle,
  sealDocument,
} from "../../src/sharing";

const dialogName = "Bring a tournament into your studio";
const testSecret = "timezone-test-only-secret";

function fixture() {
  let document = createTournament("جام زمان Time review", [
    createParticipant("سپهر Team A", 1),
    createParticipant("Team B", 2),
  ]);
  document = generateStage(document, document.stages[0].id);
  document.revision = 7;
  document.timezone = "Asia/Tehran";
  document.schedule.startAt = "2026-10-22T18:00";
  return document;
}

async function openImport(page: Page, value: Tournament | string) {
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill(typeof value === "string" ? value : JSON.stringify(value));
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  return dialog;
}

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function save(page: Page, dialog: Locator, mode = "Save local copy") {
  await dialog.getByRole("button", { name: mode, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
}

async function downloadDocument(page: Page) {
  await section(page, "Share Center");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const download = await pending;
  return (await importArchiveBundle(await readFile((await download.path())!)))
    .tournament;
}

test("reviews mixed source timezones, preserves selected fields and restores the original revision", async ({
  page,
  browser,
  baseURL,
}) => {
  const raw = fixture();
  raw.schedule.resources[0].name = "Tehran Hall";
  raw.schedule.resources[0].availableFrom = "2026-10-22T20:00";
  raw.schedule.resources[0].availableUntil = "2026-10-23T00:00:00+03:30";
  raw.participants[0].metadata.availableFrom = "2026-10-22T15:00";
  raw.matches[0].scheduledAt = "2026-10-22T19:00:00Z";
  const original = await sealDocument(raw);
  await page.goto("/");
  const dialog = await openImport(page, original);
  const saveButton = dialog.getByRole("button", {
    name: "Save local copy",
    exact: true,
  });
  await expect(saveButton).toBeDisabled();
  await expect(dialog.locator(".legacy-timezone-field")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Use UTC", exact: true }).click();
  const availability = dialog.getByRole("group", {
    name: "Tehran Hall: Available from",
    exact: true,
  });
  await availability
    .getByText("Different timezone for this field", { exact: true })
    .click();
  await availability
    .getByLabel("Field timezone override", { exact: true })
    .fill("Asia/Tehran");
  await expect(availability.locator(".legacy-timezone-preview")).toContainText(
    "2026-10-22T16:30:00.000Z",
  );
  await dialog
    .getByRole("group", { name: "سپهر Team A: Available from", exact: true })
    .getByLabel("Correct this time", { exact: true })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await expect(saveButton).toBeEnabled();
  await dialog
    .getByLabel("Original timezone", { exact: true })
    .fill("Europe/London");
  await expect(saveButton).toBeDisabled();
  await dialog.getByRole("button", { name: "Use UTC", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await save(page, dialog);
  const corrected = await downloadDocument(page);
  expect(corrected.schedule.startAt).toBe("2026-10-22T18:00:00.000Z");
  expect(corrected.schedule.resources[0].availableFrom).toBe(
    "2026-10-22T16:30:00.000Z",
  );
  expect(corrected.schedule.resources[0].availableUntil).toBe(
    raw.schedule.resources[0].availableUntil,
  );
  expect(corrected.participants[0].metadata.availableFrom).toBe(
    raw.participants[0].metadata.availableFrom,
  );
  expect(corrected.matches[0].scheduledAt).toBe(raw.matches[0].scheduledAt);
  expect(corrected.revision).toBe(8);
  expect(corrected.createdAt).toBe(original.createdAt);
  expect(corrected.timezone).toBe(original.timezone);
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(2);
  const baseline = page
    .locator(".revision-row")
    .filter({ hasText: "Revision 7" });
  const pending = page.waitForEvent("download");
  await baseline
    .getByRole("button", { name: "Export this revision", exact: true })
    .click();
  const download = await pending;
  const restored = await importArchiveBundle(
    await readFile((await download.path())!),
  );
  expect(restored.tournament).toEqual(original);
  const recipient = await browser.newContext({
    baseURL,
    timezoneId: "America/Los_Angeles",
  });
  try {
    const other = await recipient.newPage();
    await other.goto("/");
    const imported = await openImport(other, corrected);
    await imported
      .getByRole("button", { name: "Keep original times", exact: true })
      .click();
    await save(other, imported);
    await section(other, "Schedule");
    await expect(
      other.getByLabel("Start time (device timezone)", { exact: true }),
    ).toHaveValue("2026-10-22T11:00");
  } finally {
    await recipient.close();
  }
});

test("keeps a legacy code unchanged and applies verified updates without timezone rewriting", async ({
  page,
}) => {
  const original = await sealDocument(fixture());
  await page.goto("/");
  const dialog = await openImport(
    page,
    await encodeCode(original, undefined, true),
  );
  await dialog
    .getByRole("button", { name: "Keep original times", exact: true })
    .click();
  await save(page, dialog);
  expect(await downloadDocument(page)).toEqual(original);
  const target = await sealDocument({
    ...original,
    subtitle: "Reviewed sender update",
    revision: 8,
  });
  const packet = await createPatch(original, target);
  const update = await openImport(page, await encodePatch(packet));
  await expect(update.locator(".legacy-timezone-review")).toHaveCount(0);
  await save(page, update, "Apply verified update");
  expect(await downloadDocument(page)).toEqual(target);
});

test("requires an explicit daylight-saving occurrence for a shared snapshot", async ({
  page,
}) => {
  const original = fixture();
  original.timezone = "America/Los_Angeles";
  original.schedule.startAt = "2026-11-01T01:30";
  await page.goto(`/#/open/${await encodeCode(original)}`);
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(
    dialog.getByRole("button", { name: "Apply reviewed times", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".legacy-timezone-candidates")).toContainText(
    "2026-11-01T08:30:00.000Z",
  );
  await expect(dialog.locator(".legacy-timezone-candidates")).toContainText(
    "2026-11-01T09:30:00.000Z",
  );
  await dialog
    .getByLabel("Clock change occurrence", { exact: true })
    .selectOption("later");
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await save(page, dialog);
  expect((await downloadDocument(page)).schedule.startAt).toBe(
    "2026-11-01T09:30:00.000Z",
  );
  expect(page.url()).not.toContain("TS1:");
});

test("blocks a skipped time until edited and does not retain a review after going back", async ({
  page,
}) => {
  const original = fixture();
  original.timezone = "America/Los_Angeles";
  original.schedule.startAt = "2026-03-08T02:30";
  await page.goto("/");
  let dialog = await openImport(page, original);
  await expect(dialog.locator(".legacy-timezone-error")).toContainText(
    "does not exist",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply reviewed times", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Clock date and time", { exact: true })
    .fill("2026-03-08T03:30");
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Clock date and time", { exact: true }),
  ).toHaveValue(original.schedule.startAt);
  await expect(
    dialog.getByRole("button", { name: "Save local copy", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.reload();
  await expect(page.getByText(original.title, { exact: true })).toHaveCount(0);
  dialog = await openImport(page, original);
  await dialog
    .getByLabel("Clock date and time", { exact: true })
    .fill("2026-03-08T03:30");
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await save(page, dialog);
  expect((await downloadDocument(page)).schedule.startAt).toBe(
    "2026-03-08T10:30:00.000Z",
  );
});

test("reviews an encrypted history backup and forks without replacing an existing copy", async ({
  page,
}) => {
  const first = await sealDocument({ ...fixture(), revision: 6 });
  const original = await sealDocument({
    ...first,
    revision: 7,
    subtitle: "Private legacy backup",
  });
  const archive = await exportArchive(original, testSecret, [
    { action: "First saved", tournament: first },
    { action: "Second saved", tournament: original },
  ]);
  await page.goto("/");
  let dialog = await openImport(page, original);
  await dialog
    .getByRole("button", { name: "Keep original times", exact: true })
    .click();
  await save(page, dialog);
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: dialogName });
  await dialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "legacy.tourney",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(archive),
    });
  await dialog
    .getByLabel("Separate secret, if encrypted", { exact: true })
    .fill(testSecret);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(dialog).toContainText("2 saved revisions are included");
  await dialog.getByRole("button", { name: "Use UTC", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Replace current copy", exact: true }),
  ).toBeDisabled();
  await save(page, dialog, "Fork with new identity");
  expect(page.url()).not.toContain(original.id);
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(3);
  const pending = page.waitForEvent("download");
  await page
    .locator(".revision-row")
    .filter({ hasText: "Revision 7" })
    .getByRole("button", { name: "Export this revision", exact: true })
    .click();
  const download = await pending;
  const backup = await readFile((await download.path())!);
  await expect(
    importArchiveBundle(backup, "wrong-test-secret"),
  ).rejects.toThrow();
  const restored = await importArchiveBundle(backup, testSecret);
  expect(restored.tournament.schedule.startAt).toBe(original.schedule.startAt);
  expect(restored.tournament.id).not.toBe(original.id);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.locator(".workspace-title")).toHaveCount(0);
  await page.goto(`/#/t/${original.id}`);
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  expect(await downloadDocument(page)).toEqual(original);
});

for (const width of [320, 390]) {
  test(`Persian timezone review stays readable at ${width}px`, async ({
    page,
  }, testInfo) => {
    const original = fixture();
    original.schedule.resources[0].name =
      "تالار‌مسابقات‌قهرمانان‌بین‌المللی‌دانشگاه‌امیرکبیر Tehran";
    original.schedule.resources[0].availableFrom = "2026-10-22T19:00";
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Switch to Persian", exact: true })
      .click();
    // The mobile drawer contains the global import control.
    await page
      .getByRole("button", { name: "ورود مسابقات", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "مسابقات را به استودیو بیاورید",
    });
    await dialog
      .getByLabel("کد ورود", { exact: true })
      .fill(JSON.stringify(original));
    await dialog
      .getByRole("button", { name: "پیش‌نمایش ورود", exact: true })
      .click();
    await expect(dialog.locator(".legacy-timezone-review")).toBeVisible();
    if (width === 320) {
      const accessibility = await new AxeBuilder({ page })
        .include(".legacy-timezone-review")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
    await dialog
      .getByLabel("منطقه زمانی اصلی", { exact: true })
      .fill("Invalid/Zone");
    await expect(
      dialog.getByRole("button", {
        name: "تأیید زمان‌های بررسی‌شده",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "استفاده از UTC", exact: true })
      .click();
    const fits = await dialog
      .locator(".legacy-timezone-review")
      .evaluate((review) => {
        const box = review.getBoundingClientRect();
        return [
          ...review.querySelectorAll("input, select, button, legend, bdi"),
        ].every((node) => {
          if (!(node instanceof HTMLElement) || !node.getClientRects().length)
            return true;
          const rect = node.getBoundingClientRect();
          return (
            rect.left >= box.left - 1 &&
            rect.right <= box.right + 1 &&
            node.scrollWidth <= node.clientWidth + 2
          );
        });
      });
    expect(fits).toBe(true);
    await dialog
      .locator(".legacy-timezone-field")
      .last()
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("persian-timezone-review.png"),
    });
    await dialog
      .getByRole("button", { name: "تأیید زمان‌های بررسی‌شده", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "ذخیره کپی محلی", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".save-status")).toHaveText("محلی ذخیره شد");
  });
}

test("reviews and saves a legacy backup while offline after app caching", async ({
  page,
  context,
}) => {
  const original = fixture();
  await page.goto("/");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    const dialog = await openImport(page, original);
    await dialog.getByRole("button", { name: "Use UTC", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Apply reviewed times", exact: true })
      .click();
    await save(page, dialog);
    await page.reload();
    await section(page, "History");
    await expect(page.locator(".revision-row")).toHaveCount(2);
    expect((await downloadDocument(page)).schedule.startAt).toBe(
      "2026-10-22T18:00:00.000Z",
    );
  } finally {
    await context.setOffline(false);
  }
});

test("keeps selections across pages and leaves unselected legacy bookings unchanged", async ({
  page,
}) => {
  let document = createTournament(
    "Paged timezone review",
    Array.from({ length: 8 }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "round-robin",
  );
  document = generateStage(document, document.stages[0].id);
  document.timezone = "UTC";
  for (const match of document.matches) match.scheduledAt = "2026-10-22T18:00";
  await page.goto("/");
  const dialog = await openImport(page, document);
  await expect(dialog.locator(".legacy-timezone-field")).toHaveCount(20);
  await dialog
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await dialog.getByLabel("Correct this time", { exact: true }).first().check();
  await dialog.getByRole("button", { name: "Next times", exact: true }).click();
  await expect(dialog.locator(".legacy-timezone-field")).toHaveCount(8);
  await dialog.getByLabel("Correct this time", { exact: true }).last().check();
  await dialog
    .getByRole("button", { name: "Previous times", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Correct this time", { exact: true }).first(),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "Apply reviewed times", exact: true })
    .click();
  await save(page, dialog);
  const corrected = await downloadDocument(page);
  expect(
    corrected.matches.filter(
      (match) => match.scheduledAt === "2026-10-22T18:00:00.000Z",
    ),
  ).toHaveLength(2);
  expect(
    corrected.matches.filter(
      (match) => match.scheduledAt === "2026-10-22T18:00",
    ),
  ).toHaveLength(26);
});
