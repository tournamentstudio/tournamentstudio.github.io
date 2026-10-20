import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  uid,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, previewAdvancement, simulate } from "../../src/engine";

function fixture(count = 13) {
  return createTournament(
    "Opening round cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${(index % 2) + 1}`,
      organization: `Club ${(index % 3) + 1}`,
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
async function importFixture(page: Page, file: Tournament | string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles(
    typeof file === "string"
      ? file
      : {
          name: "knockout.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(file)),
        },
  );
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await section(page, "Structure");
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
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
}
async function configure(page: Page) {
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
}

test("previews restricted knockout slots, preserves BYEs, and transfers the generated draw", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await configure(page);
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await page
    .getByLabel("Separate the same organization", { exact: true })
    .check();
  await page.getByLabel("Protected seed positions", { exact: true }).fill("2");
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Generate draw", exact: true }),
  ).toBeDisabled();
  await preview(page);
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".draw-preview-pair")).toHaveCount(8);
  await expect(page.locator(".draw-slot-label .badge")).toHaveCount(2);
  const accessibility = await new AxeBuilder({ page })
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator(".knockout-draw-preview").screenshot({
    path: testInfo.outputPath("knockout-draw-desktop.png"),
  });
  const displayedSlots = await page
    .locator(".draw-preview-pair li")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-participant-id") || null),
    );
  const unplayed = await readDocument(page);
  expect(unplayed.matches).toHaveLength(0);
  expect(unplayed.stages[0].config.knockoutDraw).toBeUndefined();
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  expect((await readDocument(page)).matches).toHaveLength(0);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const drawn = await readDocument(page);
  const opening = drawn.matches
    .filter((match) => match.round === 1 && match.bracket === "winners")
    .sort((a, b) => a.index - b.index);
  expect(
    opening.flatMap((match) =>
      match.slots.map((slot) => slot.participantId ?? null),
    ),
  ).toEqual(displayedSlots);
  const byes = opening
    .filter((match) => match.status === "bye")
    .flatMap((match) =>
      match.slots.flatMap((slot) => slot.participantId ?? []),
    );
  expect(new Set(byes)).toEqual(
    new Set(drawn.participants.slice(0, 3).map((entrant) => entrant.id)),
  );
  for (const match of opening) {
    const entrants = match.slots.flatMap((slot) =>
      drawn.participants.filter((entrant) => entrant.id === slot.participantId),
    );
    expect(new Set(entrants.map((entrant) => entrant.region)).size).toBe(
      entrants.length,
    );
    expect(new Set(entrants.map((entrant) => entrant.organization)).size).toBe(
      entrants.length,
    );
    for (const pot of drawn.stages[0].config.knockoutDraw!.pots)
      expect(
        entrants.filter((entrant) => pot.participantIds.includes(entrant.id))
          .length,
      ).toBeLessThanOrEqual(1);
  }
  await expect(
    page.getByLabel("Protected seed positions", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await section(page, "Structure");
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    drawn.stages[0].config.knockoutDraw,
  );
  await section(page, "Share Center");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("knockout.tourney");
  await (await downloadPromise).saveAs(archive);
  const clean = await browser.newContext();
  try {
    const recipient = await clean.newPage();
    await importFixture(recipient, archive);
    const imported = await readDocument(recipient);
    expect(imported.stages[0].config.knockoutDraw).toEqual(
      drawn.stages[0].config.knockoutDraw,
    );
    expect(imported.matches).toEqual(drawn.matches);
  } finally {
    await clean.close();
  }
});

test("blocks incomplete pots and impossible regions without changing the saved draw", async ({
  page,
}) => {
  const tournament = fixture(8);
  tournament.participants.forEach((entrant) => {
    entrant.region = "Same region";
  });
  await importFixture(page, tournament);
  await configure(page);
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await page.getByLabel("Pot for Team 1", { exact: true }).selectOption("");
  await preview(page);
  await expect(page.getByRole("alert")).toContainText(
    "Assign every active stage entrant",
  );
  await page
    .getByLabel("Pot for Team 1", { exact: true })
    .selectOption({ label: "Pot 1" });
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await preview(page);
  await expect(page.getByRole("alert")).toContainText(
    "8 entrants without BYEs",
  );
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).matches).toHaveLength(0);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toBeUndefined();
});

