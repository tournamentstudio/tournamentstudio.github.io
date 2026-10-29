import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Tournament } from "../../src/domain/types";

const names = [
  "قهرمانان‌دانشگاه‌صنعتی‌امیرکبیر Tehran 1",
  "Shiraz دست‌های‌هنرمندان‌ایران 2",
  "باشگاه‌فرهنگی‌ورزشی‌ستاره‌های‌اصفهان 3",
  "Tabriz Hidden Hands 4",
  "تیم‌دانشجویان‌دانشگاه‌فردوسی‌مشهد 5",
  "Yazd گل‌های‌کویر 6",
  "تیم‌دوستان‌بندرعباس‌و‌جزیره‌هرمز 7",
  "Rasht Northern Stars 8",
];

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText(
    /Saved locally|محلی ذخیره شد/,
  );
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}

async function section(page: Page, name: string) {
  await page
    .locator(".workspace-tabs")
    .getByRole("button", { name, exact: true })
    .click();
}

async function createEvent(page: Page) {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("جام دست‌های ایران Hands rehearsal");
  await page.getByLabel("Sport or activity").selectOption("gol-ya-pooch");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Competition format").selectOption("groups");
  await page.getByLabel("Participant count", { exact: true }).fill("8");
  await page.getByLabel("Number of groups", { exact: true }).fill("2");
  await page.getByLabel("Add a knockout playoff stage").check();
  await page.getByLabel("Or paste names, one per line").fill(names.join("\n"));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Tournament theme", exact: true })
    .selectOption("gol-traditional");
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await saved(page);
  return page.url();
}

