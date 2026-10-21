import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { readFile } from "node:fs/promises";

async function openCup(
  page: Page,
  weighted = true,
  aggregate = false,
  awayGoals = false,
) {
  let doc = createTournament(
    "Judges cup",
    [createParticipant("First team", 1), createParticipant("Second team", 2)],
    "single-elimination",
  );
  if (weighted) {
    doc.rules.scoring = "weighted";
    doc.rules.metricDefinitions = [
      {
        id: "skill",
        name: "Skill",
        unit: "points",
        kind: "judges",
        min: 0,
        max: 10,
        judgeCount: 3,
        judgeMethod: "trimmed-mean",
        aggregate: "average",
        weight: 2,
      },
      {
        id: "deductions",
        name: "Deductions",
        unit: "points",
        kind: "number",
        min: 0,
        max: 10,
        aggregate: "sum",
        weight: -1,
      },
    ];
  }
  if (aggregate)
    doc.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
      awayGoals,
    };
  doc = generateStage(doc, doc.stages[0].id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "judges.json",
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
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
test("records weighted judge inputs, preserves them on reload and reports actual statistics", async ({
  page,
}) => {
  await openCup(page);
  await section(page, "Matches");
  await page.locator(".match-tile.ready").first().click();
  let dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog
    .getByLabel("Skill: First team", { exact: true })
    .pressSequentially("7,8,9");
  await dialog
    .getByLabel("Skill: Second team", { exact: true })
    .pressSequentially("6,7,8");
  await dialog.getByLabel("Deductions: First team", { exact: true }).fill("1");
  await dialog.getByLabel("Deductions: Second team", { exact: true }).fill("2");
  await expect(
    dialog.getByLabel("Score First team", { exact: true }),
  ).toHaveValue("15");
  await expect(
    dialog.getByLabel("Score Second team", { exact: true }),
  ).toHaveValue("12");
  await expect(
    dialog.getByLabel("Score First team", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.reload();
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator(".match-tile.completed").click();
  dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await expect(
    dialog.getByLabel("Skill: First team", { exact: true }),
  ).toHaveValue("7, 8, 9");
  await page.keyboard.press("Escape");
  await section(page, "Statistics");
  const stats = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Recorded sport statistics",
      exact: true,
    }),
  });
  await expect(
    stats.getByRole("row").filter({ hasText: "First team" }),
  ).toContainText("8");
  await expect(
    stats.getByRole("row").filter({ hasText: "First team" }),
  ).toContainText("1 matches");
  await section(page, "Rules");
  await expect(
    page.getByLabel("Scoring system", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Dimension name", { exact: true }).first(),
  ).toBeDisabled();
});
test("builds weighted scoring in Rules and rejects missing measurements", async ({
  page,
}) => {
  await openCup(page, false);
  await section(page, "Rules");
  await page
    .getByRole("button", { name: "Add dimension", exact: true })
    .click();
  await page.getByLabel("Dimension name", { exact: true }).fill("Quiz points");
  await page
    .getByLabel("Scoring weight (empty means statistics only)", { exact: true })
    .fill("2");
  await page
    .getByLabel("Scoring system", { exact: true })
    .selectOption("weighted");
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await section(page, "Matches");
  await page.locator(".match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Enter Quiz points for every entrant",
  );
  await dialog.getByLabel("Quiz points: First team", { exact: true }).fill("4");
  await dialog
    .getByLabel("Quiz points: Second team", { exact: true })
    .fill("3");
  await expect(
    dialog.getByLabel("Score First team", { exact: true }),
  ).toHaveValue("8");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
});
test("keeps Persian metric controls within a narrow viewport and keyboard accessible", async ({
  page,
}) => {
  await openCup(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name: "قوانین", exact: true })
    .click();
  await expect(page.getByLabel("روش امتیازدهی", { exact: true })).toHaveValue(
    "weighted",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
test("records public fair-play sanctions and shows the configured standings column", async ({
  page,
}) => {
  await openCup(page, false);
  await section(page, "Rules");
  await page
    .getByLabel("Add a tiebreaker", { exact: true })
    .selectOption("fair-play");
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await section(page, "Matches");
  await page.locator(".match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog.getByLabel("Score First team", { exact: true }).fill("2");
  await dialog
    .locator("summary")
    .filter({ hasText: "Sets, referee, and private notes" })
    .click();
  await expect(
    dialog.getByLabel("Record fair-play penalties", { exact: true }),
  ).toBeChecked();
  await dialog
    .getByLabel("Fair-play penalties: First team", { exact: true })
    .fill("3");
  await dialog
    .getByLabel("Fair-play penalties: Second team", { exact: true })
    .fill("1");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await section(page, "Standings");
  await expect(
    page.getByRole("columnheader", {
      name: "Fair-play penalties",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: "First team", exact: true }),
      })
      .locator("td")
      .last(),
  ).toHaveText("3");
});

test("calculates placement awards from finishing ranks and saves the same public statistics", async ({
  page,
}) => {
  await openCup(page, false);
  await section(page, "Rules");
  await page
    .getByRole("button", { name: "Add placement points", exact: true })
    .click();
  await page
    .getByLabel("Placement points table", { exact: true })
    .fill("10, 0");
  await page
    .getByLabel("Scoring system", { exact: true })
    .selectOption("weighted");
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await section(page, "Matches");
  await page.locator(".match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog
    .getByLabel("Finishing place: First team", { exact: true })
    .fill("2");
  await dialog
    .getByLabel("Finishing place: Second team", { exact: true })
    .fill("1");
  await expect(
    dialog.getByLabel("Score First team", { exact: true }),
  ).toHaveValue("0");
  await expect(
    dialog.getByLabel("Score Second team", { exact: true }),
  ).toHaveValue("10");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await section(page, "Statistics");
  const stats = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Recorded sport statistics",
      exact: true,
    }),
  });
  await expect(
    stats.getByRole("row").filter({ hasText: "Second team" }),
  ).toContainText("10");
});

