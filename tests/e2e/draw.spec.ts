import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";

function fixture(count = 18, groupCount = 4) {
  const tournament = createTournament(
    "Restricted draw cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${(index % 3) + 1}`,
      organization: `Club ${(index % 9) + 1}`,
    })),
    "groups",
  );
  tournament.stages[0].config.groupCount = groupCount;
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
    name: "draw.json",
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
  await structure(page);
}
async function structure(page: Page) {
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

test("previews seed pots with region and organization limits before drawing uneven groups", async ({
  page,
  browser,
}) => {
  await openFixture(page, fixture());
  await page
    .getByRole("button", { name: "Configure pot draw", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate draw", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  const firstAssignment = page.getByRole("combobox", {
    name: "Pot for Team 1",
    exact: true,
  });
  await firstAssignment.selectOption("");
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Assign every active");
  await firstAssignment.selectOption({ label: "Pot 1" });
  await page
    .getByLabel("Limit entrants from the same region", { exact: true })
    .check();
  await page
    .getByLabel("Maximum from one region per group", { exact: true })
    .fill("2");
  await page
    .getByLabel("Limit entrants from the same organization", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".draw-preview-group")).toHaveCount(4);
  const beforeApply = await readDocument(page);
  expect(beforeApply.matches).toHaveLength(0);
  expect(beforeApply.stages[0].config.draw).toBeUndefined();
  const displayedGroups = await page
    .locator(".draw-preview-group")
    .evaluateAll((groups) =>
      groups.map((group) =>
        [...group.querySelectorAll("li > bdi")].map((name) => name.textContent),
      ),
    );
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  const configured = await readDocument(page);
  expect(configured.stages[0].config.draw?.pots).toHaveLength(5);
  expect(configured.stages[0].config.draw?.restrictions).toHaveLength(2);
  expect(configured.matches).toHaveLength(0);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const drawn = await readDocument(page);
  const groups = drawn.stages[0].metadata.groups as string[][];
  expect(groups.map((group) => group.length)).toEqual([5, 5, 4, 4]);
  expect(
    groups.map((group) =>
      group.map(
        (id) => drawn.participants.find((entrant) => entrant.id === id)!.name,
      ),
    ),
  ).toEqual(displayedGroups);
  for (const group of groups) {
    const entrants = group.map((id) =>
      drawn.participants.find((entrant) => entrant.id === id)!,
    );
    expect(new Set(entrants.map((entrant) => entrant.organization)).size).toBe(
      group.length,
    );
    for (const region of new Set(entrants.map((entrant) => entrant.region)))
      expect(
        entrants.filter((entrant) => entrant.region === region).length,
      ).toBeLessThanOrEqual(2);
    for (const pot of drawn.stages[0].config.draw!.pots)
      expect(
        pot.participantIds.filter((id) => group.includes(id)).length,
      ).toBeLessThanOrEqual(1);
  }
  await expect(
    page.getByRole("button", { name: "Fill pots by seed", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await structure(page);
  expect((await readDocument(page)).stages[0].metadata.groups).toEqual(groups);
  const cleanContext = await browser.newContext();
  try {
    const cleanPage = await cleanContext.newPage();
    await openFixture(cleanPage, drawn);
    const imported = await readDocument(cleanPage);
    expect(imported.stages[0].config.draw).toEqual(drawn.stages[0].config.draw);
    expect(imported.stages[0].metadata.groups).toEqual(groups);
    expect(imported.matches).toEqual(drawn.matches);
  } finally {
    await cleanContext.close();
  }
});

test("rejects impossible regional limits, edits missing region, and renders long Persian draw labels", async ({
  page,
}) => {
  const tournament = fixture(8, 2);
  tournament.participants = tournament.participants.map((entrant, index) => ({
    ...entrant,
    name: `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان ${index + 1}`,
    region: index ? "منطقه شمال" : "",
  }));
  await openFixture(page, tournament);
  await page
    .getByRole("button", { name: "Configure pot draw", exact: true })
    .click();
  await page
    .getByLabel("Limit entrants from the same region", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText("Enter a region");
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Participants", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: tournament.participants[0].name })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Edit participant",
    exact: true,
  });
  await editor.getByLabel(/^Region/).fill("منطقه شمال");
  await editor
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  await saved(page);
  expect((await readDocument(page)).participants[0].region).toBe("منطقه شمال");
  await structure(page);
  await page
    .getByRole("button", { name: "Configure pot draw", exact: true })
    .click();
  await page
    .getByLabel("Limit entrants from the same region", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("has 8 entrants");
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).matches).toHaveLength(0);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("alert")).toContainText("دارای ۸ شرکت‌کننده");
  await page
    .getByLabel("حداکثر از یک منطقه در هر گروه", { exact: true })
    .fill("4");
  await page
    .getByRole("button", { name: "پر کردن گلدان‌ها با سید", exact: true })
    .click();
  await page
    .getByRole("button", { name: "پیش‌نمایش قرعه گروهی", exact: true })
    .click();
  await expect(
    page.getByText("پیش‌نمایش قرعه آماده است", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await expect
    .poll(
      async () => (await readDocument(page)).stages[0].config.draw?.pots.length,
    )
    .toBe(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const clipped = await page
    .locator(
      ".group-draw-editor .button, .group-draw-editor .field > span, .draw-entrant > div, .draw-preview-group li",
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
});

test("discards a stale draw draft after another tab changes stage settings", async ({
  page,
  context,
}) => {
  await openFixture(page, fixture(8, 2));
  await page
    .getByRole("button", { name: "Configure pot draw", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeEnabled();
  const operator = await context.newPage();
  await operator.goto(page.url());
  await saved(operator);
  await structure(operator);
  const seed = operator.getByLabel("Draw seed", { exact: true });
  await seed.fill("changed-in-another-tab");
  await seed.press("Tab");
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
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate draw", exact: true }),
  ).toBeEnabled();
  expect((await readDocument(page)).stages[0].config.draw).toBeUndefined();
});

test("manages manual pots in GSL and removes rules before changing the stage format", async ({
  page,
}) => {
  const tournament = fixture(8, 9);
  tournament.stages[0].format = "gsl";
  await openFixture(page, tournament);
  await page
    .getByRole("button", { name: "Configure pot draw", exact: true })
    .click();
  await page.getByRole("button", { name: "Add pot", exact: true }).click();
  await page.getByLabel("Pot name 1", { exact: true }).fill("Protected seeds");
  const assignment = page.getByRole("combobox", {
    name: "Pot for Team 1",
    exact: true,
  });
  await assignment.selectOption({ label: "Protected seeds" });
  await expect(assignment).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Remove pot 1", exact: true }).click();
  await expect(page.locator(".draw-pot")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await expect(page.locator(".draw-pot")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await expect(page.locator(".draw-preview-group")).toHaveCount(2);
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await expect(
    page.locator('.structure-settings option[value="single-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await expect(
    page.getByText("To change to a non-group format", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  expect((await readDocument(page)).matches).toHaveLength(10);
  await page
    .getByRole("button", { name: "Reset unplayed draw", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Reset unplayed draw?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Use standard draw", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview group draw", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  expect((await readDocument(page)).stages[0].config.draw).toBeUndefined();
  await page
    .locator(".structure-settings")
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("single-elimination");
  await saved(page);
  expect((await readDocument(page)).stages[0].format).toBe(
    "single-elimination",
  );
  await expect(page.locator(".group-draw-editor")).toHaveCount(0);
});
