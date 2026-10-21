import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";

function fixture(
  format: "groups" | "swiss" | "round-robin" = "groups",
  count = 8,
) {
  const doc = createTournament(
    "Manual stage choices",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    format,
  );
  doc.stages[0].config.groupCount = 2;
  return doc;
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
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
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

test("manual groups persist uneven composition and lock after generation", async ({
  page,
}) => {
  await open(page, fixture());
  const panel = page.locator(".manual-group-editor");
  await panel.locator(":scope > summary").click();
  const assignment = panel.getByRole("combobox", {
    name: "Team 1",
    exact: true,
  });
  const initial = await assignment.inputValue();
  await assignment.selectOption(initial === "0" ? "1" : "0");
  await panel
    .getByRole("button", { name: "Apply manual groups", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const doc = await stored(page);
  expect(
    (doc.stages[0].config.groups as string[][])
      .map((group) => group.length)
      .sort(),
  ).toEqual([3, 5]);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(assignment).toBeDisabled();
  expect((await stored(page)).matches).toHaveLength(13);
});

test("Swiss forbidden pairs are validated and retained in generated matches", async ({
  page,
}) => {
  await open(page, fixture("swiss"));
  const panel = page.locator(".swiss-restrictions-editor");
  await panel.locator(":scope > summary").click();
  await panel
    .getByRole("combobox", { name: "First entrant", exact: true })
    .selectOption("p1");
  await panel
    .getByRole("combobox", { name: "Second entrant", exact: true })
    .selectOption("p1");
  await expect(
    panel.getByRole("button", { name: "Add forbidden pairing", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("combobox", { name: "Second entrant", exact: true })
    .selectOption("p2");
  await panel
    .getByRole("button", { name: "Add forbidden pairing", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Apply Swiss restrictions", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const doc = await stored(page);
  expect(doc.stages[0].config.forbiddenPairs).toEqual([["p1", "p2"]]);
  expect(
    doc.matches.some(
      (match) =>
        match.slots.some((slot) => slot.participantId === "p1") &&
        match.slots.some((slot) => slot.participantId === "p2"),
    ),
  ).toBe(false);
});

test("manual qualification previews and confirms tied cutoff choices", async ({
  page,
}) => {
  let doc = fixture("round-robin", 3);
  doc.rules.allowDraws = true;
  doc.rules.tieBreakers = ["points"];
  doc = generateStage(doc, doc.stages[0].id);
  for (const match of doc.matches.filter((match) => match.status === "ready"))
    doc = recordResult(doc, match.id, {
      scores: [0, 0],
      winnerIds: [],
      outcome: "draw",
      recordedAt: new Date().toISOString(),
    });
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources: [{ stageId: doc.stages[0].id, count: 2, perGroup: false }],
    status: "draft",
    metadata: {},
  });
  await open(page, doc);
  await page
    .getByRole("combobox", { name: "Selected stage", exact: true })
    .selectOption("finals");
  const panel = page.locator(".manual-qualifier-editor");
  await panel.locator(":scope > summary").click();
  await panel.getByRole("checkbox", { name: "Team 1", exact: true }).check();
  await panel
    .getByRole("button", { name: "Review manual qualifiers", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Qualification is tied at the cutoff",
  );
  await panel.getByRole("checkbox", { name: "Team 2", exact: true }).check();
  await panel
    .getByRole("button", { name: "Review manual qualifiers", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirm qualification decision?",
  });
  await expect(confirmation).toContainText("Team 1, Team 2");
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  expect(
    (await stored(page)).stages.find((stage) => stage.id === "finals")?.config
      .manualQualifiers,
  ).toEqual(["p1", "p2"]);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  expect(
    (await stored(page)).matches.filter((match) => match.stageId === "finals"),
  ).toHaveLength(1);
});

test("Persian manual group controls wrap at320 pixels and pass automated checks", async ({
  page,
}, testInfo) => {
  const doc = fixture();
  doc.participants[0].name = "تیم دانشگاه صنعتی تهران و پژوهشگران مسابقات";
  await open(page, doc);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  const panel = page.locator(".manual-group-editor");
  await panel.locator(":scope > summary").click();
  await expect(
    panel.getByRole("combobox", {
      name: doc.participants[0].name,
      exact: true,
    }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include(".manual-group-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await panel.screenshot({
    path: testInfo.outputPath("manual-groups-fa-mobile.png"),
  });
});
