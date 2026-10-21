import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

function fixture() {
  const teams = [createParticipant("North", 1), createParticipant("South", 2)];
  teams[0].roster = [
    { id: "north-player", name: "بازیکن شمال N", role: "captain" },
    { id: "north-coach", name: "Private coach", role: "coach" },
  ];
  teams[1].roster = [
    { id: "south-player", name: "South player", role: "player" },
  ];
  const doc = createTournament(
    "Player observations cup",
    teams,
    "single-elimination",
    "football",
  );
  return generateStage(doc, doc.stages[0].id);
}
async function saved(page: Page) {
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
}
async function importFile(page: Page, data: Buffer, name = "players.json") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: name.endsWith("json")
      ? "application/json"
      : "application/octet-stream",
    buffer: data,
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
async function section(page: Page, name: string, fa = false) {
  await page
    .getByRole("navigation", {
      name: fa ? "بخش‌های مسابقات" : "Tournament sections",
    })
    .getByRole("button", { name, exact: true })
    .click();
}
async function open(page: Page, doc: Tournament = fixture()) {
  await importFile(page, Buffer.from(JSON.stringify(doc)));
  await section(page, "Statistics");
  await page
    .getByRole("button", { name: "Add sport metrics", exact: true })
    .click();
  await saved(page);
}
async function record(page: Page) {
  await page
    .getByRole("button", { name: "Record player event", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record player event",
    exact: true,
  });
  await dialog
    .getByLabel("Roster player", { exact: true })
    .selectOption("north-player");
  await expect(
    dialog
      .getByLabel("Roster player", { exact: true })
      .getByRole("option", { name: "Private coach" }),
  ).toHaveCount(0);
  await dialog.getByLabel("Recorded value", { exact: true }).fill("2");
  await dialog
    .getByLabel("Elapsed seconds (optional)", { exact: true })
    .fill("90.5");
  await dialog
    .getByLabel("Period or round", { exact: true })
    .fill("First half");
  await dialog
    .getByLabel("Private event notes", { exact: true })
    .fill("Player-only private note");
  await dialog
    .getByRole("button", { name: "Save player event", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}
test("records player observations, persists them, and corrects/removes/restores with audit", async ({
  page,
}) => {
  await open(page);
  await record(page);
  const studio = page.locator(".player-statistics-studio");
  await expect(studio.locator("tbody tr")).toContainText("بازیکن شمال N");
  await expect(studio.locator("tbody tr td").nth(3)).toHaveText("2");
  await page.reload();
  await section(page, "Statistics");
  await expect(studio.locator(".player-timeline li")).toContainText(
    "90.5 seconds",
  );
  await studio
    .getByRole("button", {
      name: "Review event for بازیکن شمال N",
      exact: true,
    })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Review player event",
    exact: true,
  });
  await dialog.getByLabel("Recorded value", { exact: true }).fill("3");
  await dialog
    .getByLabel("Reason for correction or removal", { exact: true })
    .fill("Checked recording");
  await dialog
    .getByRole("button", { name: "Save reviewed event", exact: true })
    .click();
  await saved(page);
  await expect(studio.locator("tbody tr td").nth(3)).toHaveText("3");
  await studio
    .getByRole("button", {
      name: "Review event for بازیکن شمال N",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review player event",
    exact: true,
  });
  await dialog
    .getByLabel("Reason for correction or removal", { exact: true })
    .fill("Duplicate entry");
  await dialog
    .getByRole("button", { name: "Remove from totals", exact: true })
    .click();
  await saved(page);
  await expect(studio.locator("tbody tr")).toHaveCount(0);
  await expect(studio.locator(".player-timeline li")).toContainText("Removed");
  await studio
    .getByRole("button", {
      name: "Review event for بازیکن شمال N",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Review player event",
    exact: true,
  });
  await dialog.getByText("Event audit history", { exact: true }).click();
  await expect(dialog).toContainText("Checked recording");
  await expect(dialog).toContainText("Duplicate entry");
  await dialog
    .getByLabel("Reason for correction or removal", { exact: true })
    .fill("Review confirmed observation");
  await dialog
    .getByRole("button", { name: "Save reviewed event", exact: true })
    .click();
  await saved(page);
  await expect(studio.locator("tbody tr td").nth(3)).toHaveText("3");
});