test("invalidates a knockout draft changed in another tab and removes applied rules safely", async ({
  page,
  context,
}) => {
  await importFixture(page, fixture(8));
  await configure(page);
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await preview(page);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeEnabled();
  const operator = await context.newPage();
  await operator.goto(page.url());
  await saved(operator);
  await section(operator, "Structure");
  await operator
    .getByLabel("Draw seed", { exact: true })
    .fill("second-operator");
  await operator.getByLabel("Draw seed", { exact: true }).press("Tab");
  await saved(operator);
  await expect(page.getByRole("alert")).toContainText(
    "changed in another edit",
  );
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await configure(page);
  await preview(page);
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await expect(
    page.locator('.structure-settings option[value="groups"]'),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByRole("button", { name: "Use standard draw", exact: true })
    .click();
  await preview(page);
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await page
    .locator(".structure-settings")
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("groups");
  await saved(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toBeUndefined();
  await expect(page.locator(".knockout-draw-editor")).toHaveCount(0);
});

test("keeps qualification slots fixed and reports conflicts in a double elimination draw", async ({
  page,
}) => {
  let tournament = fixture(8);
  const source = tournament.stages[0];
  source.format = "round-robin";
  tournament = simulate(generateStage(tournament, source.id));
  const targetId = uid();
  tournament.stages.push({
    id: targetId,
    name: "Championship",
    format: "double-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [
      {
        stageId: source.id,
        count: 4,
        perGroup: false,
        bracketSlots: [1, 2, 3, 4],
      },
    ],
    status: "draft",
    metadata: {},
  });
  const qualifyingIds = previewAdvancement(tournament, targetId).participantIds;
  tournament.participants.forEach((entrant) => {
    entrant.region = qualifyingIds.slice(0, 2).includes(entrant.id)
      ? "North"
      : "South";
  });
  tournament.status = "in-progress";
  await importFixture(page, tournament);
  await page
    .getByRole("combobox", { name: /^Selected stage/ })
    .selectOption(targetId);
  await configure(page);
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await preview(page);
  await expect(page.getByRole("alert").first()).toContainText(
    "Fixed first-round positions violate",
  );
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Separate the same region", { exact: true }).uncheck();
  await preview(page);
  await expect(page.locator(".draw-slot-label .badge")).toHaveCount(4);
  expect(
    await page
      .locator(".draw-preview-pair li")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-participant-id")),
      ),
  ).toEqual(qualifyingIds);
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const targetMatches = (await readDocument(page)).matches.filter(
    (match) => match.stageId === targetId,
  );
  expect(targetMatches.some((match) => match.bracket === "losers")).toBe(true);
  expect(targetMatches.some((match) => match.bracket === "reset")).toBe(true);
  expect(
    targetMatches
      .filter((match) => match.bracket === "winners" && match.round === 1)
      .flatMap((match) => match.slots.map((slot) => slot.participantId)),
  ).toEqual(qualifyingIds);
});

test("fits Persian knockout controls and long entrant names at 320 pixels", async ({
  page,
}, testInfo) => {
  const tournament = fixture(13);
  tournament.participants.forEach((entrant, index) => {
    entrant.name = `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان بزرگ ${index + 1}`;
    entrant.region = `منطقه شماره ${(index % 2) + 1}`;
  });
  await importFixture(page, tournament);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .getByRole("button", { name: "تنظیم قرعه حذفی", exact: true })
    .click();
  await page
    .getByRole("button", { name: "پر کردن گلدان‌ها با سید", exact: true })
    .click();
  await page
    .getByLabel("جدا کردن شرکت‌کنندگان هم‌منطقه", { exact: true })
    .check();
  await page.getByLabel("جایگاه‌های سید محافظت‌شده", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "پیش‌نمایش قرعه حذفی", exact: true })
    .click();
  await expect(
    page.getByText("پیش‌نمایش قرعه آماده است", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const clipped = await page
    .locator(
      ".knockout-draw-editor .button, .knockout-draw-editor .field > span, .draw-entrant > div, .draw-preview-pair li",
    )
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.textContent),
    );
  expect(clipped).toEqual([]);
  await page.locator(".knockout-draw-editor").screenshot({
    path: testInfo.outputPath("knockout-draw-persian.png"),
  });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw
          ?.protectedSeeds,
    )
    .toBe(2);
});
