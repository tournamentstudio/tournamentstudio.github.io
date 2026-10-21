import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

function fixture(format: FormatId, count = 4) {
  const doc = createTournament(
    `Predictions ${format}`,
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    format,
  );
  doc.stages[0].config.rounds = 2;
  doc.stages[0].config.capacity = count;
  doc.rules.allowDraws = ["round-robin", "swiss"].includes(format);
  return generateStage(doc, doc.stages[0].id);
}
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
      name: "predictions.json",
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
async function chooseWinners(page: Page) {
  await expect(page.locator(".prediction-builder")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /^Prediction for / }).first(),
  ).toBeVisible();
  for (let iteration = 0; iteration < 30; iteration++) {
    const choices = page.getByRole("combobox", { name: /^Prediction for / });
    let changed = false;
    for (let index = 0; index < (await choices.count()); index++) {
      const choice = choices.nth(index);
      if ((await choice.isEnabled()) && (await choice.inputValue()) === "") {
        await choice.selectOption({ index: 1 });
        changed = true;
      }
    }
    if (!changed) break;
  }
}
async function freeze(page: Page, name: string) {
  await page.getByLabel("Prediction entry name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Freeze prediction before play", exact: true })
    .click();
  await expect(
    page
      .locator(".prediction-leaderboard")
      .getByRole("cell", { name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Prediction entry name", { exact: true }),
  ).toHaveValue("");
  await saved(page);
}
async function scoreFirst(page: Page, values = [3, 1]) {
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  for (const [index, value] of values.entries())
    await dialog
      .locator('.score-entry input[type="number"]')
      .nth(index)
      .fill(String(value));
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

test("double elimination predicts loser paths and a conditional reset before portable transfer", async ({
  page,
  browser,
}) => {
  const doc = fixture("double-elimination");
  await importDocument(page, doc);
  await chooseWinners(page);
  await expect(
    page.getByText("Predicted reset: not needed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Prediction for Grand final", exact: true })
    .selectOption({ index: 2 });
  await chooseWinners(page);
  await expect(
    page.getByText("Predicted reset: not needed", { exact: true }),
  ).toHaveCount(0);
  await freeze(page, "Reset forecast");
  await expect(page.locator(".prediction-leaderboard tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Export prediction", exact: true })
    .click();
  const code = await page
    .getByLabel("Prediction package code", { exact: true })
    .inputValue();
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importDocument(recipient, doc);
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
    await recipient
      .getByRole("button", { name: "Add reviewed prediction", exact: true })
      .click();
    await saved(recipient);
    await expect(
      recipient.locator(".prediction-leaderboard tbody tr"),
    ).toContainText("Reset forecast");
    await scoreFirst(recipient);
    await section(recipient, "Statistics");
    await expect(
      recipient.locator(".prediction-leaderboard tbody tr td").nth(2),
    ).toHaveText("1");
    await expect(
      page.locator(".prediction-leaderboard tbody tr td").nth(2),
    ).toHaveText("0");
  } finally {
    await context.close();
  }
});

test("league predictions accept draws and keep equal leaderboard ranks", async ({
  page,
}) => {
  await importDocument(page, fixture("round-robin", 3));
  for (const name of ["First draw", "Second draw"]) {
    await chooseWinners(page);
    await page
      .getByRole("combobox", { name: /^Prediction for / })
      .first()
      .selectOption("draw");
    await freeze(page, name);
  }
  await expect(page.locator(".prediction-leaderboard tbody tr")).toHaveCount(2);
  await expect(
    page.locator(".prediction-leaderboard tbody tr td:first-child"),
  ).toHaveText(["1", "1"]);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("1");
  await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
  await dialog.getByLabel("Result type", { exact: true }).selectOption("draw");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await section(page, "Statistics");
  await expect(
    page.locator(".prediction-leaderboard tbody tr td:nth-child(3)"),
  ).toHaveText(["1", "1"]);
});

test("multi-entrant predictions validate complete ranks and score recorded placements", async ({
  page,
}) => {
  const doc = fixture("free-for-all", 3);
  doc.stages[0].config.rounds = 1;
  const generated = generateStage(doc, doc.stages[0].id);
  await importDocument(page, generated);
  await page
    .getByLabel("Prediction entry name", { exact: true })
    .fill("Podium");
  const ranks = page.getByRole("spinbutton", { name: /^Predicted rank for / });
  await expect(ranks).toHaveCount(3);
  await ranks.nth(0).fill("1");
  await ranks.nth(1).fill("1");
  await ranks.nth(2).fill("2");
  await expect(
    page.getByRole("button", {
      name: "Freeze prediction before play",
      exact: true,
    }),
  ).toBeDisabled();
  await ranks.nth(1).fill("2");
  await ranks.nth(2).fill("3");
  await freeze(page, "Podium");
  await scoreFirst(page, [9, 5, 1]);
  await section(page, "Statistics");
  await expect(
    page.locator(".prediction-leaderboard tbody tr td").nth(2),
  ).toHaveText("1");
  await page.reload();
  await saved(page);
  await section(page, "Statistics");
  await expect(
    page.locator(".prediction-leaderboard tbody tr td").nth(2),
  ).toHaveText("1");
});

test("Swiss predictions survive later pairings and separate round leaderboards", async ({
  page,
}) => {
  await importDocument(page, fixture("swiss", 5));
  await chooseWinners(page);
  await freeze(page, "Opening round");
  await scoreFirst(page);
  await scoreFirst(page);
  await page.getByRole("button", { name: "Next round", exact: true }).click();
  await saved(page);
  await section(page, "Statistics");
  await expect(
    page.getByText("This entry covers generated round 2 only.", {
      exact: false,
    }),
  ).toBeVisible();
  await chooseWinners(page);
  await freeze(page, "Second round");
  await expect(page.locator(".prediction-leaderboard tbody tr")).toHaveCount(1);
  await expect(page.locator(".prediction-leaderboard tbody tr")).toContainText(
    "Second round",
  );
  const scope = page.getByLabel("Prediction leaderboard scope", {
    exact: true,
  });
  await expect(scope.locator("option")).toHaveCount(2);
  await scope.selectOption({ index: 0 });
  await expect(page.locator(".prediction-leaderboard tbody tr")).toContainText(
    "Opening round",
  );
  await expect(
    page.locator(".prediction-leaderboard tbody tr td").nth(2),
  ).toHaveText("2");
  await expect(
    page.getByText("This saved prediction no longer matches", { exact: false }),
  ).toHaveCount(0);
});

test("Persian multi-entrant prediction controls fit mobile and pass automated accessibility checks", async ({
  page,
}) => {
  const doc = fixture("free-for-all", 3);
  doc.participants.forEach((participant) => {
    participant.name = `تیم مسابقات دانشگاهی با نام بلند برای پیش‌بینی رتبه ${participant.seed}`;
  });
  await importDocument(page, doc);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  const builder = page.locator(".prediction-builder");
  await expect(builder.getByRole("spinbutton").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include(".prediction-builder")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
