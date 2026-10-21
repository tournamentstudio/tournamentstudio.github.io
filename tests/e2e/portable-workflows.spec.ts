import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult, simulate } from "../../src/engine";
import { createPatch, encodePatch, sealDocument } from "../../src/sharing";

const transferSecret = "test-only-sharing-secret";
const dialogName = "Bring a tournament into your studio";
async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function section(page: Page, name: string) {
  await page.bringToFront();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
function fixture() {
  const doc = createTournament(
    "Portable workflow cup",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Player ${index + 1}`, index + 1),
    ),
  );
  doc.revision = 1;
  return generateStage(doc, doc.stages[0].id);
}
async function importDocument(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "tournament.json",
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
  await saved(page);
}
async function recordFirst(page: Page) {
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("3");
  await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}
async function pasteUpdate(page: Page, code: string, secret?: string) {
  await section(page, "Share Center");
  await page
    .getByRole("button", { name: "Import a package", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.getByLabel("Import code", { exact: true }).fill(code);
  if (secret)
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill(secret);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  return dialog;
}
async function changeTheme(page: Page) {
  await section(page, "Theme Studio");
  await page.getByRole("button", { name: "Minimal Dark", exact: true }).click();
  await saved(page);
}

test("exports and reconstructs a multi-stage recipe on a separate browser profile", async ({
  page,
  browser,
}) => {
  const source = fixture();
  source.stages.push({
    id: "playoffs",
    name: "Private finals",
    order: 1,
    format: "single-elimination",
    formatVersion: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [{ stageId: source.stages[0].id, count: 2, perGroup: false }],
    status: "draft",
    metadata: {},
  });
  await importDocument(page, source);
  await section(page, "Share Center");
  await page
    .getByRole("button", { name: "Create recipe", exact: true })
    .click();
  await expect(page.getByLabel("Portable code", { exact: true })).toHaveValue(
    /^TSR2:/,
  );
  const code = await page
    .getByLabel("Portable code", { exact: true })
    .inputValue();
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto(
      `${new URL(page.url()).origin}/#/open/${encodeURIComponent(code)}`,
    );
    const dialog = fresh.getByRole("dialog", { name: dialogName });
    await expect(
      dialog.getByRole("heading", { name: "Imported recipe", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(fresh);
    await section(fresh, "Structure");
    await expect(fresh.locator(".stage-node")).toHaveCount(2);
    await expect(fresh.locator(".stage-node").first()).toContainText("Stage 1");
    await section(fresh, "Participants");
    await expect(fresh.locator("tbody")).not.toContainText("Player 1");
  } finally {
    await context.close();
  }
});

test("restores encrypted saved history on a fresh profile", async ({
  page,
  browser,
}) => {
  await importDocument(page, await sealDocument(fixture()));
  await recordFirst(page);
  await section(page, "Share Center");
  await page
    .getByRole("combobox", { name: /^Protection/ })
    .selectOption("encrypted");
  await page
    .getByLabel("Separate sharing secret (8+ characters)", { exact: true })
    .fill(transferSecret);
  await expect(
    page.getByLabel("Include saved revisions (up to 50)"),
  ).toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto(new URL(page.url()).origin);
    await fresh
      .getByRole("button", { name: "Import & restore", exact: true })
      .click();
    const dialog = fresh.getByRole("dialog", { name: dialogName });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "history-backup.tourney",
      mimeType: "application/octet-stream",
      buffer: await (await import("node:fs/promises")).readFile(path!),
    });
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill("test-only-wrong-secret");
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(dialog.getByText(/Incorrect secret/)).toBeVisible();
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill(transferSecret);
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByText(/2 saved revisions are included/),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(fresh);
    await section(fresh, "History");
    await expect(fresh.locator(".revision-row")).toHaveCount(2);
    await expect(
      fresh.getByRole("button", { name: "Lock", exact: true }),
    ).toBeVisible();
    await fresh.reload();
    await expect(
      fresh.getByRole("dialog", { name: "Unlock your tournament" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("reviews an encrypted divergent update and preserves local theme edits", async ({
  page,
  browser,
}) => {
  const initial = await sealDocument(fixture());
  await importDocument(page, initial);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importDocument(recipient, initial);
    await changeTheme(recipient);
    await recordFirst(page);
    await section(page, "Share Center");
    await page.getByLabel("Recipient snapshot type").selectOption("private");
    await page.getByLabel("Encrypt update with a separate secret").check();
    await page
      .getByLabel("Update secret (8+ characters)", { exact: true })
      .fill(transferSecret);
    await page
      .getByRole("button", { name: "Generate update code", exact: true })
      .click();
    await expect(page.getByLabel("Portable code", { exact: true })).toHaveValue(
      /^TSP1:/,
    );
    const code = await page
      .getByLabel("Portable code", { exact: true })
      .inputValue();
    const dialog = await pasteUpdate(recipient, code, transferSecret);
    await expect(
      dialog.getByRole("heading", {
        name: "Review divergent update",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .locator('input[aria-label^="Select change matches"]:enabled')
      .first()
      .check();
    await dialog
      .getByRole("button", { name: "Preview selected changes", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Apply selected changes", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(recipient);
    await section(recipient, "Matches");
    await recipient
      .getByRole("button", { name: "Completed", exact: true })
      .click();
    await expect(recipient.locator(".match-tile.completed")).toHaveCount(1);
    await section(recipient, "Theme Studio");
    await expect(
      recipient.getByRole("button", { name: "Minimal Dark", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const repeated = await pasteUpdate(recipient, code, transferSecret);
    await expect(
      repeated.getByText("This update was already reviewed and merged.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("requires downstream confirmation during selective result correction", async ({
  page,
}) => {
  const initial = await sealDocument(simulate(fixture()));
  const opening = initial.matches.find(
    (match) => match.round === 1 && match.result,
  )!;
  const winner = opening.slots.findIndex(
    (slot) => slot.participantId !== opening.result!.winnerIds[0],
  );
  const target = recordResult(
    initial,
    opening.id,
    {
      scores: winner === 0 ? [3, 1] : [1, 3],
      winnerIds: [opening.slots[winner].participantId!],
      outcome: "played",
      recordedAt: "2026-10-21T12:00:00Z",
    },
    true,
  );
  target.revision = initial.revision + 1;
  const code = await encodePatch(await createPatch(initial, target));
  await importDocument(page, initial);
  await changeTheme(page);
  const dialog = await pasteUpdate(page, code);
  await dialog
    .getByRole("checkbox", {
      name: `Select change matches / ${opening.id}`,
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Preview selected changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Apply selected changes", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText(/These matches have recorded activity affected by the selected changes/),
  ).toBeVisible();
  await dialog.getByLabel("Confirm affected match changes").check();
  await dialog
    .getByRole("button", { name: "Apply selected changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await section(page, "Matches");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.locator(".match-tile.completed")).toHaveCount(2);
  await section(page, "History");
  await expect(page.locator(".revision-row")).toHaveCount(3);
});

test("forks an encrypted update into a protected copy without changing the recipient", async ({
  page,
}) => {
  const initial = await sealDocument(fixture());
  const packet = await createPatch(initial, {
    ...initial,
    revision: initial.revision + 1,
    title: "Encrypted fork title",
  });
  const code = await encodePatch(packet, transferSecret);
  await importDocument(page, initial);
  const originalUrl = page.url();
  await changeTheme(page);
  const dialog = await pasteUpdate(page, code, transferSecret);
  await expect(
    dialog.getByText(/A fork will use the current vault secret/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Fork sender's version", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await expect(page).not.toHaveURL(originalUrl);
  const forkUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Encrypted fork title", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await page.reload();
  const unlock = page.getByRole("dialog", { name: "Unlock your tournament" });
  await expect(unlock).toBeVisible();
  await unlock.locator('input[type="password"]').fill("test-only-wrong-secret");
  await unlock
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(unlock.getByText(/Incorrect secret/)).toBeVisible();
  await unlock.locator('input[type="password"]').fill(transferSecret);
  await unlock
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(unlock).not.toBeVisible();
  await expect(page).toHaveURL(forkUrl);
  await page.goto(originalUrl);
  await expect(
    page.getByRole("heading", { name: initial.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lock", exact: true }),
  ).toHaveCount(0);
  await section(page, "Theme Studio");
  await expect(
    page.getByRole("button", { name: "Minimal Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
