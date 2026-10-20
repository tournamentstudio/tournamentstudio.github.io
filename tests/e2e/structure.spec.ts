import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  uid,
  type Stage,
  type Tournament,
} from "../../src/domain/types";
import {
  generateStage,
  getStandings,
  previewAdvancement,
  recordResult,
  simulate,
} from "../../src/engine";

function draftStage(name: string, order: number): Stage {
  return {
    id: uid(),
    name,
    order,
    format: "single-elimination",
    formatVersion: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [],
    status: "draft",
    metadata: {},
  };
}
function fixture(count = 8, groupCount = 2, tied = false) {
  let tournament = createTournament(
    "Structure test cup",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "groups",
  );
  tournament.stages[0].name = "Pools";
  tournament.stages[0].config.groupCount = groupCount;
  if (tied) {
    tournament.rules.allowDraws = true;
    tournament.rules.tieBreakers = ["points"];
  }
  tournament = generateStage(tournament, tournament.stages[0].id);
  if (tied) {
    for (const match of tournament.matches)
      if (match.status === "ready")
        tournament = recordResult(tournament, match.id, {
          scores: [1, 1],
          winnerIds: [],
          outcome: "draw",
          recordedAt: tournament.updatedAt,
        });
  } else tournament = simulate(tournament);
  tournament.stages.push(draftStage("Finals", 1), draftStage("Placement", 2));
  tournament.status = "in-progress";
  return tournament;
}
async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function openFixture(page: Page, tournament: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "structure.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tournament)),
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
async function readDocument(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
    const id = location.hash.split("/")[2];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const request = db
          .transaction("documents", "readonly")
          .objectStore("documents")
          .get(id);
        request.onsuccess = () => resolve(request.result.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function selectStage(page: Page, id: string) {
  await page
    .getByRole("combobox", { name: /^Selected stage/ })
    .selectOption(id);
}
async function addConnection(page: Page, sourceId: string) {
  await page
    .getByRole("combobox", { name: /^New connection source/ })
    .selectOption(sourceId);
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
}

test("connects graph ports by keyboard, persists node dragging and draws exact physical bracket positions", async ({
  page,
}) => {
  const initial = fixture();
  const [pools, finals] = initial.stages;
  await openFixture(page, initial);
  const handle = page.getByRole("button", {
    name: "Move stage Finals",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const before = await handle.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + 15, before!.y + 15);
  await page.mouse.down();
  await page.mouse.move(before!.x + 100, before!.y + 30, { steps: 6 });
  await page.mouse.up();
  await saved(page);
  const moved = (await readDocument(page)).stages.find(
    (stage) => stage.id === finals.id,
  )!.metadata.canvasPosition;
  expect(moved).toEqual({ x: 175, y: 235 });
  await page
    .getByRole("button", { name: "Connect from Pools", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Connect to Finals", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Unsaved connection draft", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate draw", exact: true }),
  ).toBeDisabled();
  expect(
    (await readDocument(page)).stages.find((stage) => stage.id === finals.id)!
      .sources,
  ).toEqual([]);
  await page
    .getByRole("combobox", { name: /^Qualification rule 1/ })
    .selectOption("positions");
  await page.getByRole("button", { name: "Add position", exact: true }).click();
  await page.getByRole("combobox", { name: /^Group 1\.2/ }).selectOption("B");
  await page.getByLabel("Rank 1.2", { exact: true }).fill("2");
  await page.getByLabel(/^First-round bracket slots 1/).fill("1, 2");
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  await expect(page.getByText("Ready to draw", { exact: true })).toBeVisible();
  const expectedIds = [
    getStandings(initial, pools.id, "A")[0].participantId,
    getStandings(initial, pools.id, "B")[1].participantId,
  ];
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const drawn = await readDocument(page);
  const match = drawn.matches.find(
    (entry) => entry.stageId === finals.id && entry.round === 1,
  )!;
  expect(match.slots.map((slot) => slot.participantId)).toEqual(expectedIds);
  await expect(
    page.getByRole("combobox", { name: /^Qualification rule 1/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reset unplayed draw", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset unplayed draw", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Reset unplayed draw?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).matches.filter(
      (entry) => entry.stageId === finals.id,
    ),
  ).toHaveLength(0);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Structure", exact: true })
    .click();
  await selectStage(page, finals.id);
  expect(
    (await readDocument(page)).stages.find((stage) => stage.id === finals.id)!
      .metadata.canvasPosition,
  ).toEqual(moved);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByLabel("Graph zoom", { exact: true })).toHaveText(
    "115%",
  );
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
});

test("combines group winners with normalized wildcards and prevents cyclic connections", async ({
  page,
}) => {
  const initial = fixture(18, 4);
  const [pools, finals, placement] = initial.stages;
  await openFixture(page, initial);
  await selectStage(page, finals.id);
  await addConnection(page, pools.id);
  await page.getByLabel("From each group", { exact: true }).check();
  await addConnection(page, pools.id);
  await page
    .getByRole("combobox", { name: /^Qualification rule 2/ })
    .selectOption("wildcard");
  await page.getByLabel("Qualifiers to take 2", { exact: true }).fill("2");
  await page
    .getByRole("combobox", { name: /^Compare wildcard candidates 2/ })
    .selectOption("discard-bottom");
  await page
    .getByRole("combobox", { name: /^Add tie-break 2/ })
    .selectOption("seed");
  await expect(
    page.getByRole("columnheader", { name: "Compared scored", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Original seed", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  const configured = await readDocument(page);
  const expected = previewAdvancement(configured, finals.id);
  expect(expected.ready).toBe(true);
  expect(expected.participantIds).toHaveLength(6);
  expect(
    expected.sources[1].candidates.some(
      (candidate) => candidate.comparisonPlayed < candidate.metrics.played,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).stages.find((stage) => stage.id === finals.id)!
      .participantIds,
  ).toEqual(expected.participantIds);
  await selectStage(page, pools.id);
  await expect(
    page.getByText("A later stage already has a draw.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset unplayed draw", exact: true }),
  ).toHaveCount(0);
  await selectStage(page, placement.id);
  await addConnection(page, finals.id);
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "Add stage", exact: true }).click();
  await saved(page);
  const added = (await readDocument(page)).stages.at(-1)!;
  await addConnection(page, placement.id);
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  await selectStage(page, placement.id);
  await addConnection(page, added.id);
  await expect(
    page.getByRole("alert").filter({ hasText: /cycle/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply connections", exact: true }),
  ).toBeDisabled();
  expect(
    (await readDocument(page)).stages.find(
      (stage) => stage.id === placement.id,
    )!.sources,
  ).toHaveLength(1);
});

test("shows unresolved qualification ties without generating matches and supports Persian on mobile", async ({
  page,
}) => {
  const initial = fixture(4, 2, true);
  const [pools, finals] = initial.stages;
  await openFixture(page, initial);
  await selectStage(page, finals.id);
  await addConnection(page, pools.id);
  await page
    .getByRole("combobox", { name: /^Qualification rule 1/ })
    .selectOption("wildcard");
  await page.getByLabel("Candidate rank 1", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Apply connections", exact: true })
    .click();
  await saved(page);
  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/unresolved tie at finishing position/i).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText("unresolved tie");
  expect(
    (await readDocument(page)).matches.filter(
      (match) => match.stageId === finals.id,
    ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "ورودی‌ها و اتصال‌ها", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "اعمال اتصال‌ها", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("rechecks stage removal after another tab records a result", async ({
  page,
  context,
}) => {
  let initial = fixture();
  const [pools, finals] = initial.stages;
  finals.sources = [{ stageId: pools.id, count: 1, perGroup: true }];
  initial = generateStage(initial, finals.id);
  await openFixture(page, initial);
  await selectStage(page, finals.id);
  await page.getByRole("button", { name: "Remove stage", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove this stage?" });
  await expect(confirm).toBeVisible();
  const operator = await context.newPage();
  await operator.goto(page.url());
  await saved(operator);
  await operator
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await operator.locator("button.match-tile.ready").first().click();
  const match = operator.getByRole("dialog", { name: "Match control" });
  await match.locator('.score-entry input[type="number"]').nth(0).fill("3");
  await match.locator('.score-entry input[type="number"]').nth(1).fill("1");
  await match
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(match).not.toBeVisible();
  await saved(operator);
  await expect(page.locator(".structure-lock-note")).toContainText(
    "Play has started",
  );
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("stage changed");
  const retained = await readDocument(page);
  expect(retained.stages.some((stage) => stage.id === finals.id)).toBe(true);
  expect(
    retained.matches.find((entry) => entry.stageId === finals.id)?.result
      ?.scores,
  ).toEqual([3, 1]);
});