async function stored(page: Page): Promise<Tournament> {
  return page.evaluate(
    (id) =>
      new Promise<Tournament>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("documents")
            .objectStore("documents")
            .get(id);
          read.onsuccess = () => {
            database.close();
            resolve(read.result.payload);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
    page.url().split("/t/")[1],
  );
}

async function finishOpenMatch(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  const entrants = await dialog.locator(".score-side > bdi").allTextContents();
  for (let index = 0; index < entrants.length; index++) {
    const seed = Number(entrants[index].match(/\d+$/)?.[0]);
    expect(seed).toBeGreaterThan(0);
    await dialog
      .locator(".score-entry input")
      .nth(index)
      .fill(String(100 - seed));
  }
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

test("rehearses Gol hands, pauses, offline play, qualification and backup recovery", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const url = await createEvent(page);
  await section(page, "Presentation");
  await page.getByLabel("Start automatic rotation", { exact: true }).uncheck();
  await saved(page);
  await page
    .getByRole("combobox", { name: "Scene type", exact: true })
    .selectOption("current");
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await saved(page);
  const projector = await context.newPage();
  await projector.goto(url.replace("#/t/", "#/present/"));
  for (let index = 0; index < 3; index++)
    await projector
      .getByRole("button", { name: "Next scene", exact: true })
      .click();
  await expect(projector.getByTestId("presentation-scoreboard")).toBeVisible();

  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  let dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog
    .getByRole("button", { name: "Referee mode", exact: true })
    .click();
  await dialog
    .getByLabel("Concealed position (private)", { exact: true })
    .fill("REHEARSAL-PRIVATE-HAND");
  await dialog.getByLabel("Hand points", { exact: true }).fill("3");
  await dialog
    .getByRole("button", { name: "Start timer", exact: true })
    .click();
  await saved(page);
  await expect(dialog.getByRole("timer")).not.toHaveText("00:00");
  await dialog
    .getByRole("button", { name: "Pause timer", exact: true })
    .click();
  await saved(page);
  await dialog
    .getByRole("button", { name: "Record hand", exact: true })
    .click();
  await saved(page);
  await expect(projector.locator(".scoreboard-entrant strong")).toHaveText([
    "3",
    "0",
  ]);
  expect(await projector.content()).not.toContain("REHEARSAL-PRIVATE-HAND");
  await projector.screenshot({
    path: testInfo.outputPath("gol-event-projector.png"),
  });
  await dialog
    .getByRole("button", { name: "Undo hand 1", exact: true })
    .click();
  await saved(page);
  await expect(projector.locator(".scoreboard-entrant strong")).toHaveText([
    "0",
    "0",
  ]);
  await expect(
    dialog.getByLabel("Concealed position (private)", { exact: true }),
  ).toHaveValue("");
  const pausedClock = (await stored(page)).matches.find(
    (match) => match.status === "live",
  )!.golState!;
  expect(pausedClock.elapsedMs).toBeGreaterThan(0);
  expect(pausedClock.runningSince).toBeUndefined();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await saved(page);
    await section(page, "Matches");
    await page.locator("button.match-tile.live").click();
    dialog = page.getByRole("dialog", { name: "Match control", exact: true });
    await dialog
      .getByRole("button", { name: "Referee mode", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Start timer", exact: true }),
    ).toBeEnabled();
    expect(
      (await stored(page)).matches.find((match) => match.status === "live")!
        .golState,
    ).toEqual(pausedClock);
    await dialog.getByLabel("Hand points", { exact: true }).fill("2");
    await dialog
      .getByRole("button", { name: "Record hand", exact: true })
      .click();
    await saved(page);
    await expect(projector.locator(".scoreboard-entrant strong")).toHaveText([
      "2",
      "0",
    ]);
    await dialog
      .getByRole("button", { name: "Quick scorekeeping", exact: true })
      .click();
    await finishOpenMatch(page);
  } finally {
    await context.setOffline(false);
    await projector.close();
  }
  for (let index = 0; index < 11; index++) {
    await page.locator("button.match-tile.ready").first().click();
    await finishOpenMatch(page);
  }
  await section(page, "Structure");
  await page.locator(".stage-node").filter({ hasText: "Playoffs" }).click();
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  await section(page, "Matches");
  for (let index = 0; index < 3; index++) {
    await page.locator("button.match-tile.ready").first().click();
    await finishOpenMatch(page);
  }
  await section(page, "Overview");
  await expect(page.locator(".overview-welcome h2")).toHaveText(names[0]);
  const finished = await stored(page);
  expect(finished.matches.filter((match) => match.result)).toHaveLength(15);
  expect(
    finished.participants.every(
      (participant) => participant.roster.length === 3,
    ),
  ).toBe(true);
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("rehearsal.tourney");
  await (await download).saveAs(archive);
  const recovery = await browser.newContext();
  try {
    const fresh = await recovery.newPage();
    await fresh.goto("/");
    await fresh
      .getByRole("button", { name: "Import a tournament", exact: true })
      .click();
    const importer = fresh.getByRole("dialog", {
      name: "Bring a tournament into your studio",
    });
    await importer.locator('input[type="file"]').setInputFiles(archive);
    await importer
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await importer
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(fresh);
    const restored = await stored(fresh);
    expect(restored.matches).toEqual(finished.matches);
    expect(restored.participants).toEqual(finished.participants);
    expect(restored.presentation).toEqual(finished.presentation);
    await expect(fresh.locator(".overview-welcome h2")).toHaveText(names[0]);
  } finally {
    await recovery.close();
  }
});

test("keeps long Persian hand logs usable with touch and keyboard at 320px", async ({
  browser,
}, testInfo) => {
  const touch = await browser.newContext({
    viewport: { width: 320, height: 740 },
    hasTouch: true,
  });
  try {
    const page = await touch.newPage();
    await createEvent(page);
    await page
      .getByRole("button", { name: "Switch to Persian", exact: true })
      .tap();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await section(page, "دیدارها");
    const opener = page.locator("button.match-tile.ready").first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "کنترل دیدار",
      exact: true,
    });
    await dialog.getByRole("button", { name: "حالت داور", exact: true }).tap();
    const record = dialog.getByRole("button", { name: "ثبت دست", exact: true });
    await record.tap();
    await saved(page);
    await expect(dialog.locator(".hand-log li")).toHaveCount(1);
    const fits = await dialog.evaluate((node) => ({
      dialog: node.scrollWidth <= node.clientWidth + 2,
      page: document.documentElement.scrollWidth <= innerWidth + 2,
      log: [...node.querySelectorAll(".hand-log li > bdi")].every((name) => {
        const box = name.getBoundingClientRect();
        const row = name.parentElement!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(name);
        return (
          [...range.getClientRects()].every(
            (rect) => rect.left >= box.left - 1 && rect.right <= box.right + 1,
          ) &&
          box.left >= row.left - 1 &&
          box.right <= row.right + 1
        );
      }),
    }));
    expect(fits).toEqual({ dialog: true, page: true, log: true });
    const accessibility = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.locator(".hand-log").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("persian-hand-log.png"),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("button.match-tile.live").first()).toBeFocused();
    await page
      .getByRole("button", { name: "تغییر به انگلیسی", exact: true })
      .tap();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    const live = page.locator("button.match-tile.live").first();
    await live.focus();
    await page.keyboard.press("Enter");
    const english = page.getByRole("dialog", {
      name: "Match control",
      exact: true,
    });
    await english
      .getByRole("button", { name: "Referee mode", exact: true })
      .tap();
    await expect(english.locator(".hand-log li > bdi")).toHaveText(names[0]);
    await expect(
      english.getByRole("button", { name: "Undo hand 1", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(live).toBeFocused();
  } finally {
    await touch.close();
  }
});
