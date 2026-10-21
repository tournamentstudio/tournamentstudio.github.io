import { test, expect, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import AxeBuilder from "@axe-core/playwright";

async function document(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<import("../../src/domain/types").Tournament>(
        (resolve) => {
          const request = db
            .transaction("documents")
            .objectStore("documents")
            .get(location.hash.split("/")[2]);
          request.onsuccess = () => resolve(request.result.payload);
        },
      );
    } finally {
      db.close();
    }
  });
}

test("advisor carries uneven groups and playoff settings into the builder", async ({
  page,
}) => {
  await page.goto("/#/advisor");
  await page.getByLabel("Participants", { exact: true }).fill("18");
  await page.getByLabel("Match minutes", { exact: true }).fill("20");
  await page.getByLabel("Playing resources", { exact: true }).fill("3");
  await page.getByLabel("Prefer group play", { exact: true }).check();
  const recommendation = page
    .locator(".advisor-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Groups & pools + playoffs",
        exact: true,
      }),
    });
  await expect(recommendation).toContainText("39 matches");
  await recommendation
    .getByRole("button", { name: "Open builder", exact: true })
    .click();
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Advisor groups cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Participant count", { exact: true }),
  ).toHaveValue("18");
  await expect(
    page.getByLabel("Number of groups", { exact: true }),
  ).toHaveValue("4");
  await expect(
    page.getByLabel("Add a knockout playoff stage", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const saved = await document(page);
  expect(saved.participants).toHaveLength(18);
  expect(saved.stages).toHaveLength(2);
  expect(saved.stages[0].config.groupCount).toBe(4);
  expect(saved.stages[1].sources[0]).toMatchObject({
    count: 2,
    perGroup: true,
  });
  expect(saved.schedule.matchMinutes).toBe(20);
  expect(saved.schedule.resources).toHaveLength(3);
  expect(saved.matches).toHaveLength(32);
});

test("group and knockout ceremonies replay preview order without changing the tournament", async ({
  page,
}, testInfo) => {
  for (const format of ["groups", "single-elimination"] as const) {
    const doc = createTournament(
      "Draw night",
      Array.from({ length: 13 }, (_, index) =>
        createParticipant(`Team ${index + 1}`, index + 1),
      ),
      format,
    );
    doc.stages[0].config.groupCount = 3;
    doc.theme.preset = "minimal-dark";
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
        name: "draw.json",
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
    await page
      .getByRole("navigation", { name: "Tournament sections" })
      .getByRole("button", { name: "Structure", exact: true })
      .click();
    await page
      .getByRole("button", {
        name:
          format === "groups" ? "Preview group draw" : "Preview knockout draw",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Present this draw", exact: true })
      .click();
    const ceremony = page.getByRole("dialog", {
      name: "Draw ceremony",
      exact: true,
    });
    const controls = ceremony.getByRole("region", {
      name: "Draw reveal controls",
      exact: true,
    });
    await controls.focus();
    await controls.press("ArrowRight");
    await expect(ceremony.locator(".draw-reveal-card")).toContainText("Slot 1");
    const first = await ceremony
      .locator(".draw-reveal-card strong")
      .innerText();
    await ceremony
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await ceremony
      .getByRole("button", { name: "Replay draw", exact: true })
      .click();
    await expect(ceremony.locator(".draw-reveal-card")).toContainText(
      "Ready for the reveal",
    );
    await ceremony
      .getByLabel("Seconds per reveal", { exact: true })
      .selectOption("1");
    await ceremony
      .getByRole("button", { name: "Auto reveal", exact: true })
      .click();
    await expect(ceremony.locator(".draw-reveal-card strong")).toHaveText(
      first,
    );
    await ceremony
      .getByRole("button", { name: "Pause reveal", exact: true })
      .click();
    const checks = await new AxeBuilder({ page })
      .include(".draw-ceremony")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(checks.violations).toEqual([]);
    await ceremony
      .getByRole("button", { name: "Reveal all", exact: true })
      .click();
    await ceremony.getByText("Revealed assignments", { exact: true }).click();
    await expect(ceremony.locator("details li")).toHaveCount(
      format === "groups" ? 13 : 16,
    );
    await ceremony.screenshot({
      path: testInfo.outputPath(`${format}-draw-ceremony.png`),
    });
    await ceremony.getByRole("button", { name: "Close dialog", exact: true }).click();
    expect((await document(page)).matches).toHaveLength(0);
  }
});