test("exports a weighted result proposal with sanctions for explicit organizer approval", async ({
  page,
}) => {
  await openCup(page);
  await section(page, "Offline exchange");
  const builder = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Prepare a result proposal",
      exact: true,
    }),
  });
  const select = builder.getByLabel("Match", { exact: true });
  await select.selectOption(
    (await select.locator("option").nth(1).getAttribute("value")) ?? "",
  );
  await builder.getByLabel("Skill: First team", { exact: true }).fill("7,8,9");
  await builder.getByLabel("Skill: Second team", { exact: true }).fill("6,7,8");
  await builder.getByLabel("Deductions: First team", { exact: true }).fill("1");
  await builder
    .getByLabel("Deductions: Second team", { exact: true })
    .fill("2");
  await builder
    .getByLabel("Record fair-play penalties", { exact: true })
    .check();
  await builder
    .getByLabel("Fair-play penalties: First team", { exact: true })
    .fill("3");
  await expect(builder.getByLabel("First team", { exact: true })).toHaveValue(
    "15",
  );
  const downloading = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Export proposed result", exact: true })
    .click();
  const downloaded = await downloading,
    payload = await readFile((await downloaded.path())!);
  expect(JSON.parse(payload.toString()).result).toMatchObject({
    scores: [15, 12],
    fairPlay: [3, 0],
    metrics: {
      skill: [
        [7, 8, 9],
        [6, 7, 8],
      ],
      deductions: [1, 2],
    },
  });
  await section(page, "Matches");
  await expect(page.locator(".match-tile.ready")).toHaveCount(1);
  await section(page, "Offline exchange");
  await page
    .getByLabel("Offline exchange file", { exact: true })
    .setInputFiles({
      name: "proposal.json",
      mimeType: "application/json",
      buffer: payload,
    });
  const review = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Review proposed result",
      exact: true,
    }),
  });
  await expect(review).toContainText("Fair-play penalties: 3 / 0");
  await expect(
    review.getByLabel("Skill: First team", { exact: true }),
  ).toHaveValue("7, 8, 9");
  await expect(
    review.getByLabel("Skill: First team", { exact: true }),
  ).toBeDisabled();
  await review
    .getByRole("button", { name: "Approve proposed result", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(
    page.getByText("Result proposal approved and recorded.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator(".match-tile.completed").click();
  await expect(
    page.getByRole("dialog").getByLabel("Score First team", { exact: true }),
  ).toHaveValue("15");
});

test("proposes aggregate leg evidence with calculated totals for organizer review", async ({
  page,
}) => {
  await openCup(page, false, true);
  await section(page, "Offline exchange");
  const builder = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Prepare a result proposal",
      exact: true,
    }),
  });
  const select = builder.getByLabel("Match", { exact: true });
  await select.selectOption(
    (await select.locator("option").nth(1).getAttribute("value")) ?? "",
  );
  await builder.getByLabel("Leg 1: First team", { exact: true }).fill("2");
  await builder.getByLabel("Leg 1: Second team", { exact: true }).fill("1");
  await builder.getByLabel("Leg 2: First team", { exact: true }).fill("3");
  await builder.getByLabel("Leg 2: Second team", { exact: true }).fill("1");
  await expect(builder.getByLabel("First team", { exact: true })).toHaveValue(
    "5",
  );
  const downloading = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Export proposed result", exact: true })
    .click();
  const downloaded = await downloading,
    payload = await readFile((await downloaded.path())!);
  expect(JSON.parse(payload.toString()).result).toMatchObject({
    scores: [5, 2],
    legs: [
      [2, 1],
      [3, 1],
    ],
  });
  await page
    .getByLabel("Offline exchange file", { exact: true })
    .setInputFiles({
      name: "proposal.json",
      mimeType: "application/json",
      buffer: payload,
    });
  const review = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Review proposed result",
      exact: true,
    }),
  });
  await expect(review).toContainText("Leg 2: 3 / 1");
  await review
    .getByRole("button", { name: "Approve proposed result", exact: true })
    .click();
  await expect(
    page.getByText("Result proposal approved and recorded.", { exact: true }),
  ).toBeVisible();
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator(".match-tile.completed")).toContainText("5");
});

