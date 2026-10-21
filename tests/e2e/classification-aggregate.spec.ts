import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import {
  changeMatchState,
  generateStage,
  getStandings,
  recordResult,
  simulate,
} from "../../src/engine";
import { saveAggregateProgress } from "../../src/engine/aggregate";

function fixture(count = 4) {
  return createTournament(
    "Classification and aggregate",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    "single-elimination",
  );
}
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
async function open(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "cup.json",
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
async function stored(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const request = db
          .transaction("documents")
          .objectStore("documents")
          .get(location.hash.split("/")[2]);
        request.onsuccess = () => resolve(request.result.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test("protects an arbitrary entrant at a physical slot after validated preview", async ({
  page,
}) => {
  await open(page, fixture(8));
  await section(page, "Structure");
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  await page.locator(".protected-slots-editor > summary").click();
  await page
    .getByRole("combobox", { name: "Entrant to protect", exact: true })
    .selectOption("p6");
  await page
    .getByRole("spinbutton", { name: "Protected physical slot", exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Set protected slot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const result = await stored(page);
  expect(result.stages[0].config.knockoutDraw?.fixedSlots).toEqual([
    { participantId: "p6", slot: 2 },
  ]);
  expect(
    result.matches.find((match) => match.round === 1 && match.index === 0)
      ?.slots[1].participantId,
  ).toBe("p6");
});

test("plays every classification match and shows unique final places", async ({
  page,
}) => {
  await open(page, fixture());
  await section(page, "Structure");
  await page
    .getByRole("checkbox", { name: "Play for every final place", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("checkbox", {
      name: "Play for every final place",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  expect((await stored(page)).matches).toHaveLength(4);
  await section(page, "Matches");
  for (let index = 0; index < 4; index++) {
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", {
      name: "Match control",
      exact: true,
    });
    await dialog.locator('.score-entry input[type="number"]').nth(0).fill("3");
    await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
    await dialog
      .getByRole("button", { name: "Confirm result", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(page);
  }
  const result = await stored(page);
  expect(
    getStandings(result, result.stages[0].id).map((row) => row.rank),
  ).toEqual([1, 2, 3, 4]);
  await section(page, "Standings");
  await expect(page.locator(".workspace-fieldset")).toContainText("Team 1");
});

test("saves aggregate leg progress across reload and advances only the final sum winner", async ({
  page,
}) => {
  await open(page, fixture());
  await section(page, "Structure");
  await page
    .getByRole("checkbox", { name: "Aggregate legs", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("checkbox", { name: "Aggregate legs", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  let dialog = page.getByRole("dialog", {
    name: "Aggregate match control",
    exact: true,
  });
  await dialog.getByRole("spinbutton").nth(0).fill("3");
  await dialog.getByRole("spinbutton").nth(1).fill("1");
  await dialog
    .getByRole("button", { name: "Save leg progress", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  let result = await stored(page),
    match = result.matches.find((item) => item.status === "live")!;
  expect(match.result).toBeUndefined();
  expect(match.aggregateProgress).toEqual([[3, 1]]);
  await page.reload();
  await section(page, "Matches");
  await page.locator("button.match-tile.live").click();
  dialog = page.getByRole("dialog", {
    name: "Aggregate match control",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "every required regulation leg",
  );
  await dialog
    .getByRole("button", { name: "Add next leg", exact: true })
    .click();
  await dialog.getByRole("spinbutton").nth(2).fill("0");
  await dialog.getByRole("spinbutton").nth(3).fill("4");
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  result = await stored(page);
  match = result.matches.find((item) => item.id === match.id)!;
  expect(match.result?.scores).toEqual([3, 5]);
  expect(match.result?.winnerIds).toEqual([match.slots[1].participantId]);
  expect(
    result.matches
      .find((item) =>
        item.slots.some((slot) => slot.source?.matchId === match.id),
      )
      ?.slots.some(
        (slot) => slot.participantId === match.slots[1].participantId,
      ),
  ).toBe(true);
});

test("requires an extra aggregate leg and records an explicit tied final ruling", async ({
  page,
}) => {
  const doc = fixture(2);
  doc.stages[0].config.aggregate = {
    version: 1,
    legs: 2,
    tieBreak: "extra-leg",
  };
  await open(page, generateStage(doc, doc.stages[0].id));
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").click();
  const dialog = page.getByRole("dialog", {
    name: "Aggregate match control",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Add next leg", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Ruling winner", exact: true })
    .selectOption("p1");
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("configured extra leg");
  await dialog
    .getByRole("button", { name: "Add next leg", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  expect((await stored(page)).matches[0].result).toMatchObject({
    legs: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    aggregateTiebreakWinnerId: "p1",
    winnerIds: ["p1"],
  });
});

test("reviews upstream reopening then postpones and holds an abandoned match for a ruling", async ({
  page,
}) => {
  const doc = fixture();
  await open(page, simulate(generateStage(doc, doc.stages[0].id)));
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator("button.match-tile.completed").first().click();
  let dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog
    .getByText("Reopen or change match status", { exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply match status", exact: true })
    .click();
  await expect(dialog).toContainText("recovery record");
  await dialog
    .getByRole("button", {
      name: "Confirm status and reopen dependents",
      exact: true,
    })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  expect((await stored(page)).metadata.correctionRecovery).toBeTruthy();
  await page.locator("button.match-tile.ready").first().click();
  dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog
    .getByText("Reopen or change match status", { exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Operating status", exact: true })
    .selectOption("postponed");
  await dialog
    .getByRole("button", { name: "Apply match status", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await page.locator("button.match-tile.postponed").click();
  dialog = page.getByRole("dialog", { name: "Match control", exact: true });
  await dialog
    .getByText("Reopen or change match status", { exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Operating status", exact: true })
    .selectOption("abandoned");
  await dialog
    .getByRole("button", { name: "Apply match status", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  expect(
    (await stored(page)).matches.find((match) => match.status === "contested")
      ?.metadata.awaitingRuling,
  ).toBe("abandoned");
  await expect(page.locator("button.match-tile.contested")).toContainText(
    "Awaiting ruling",
  );
});

test("Persian aggregate controls fit a narrow screen with long mixed-script names", async ({
  page,
}, testInfo) => {
  const doc = fixture(2);
  doc.participants[0].name =
    "تیم دانشگاه صنعتی تهران و پژوهشگران مسابقات Team A";
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  await open(page, generateStage(doc, doc.stages[0].id));
  await section(page, "Matches");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page.locator("button.match-tile.ready").click();
  const dialog = page.getByRole("dialog", {
    name: "کنترل دیدار رفت و برگشت",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "افزودن بازی بعدی", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("aggregate-fa-mobile.png"),
  });
});

test("classifies every double-elimination entrant without changing the championship path", async ({
  page,
}) => {
  const doc = fixture(8);
  doc.stages[0].format = "double-elimination";
  await open(page, doc);
  await section(page, "Structure");
  await page
    .getByRole("checkbox", { name: "Play for every final place", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  expect(
    (await stored(page)).matches.filter(
      (match) => match.bracket === "placement",
    ),
  ).toHaveLength(2);
  await section(page, "Matches");
  for (let index = 0; index < 16; index++) {
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", {
      name: "Match control",
      exact: true,
    });
    await dialog.locator('.score-entry input[type="number"]').nth(0).fill("3");
    await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
    await dialog
      .getByRole("button", { name: "Confirm result", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(page);
  }
  const result = await stored(page);
  expect(result.stages[0].status).toBe("completed");
  expect(
    getStandings(result, result.stages[0].id).map((row) => row.rank),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(
    result.matches.find((match) => match.bracket === "reset")?.status,
  ).toBe("canceled");
});

test("optional away-goal policy resolves regulation ties before any extra leg", async ({
  page,
}) => {
  await open(page, fixture(2));
  await section(page, "Structure");
  await page
    .getByRole("checkbox", { name: "Aggregate legs", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("combobox", { name: "Aggregate tiebreak", exact: true })
    .selectOption("extra-leg");
  await saved(page);
  await page
    .getByRole("checkbox", {
      name: "Use regulation away goals to break ties",
      exact: true,
    })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").click();
  const dialog = page.getByRole("dialog", {
    name: "Aggregate match control",
    exact: true,
  });
  await dialog.getByRole("spinbutton").nth(0).fill("2");
  await dialog.getByRole("spinbutton").nth(1).fill("1");
  await dialog
    .getByRole("button", { name: "Add next leg", exact: true })
    .click();
  await dialog.getByRole("spinbutton").nth(3).fill("1");
  await expect(
    dialog.getByRole("combobox", { name: "Ruling winner", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Add next leg", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  expect((await stored(page)).matches[0].result).toMatchObject({
    scores: [2, 2],
    winnerIds: ["p2"],
    legs: [
      [2, 1],
      [0, 1],
    ],
  });
});

test("warns before upstream correction clears a postponed downstream leg", async ({
  page,
}) => {
  let doc = fixture();
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  doc = generateStage(doc, doc.stages[0].id);
  for (const match of doc.matches.filter((item) => item.round === 1))
    doc = recordResult(doc, match.id, {
      scores: [2, 0],
      legs: [
        [1, 0],
        [1, 0],
      ],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
  const final = doc.matches.find((match) => match.round === 2)!;
  doc = changeMatchState(
    saveAggregateProgress(doc, final.id, [[2, 1]]),
    final.id,
    "postponed",
  );
  await open(page, doc);
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator("button.match-tile.completed").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Aggregate match control",
    exact: true,
  });
  await dialog.getByRole("spinbutton").nth(0).fill("0");
  await dialog.getByRole("spinbutton").nth(1).fill("3");
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Confirm reopening these dependent results",
  );
  await expect(dialog.locator("li")).toContainText(final.label);
  await dialog
    .getByRole("button", { name: "Keep current result", exact: true })
    .click();
  expect(
    (await stored(page)).matches.find((match) => match.id === final.id)
      ?.aggregateProgress,
  ).toEqual([[2, 1]]);
  await dialog
    .getByRole("button", { name: "Confirm aggregate result", exact: true })
    .click();
  await dialog
    .getByRole("button", {
      name: "Confirm correction and reset dependents",
      exact: true,
    })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  const corrected = await stored(page);
  expect(
    corrected.matches.find((match) => match.id === final.id)?.aggregateProgress,
  ).toBeUndefined();
  const recovery = corrected.metadata.correctionRecovery as {
    matches: { id: string; aggregateProgress?: number[][] }[];
  }[];
  expect(
    recovery.at(-1)?.matches.find((match) => match.id === final.id)
      ?.aggregateProgress,
  ).toEqual([[2, 1]]);
});
