import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";
import { exportRatingSource } from "../../src/records/ratings";

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
function fixture(title = "Records cup") {
  const doc = createTournament(
    title,
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
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "records.json",
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
  await section(page, "Statistics");
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
  await section(page, "Statistics");
}

test("freezes a prediction, transfers it to a fresh profile and scores actual results", async ({
  page,
  browser,
}) => {
  const doc = fixture();
  await importDocument(page, doc);
  await page
    .getByLabel("Prediction entry name", { exact: true })
    .fill("My bracket");
  const choices = page.getByRole("combobox", { name: /^Prediction for / });
  await expect(choices).toHaveCount(3);
  for (let index = 0; index < 3; index++)
    await choices.nth(index).selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Freeze prediction before play", exact: true })
    .click();
  await saved(page);
  await expect(page.locator(".prediction-leaderboard tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Export prediction", exact: true })
    .click();
  const code = await page
    .getByLabel("Prediction package code", { exact: true })
    .inputValue();
  expect(code).toMatch(/^TSB1:/);
  await recordFirst(page);
  const row = page.locator(".prediction-leaderboard tbody tr");
  await expect(row.locator("td").nth(2)).toHaveText("1");
  await expect(
    page.getByText("This stage has started.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Freeze prediction before play",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await saved(page);
  await section(page, "Statistics");
  await expect(
    page.locator(".prediction-leaderboard tbody tr td").nth(2),
  ).toHaveText("1");
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importDocument(recipient, doc);
    await recipient
      .getByLabel("Import prediction code file", { exact: true })
      .setInputFiles({
        name: "prediction.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(code),
      });
    await recipient
      .getByRole("button", { name: "Preview prediction packet", exact: true })
      .click();
    const add = recipient.getByRole("button", {
      name: "Add reviewed prediction",
      exact: true,
    });
    await expect(add).toBeDisabled();
    await recipient
      .getByLabel(
        "Accept this imported entry with unverified identity and freeze time",
        { exact: true },
      )
      .check();
    await add.click();
    await saved(recipient);
    await expect(
      recipient.locator(".prediction-leaderboard tbody tr"),
    ).toContainText("Imported, timing unverified");
    await expect(
      recipient.locator(".prediction-leaderboard tbody tr td").nth(2),
    ).toHaveText("0");
    await recipient
      .getByLabel("Import prediction code", { exact: true })
      .fill(code);
    await recipient
      .getByRole("button", { name: "Preview prediction packet", exact: true })
      .click();
    await recipient
      .getByLabel(
        "Accept this imported entry with unverified identity and freeze time",
        { exact: true },
      )
      .check();
    await add.click();
    await expect(
      recipient.getByText("This prediction packet is already saved.", {
        exact: true,
      }),
    ).toBeVisible();
    await recordFirst(recipient);
    await expect(
      recipient.locator(".prediction-leaderboard tbody tr td").nth(2),
    ).toHaveText("1");
  } finally {
    await context.close();
  }
});

test("imports rating results only after explicit identity mapping and confirms replacement", async ({
  page,
}) => {
  const local = fixture();
  let source = fixture("Earlier season");
  const match = source.matches.find((entry) => entry.status === "ready")!;
  source = recordResult(source, match.id, {
    scores: [3, 1],
    outcome: "played",
    winnerIds: [match.slots[0].participantId!],
    recordedAt: new Date().toISOString(),
  });
  const code = await exportRatingSource(source);
  await importDocument(page, local);
  await page
    .getByLabel("Import rating results code file", { exact: true })
    .setInputFiles({
      name: "ratings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(code),
    });
  await page
    .getByRole("button", { name: "Preview rating results", exact: true })
    .click();
  const add = page.getByRole("button", {
    name: "Add mapped rating results",
    exact: true,
  });
  await expect(add).toBeDisabled();
  for (const participant of source.participants)
    await page
      .getByLabel(`Rating identity for ${participant.name}`, { exact: true })
      .selectOption({ label: participant.name });
  await add.click();
  await saved(page);
  await expect(page.locator(".elo-ratings tbody")).toContainText("1216");
  await expect(page.locator(".elo-ratings tbody")).toContainText("1184");
  await page.reload();
  await saved(page);
  await section(page, "Statistics");
  await expect(page.locator(".elo-ratings tbody")).toContainText("1216");
  await page
    .getByLabel("Import rating results code", { exact: true })
    .fill(code);
  await page
    .getByRole("button", { name: "Preview rating results", exact: true })
    .click();
  for (const participant of source.participants)
    await page
      .getByLabel(`Rating identity for ${participant.name}`, { exact: true })
      .selectOption({ label: participant.name });
  await add.click();
  await expect(
    page.getByText("Confirm replacement of the existing rating source.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel(
      "Replace this source and recalculate history; preserve the previous saved revision",
      { exact: true },
    )
    .check();
  await add.click();
  await saved(page);
  await expect(page.locator(".elo-ratings tbody")).toContainText("1216");
});