test("uses configured away goals in an offline aggregate proposal", async ({
  page,
}) => {
  await openCup(page, false, true, true);
  await section(page, "Offline exchange");
  const builder = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Prepare a result proposal",
      exact: true,
    }),
  });
  const select = builder.getByLabel("Match", { exact: true });
  await select.selectOption(
    (await select.locator("option").nth(1).getAttribute("value")) ?? "",
  );
  await builder.getByLabel("Leg 1: First team", { exact: true }).fill("0");
  await builder.getByLabel("Leg 1: Second team", { exact: true }).fill("1");
  await builder.getByLabel("Leg 2: First team", { exact: true }).fill("2");
  await builder.getByLabel("Leg 2: Second team", { exact: true }).fill("1");
  await expect(builder.getByRole("status")).toContainText(
    "Winner on away goals: First team",
  );
  const downloading = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Export proposed result", exact: true })
    .click();
  const downloaded = await downloading,
    payload = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(payload.result.scores).toEqual([2, 2]);
  expect(payload.result.winnerIds).toHaveLength(1);
  expect(payload.result.aggregateTiebreakWinnerId).toBeUndefined();
  for (const leg of [1, 2])
    for (const name of ["First team", "Second team"])
      await builder
        .getByLabel(`Leg ${leg}: ${name}`, { exact: true })
        .fill("1000000000");
  await builder
    .getByRole("button", { name: "Export proposed result", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "The aggregate score exceeds the supported range.",
  );
});
