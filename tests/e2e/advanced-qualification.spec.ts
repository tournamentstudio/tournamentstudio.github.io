import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";

function fixture(format: "swiss" | "single-elimination", count = 6) {
  const doc = createTournament(
    "Advanced stage choices",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    format,
  );
  doc.stages[0].config.rounds = 3;
  return generateStage(doc, doc.stages[0].id);
}
function firstResults(input: Tournament) {
  let doc = input;
  for (const match of doc.matches.filter(
    (match) => match.round === 1 && match.status === "ready",
  ))
    doc = recordResult(doc, match.id, {
      scores: [2, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
  return doc;
}
async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function open(page: Page, doc: Tournament) {
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
      name: "stage.json",
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
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Structure", exact: true })
    .click();
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

test("routes actual first-round losers into another stage before the source final", async ({
  page,
}) => {
  const doc = firstResults(fixture("single-elimination", 8));
  doc.stages.push({
    id: "placement",
    name: "Placement",
    order: 1,
    format: "single-elimination",
    formatVersion: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [{ stageId: doc.stages[0].id, count: 4, perGroup: false }],
    status: "draft",
    metadata: {},
  });
  await open(page, doc);
  await page
    .getByRole("combobox", { name: "Selected stage", exact: true })
    .selectOption("placement");
  await page
    .getByRole("combobox", { name: "Qualification rule 1", exact: true })
    .selectOption("match-results");
  await page
    .getByRole("spinbutton", { name: "Qualifiers to take 1", exact: true })
    .fill("4");
  const matches = doc.matches.filter((match) => match.round === 1);
  for (let i = 0; i < matches.length; i++) {
    if (i)
      await page
        .getByRole("button", { name: "Add match outcome", exact: true })
        .click();
    await page
      .getByRole("combobox", { name: `Source match 1.${i + 1}`, exact: true })
      .selectOption(matches[i].id);
    await page
      .getByRole("combobox", {
        name: `Outcome to advance 1.${i + 1}`,
        exact: true,
      })
      .selectOption("losers");
  }
  await expect(
    page.getByRole("region", { name: "Qualifier preview", exact: true }),
  ).toContainText("Ready to draw");
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const result = await stored(page);
  expect(result.stages[0].status).toBe("active");
  expect(result.stages[1].participantIds).toEqual(
    matches.map((match) => match.slots[1].participantId),
  );
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Structure", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Selected stage", exact: true })
    .selectOption("placement");
  await expect(page.locator(".structure-source-rule")).toContainText(
    "Winners / losers of matches",
  );
});

test("validates and confirms manual Swiss pairing before replacing an unplayed round", async ({
  page,
}) => {
  const doc = fixture("swiss");
  doc.matches[0].scheduledAt = doc.schedule.startAt;
  await open(page, doc);
  const panel = page.locator(".swiss-pairing-editor");
  await panel.locator(":scope > summary").click();
  const first = doc.matches[0].slots[1].participantId!,
    second = doc.matches[1].slots[1].participantId!;
  await panel
    .getByRole("combobox", { name: "Second side 1", exact: true })
    .selectOption(second);
  await panel
    .getByRole("button", { name: "Review Swiss pairings", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("exactly once");
  await panel
    .getByRole("combobox", { name: "Second side 2", exact: true })
    .selectOption(first);
  await panel
    .getByRole("button", { name: "Review Swiss pairings", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Apply manual Swiss pairings?",
  });
  await expect(confirmation).toContainText("removes its schedule assignments");
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await saved(page);
  const result = await stored(page);
  expect(result.matches[0].slots[1].participantId).toBe(second);
  expect(
    result.matches.every(
      (match) => match.metadata.manualPairing && !match.scheduledAt,
    ),
  ).toBe(true);
});

test("saves a balanced Swiss policy and admits a late entrant with declared credits", async ({
  page,
}) => {
  const doc = firstResults(fixture("swiss"));
  await open(page, doc);
  const panel = page.locator(".swiss-policy-editor");
  await panel.locator(":scope > summary").click();
  await panel
    .getByRole("combobox", { name: "Playing side policy", exact: true })
    .selectOption("balanced");
  await panel
    .getByRole("combobox", { name: "Side preference entrant", exact: true })
    .selectOption("p1");
  await panel
    .getByRole("combobox", { name: "Initial side preference", exact: true })
    .selectOption("second");
  await panel
    .getByRole("button", { name: "Set initial preference", exact: true })
    .click();
  await panel
    .getByRole("checkbox", {
      name: "Allow late entrants between rounds",
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", { name: "Apply Swiss policy", exact: true })
    .click();
  await saved(page);
  await panel
    .getByRole("textbox", { name: "Late entrant name", exact: true })
    .fill("بازیکن تازه New player");
  await panel
    .getByRole("spinbutton", {
      name: "Missed-round credit points",
      exact: true,
    })
    .fill("1");
  await panel
    .getByRole("button", { name: "Review late entrant", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Admit this Swiss entrant?",
  });
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await saved(page);
  const result = await stored(page);
  expect(result.participants).toHaveLength(7);
  expect(result.stages[0].config.swiss).toMatchObject({
    colorPolicy: "balanced",
    allowLateEntrants: true,
    preferences: { p1: "second" },
    lateEntries: [
      { participantId: result.participants[6].id, joinedRound: 2, points: 1 },
    ],
  });
  expect(result.matches).toEqual(doc.matches);
  await page
    .getByRole("button", { name: "Advance / next round", exact: true })
    .click();
  await saved(page);
  expect(
    (await stored(page)).matches
      .filter((match) => match.round === 2)
      .flatMap((match) => match.slots.map((slot) => slot.participantId)),
  ).toContain(result.participants[6].id);
});

test("Persian Swiss controls fit a narrow screen and retain accessible names", async ({
  page,
}, testInfo) => {
  const doc = fixture("swiss");
  doc.participants[0].name = "تیم دانشگاه صنعتی تهران و پژوهشگران مسابقات";
  await open(page, doc);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  for (const selector of [".swiss-pairing-editor", ".swiss-policy-editor"]) {
    const panel = page.locator(selector);
    await panel.locator(":scope > summary").click();
    expect(
      (
        await new AxeBuilder({ page })
          .include(selector)
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await panel.screenshot({
      path: testInfo.outputPath(`${selector.slice(1)}-fa-mobile.png`),
    });
  }
  await expect(
    page
      .locator(".swiss-pairing-editor")
      .getByRole("combobox", { name: "سمت اول 1", exact: true }),
  ).toBeVisible();
});
