import { test, expect, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
async function openRuns(page: Page) {
  let doc = createTournament(
    "Time trial",
    [createParticipant("Runner A", 1), createParticipant("Runner B", 2)],
    "time-trial",
  );
  doc.rules.scoring = "time";
  doc.stages[0].config.rounds = 2;
  doc.stages[0].config.timeRanking = "cumulative";
  doc = generateStage(doc, doc.stages[0].id);
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
      name: "runs.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(doc)),
    });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
}
async function control(page: Page) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator(".match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog
    .getByText("Run timer, splits and evidence", { exact: true })
    .click();
  return dialog;
}
test("retains run clocks across reload and records reviewed numeric times", async ({
  page,
}) => {
  await openRuns(page);
  let dialog = await control(page);
  await dialog.getByRole("button", { name: "Start run", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect
    .poll(async () =>
      Number(
        (
          await dialog
            .getByLabel("Elapsed run seconds", { exact: true })
            .textContent()
        )?.replaceAll(",", ""),
      ),
    )
    .toBeGreaterThan(0.1);
  await dialog
    .getByLabel("Split label", { exact: true })
    .fill("First checkpoint");
  await dialog
    .getByRole("button", { name: "Record split", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.keyboard.press("Escape");
  await page.reload();
  dialog = await control(page);
  await expect(dialog).toContainText("First checkpoint");
  await expect(
    dialog.getByRole("button", { name: "Pause run", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Pause run", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await dialog
    .getByLabel("Correct elapsed seconds", { exact: true })
    .fill("20");
  await dialog.getByLabel("Split label", { exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await dialog
    .getByLabel("Organizer evidence ruling", { exact: true })
    .selectOption("accepted");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await dialog
    .getByLabel("Timed entrant", { exact: true })
    .selectOption({ index: 1 });
  await dialog
    .getByLabel("Correct elapsed seconds", { exact: true })
    .fill("18");
  await dialog.getByLabel("Split label", { exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await dialog
    .getByLabel("Organizer evidence ruling", { exact: true })
    .selectOption("accepted");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await dialog
    .getByRole("button", {
      name: "Copy accepted times to score form",
      exact: true,
    })
    .click();
  await expect(dialog.locator(".score-side input").nth(0)).toHaveValue("20");
  await expect(dialog.locator(".score-side input").nth(1)).toHaveValue("18");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".match-tile.completed")).toHaveCount(1);
});