test("first official result retains live observations and a score correction quarantines them", async ({
  page,
}) => {
  await open(page);
  await record(page);
  await section(page, "Matches");
  await page.locator(".match-tile.ready").click();
  let dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog.getByLabel("Score North", { exact: true }).fill("2");
  await dialog.getByLabel("Score South", { exact: true }).fill("0");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await saved(page);
  await section(page, "Statistics");
  await expect(page.locator(".player-statistics-studio tbody tr")).toHaveCount(
    1,
  );
  await section(page, "Matches");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await page.locator(".match-tile.completed").click();
  dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog.getByLabel("Score North", { exact: true }).fill("3");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await saved(page);
  await section(page, "Statistics");
  await expect(page.locator(".player-review-warning")).toContainText(
    "1 events need review",
  );
  await expect(page.locator(".player-statistics-studio tbody tr")).toHaveCount(
    0,
  );
  await expect(page.locator(".player-timeline")).toContainText("Needs review");
});

test("private archives reconstruct player history in another profile while public JSON excludes it", async ({
  page,
  browser,
}) => {
  await open(page);
  await record(page);
  await section(page, "Share Center");
  let download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const privateFile = await download,
    privateData = await readFile((await privateFile.path())!);
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const publicFile = await download,
    publicData = await readFile((await publicFile.path())!);
  expect(publicData.toString()).not.toContain("playerStatistics");
  expect(publicData.toString()).not.toContain("Player-only private note");
  expect(publicData.toString()).not.toContain("بازیکن شمال N");
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importFile(recipient, privateData, "players.tourney");
    await section(recipient, "Statistics");
    await expect(recipient.locator(".player-timeline")).toContainText(
      "Player-only private note",
    );
    await recipient
      .getByRole("button", { name: "Export player CSV", exact: true })
      .click();
    const csvDownload = recipient.waitForEvent("download");
    await recipient
      .getByRole("button", { name: "Download private player CSV", exact: true })
      .click();
    const csvFile = await csvDownload,
      csv = await readFile((await csvFile.path())!);
    expect(csv.toString()).toContain("بازیکن شمال N");
    expect(csv.toString()).toContain("Private notes");
  } finally {
    await context.close();
  }
});

test("defines a decimal average metric and filters an individual player's match history", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Add player metric", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Add player metric",
    exact: true,
  });
  await dialog
    .getByLabel("Metric name", { exact: true })
    .fill("Accuracy observation");
  await dialog
    .getByLabel("Metric value type", { exact: true })
    .selectOption("decimal");
  await dialog
    .getByLabel("Player aggregation", { exact: true })
    .selectOption("average");
  await dialog
    .getByRole("button", { name: "Save player metric", exact: true })
    .click();
  await saved(page);
  for (const value of [1.25, 3.75]) {
    await page
      .getByRole("button", { name: "Record player event", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: "Record player event",
      exact: true,
    });
    await dialog
      .getByLabel("Roster player", { exact: true })
      .selectOption("north-player");
    await dialog
      .getByLabel("Player metric", { exact: true })
      .selectOption({ label: "Accuracy observation" });
    await dialog
      .getByLabel("Recorded value", { exact: true })
      .fill(String(value));
    await dialog
      .getByRole("button", { name: "Save player event", exact: true })
      .click();
    await saved(page);
  }
  const studio = page.locator(".player-statistics-studio");
  await studio
    .getByLabel("Player history", { exact: true })
    .selectOption({ label: "بازیکن شمال N / North" });
  await expect(studio.locator("tbody tr td").nth(3)).toHaveText("2.5");
  await expect(studio.locator("tbody tr td").nth(4)).toHaveText("2");
});

test("Persian player controls and event timeline fit 320 pixels and support keyboard input", async ({
  page,
}) => {
  const doc = fixture();
  const longName = "بازیکن شمال North ".repeat(20).slice(0, 240);
  doc.participants[0].roster[0].name = longName;
  doc.participants[0].name = "تیم دانشگاه شمال University "
    .repeat(12)
    .slice(0, 240);
  await open(page, doc);
  await record(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  const studio = page.locator(".player-statistics-studio");
  await expect(
    studio.getByRole("heading", { name: "آمار بازیکنان", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".player-statistics-studio")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const opener = studio.getByRole("button", {
    name: `بازبینی رویداد ${longName.trim()}`,
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "بازبینی رویداد بازیکن",
    exact: true,
  });
  await expect(dialog.getByLabel("مقدار ثبت شده", { exact: true })).toHaveValue(
    "2",
  );
  const overflow = await dialog.evaluate(
    (node) => node.scrollWidth > node.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog[open]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/players-persian-mobile.png",
    fullPage: true,
  });
  const audit = dialog.getByText("تاریخچه تغییرات رویداد", { exact: true });
  const close = dialog.getByRole("button", { name: "بستن پنجره", exact: true });
  await audit.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(audit).toBeFocused();
  await audit.press("Enter");
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});
