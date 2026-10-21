import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { defaultGolPolicy } from "../../src/domain/gol";
import { applySport } from "../../src/sports";
import { generateStage } from "../../src/engine";
import type { GolRules } from "../../src/engine/gol";

async function openGol(page: Page, target = false) {
  let t = applySport(
    createTournament(
      "Club Gol cup",
      Array.from({ length: 4 }, (_, i) =>
        createParticipant(`Gol team ${i + 1}`, i + 1),
      ),
      "single-elimination",
    ),
    "gol-ya-pooch",
  );
  if (target)
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      ending: "target",
      winBy: 1,
    };
  t = generateStage(t, t.stages[0].id);
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
      name: "gol.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(t)),
    });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function referee(page: Page, live = false) {
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page
    .locator(live ? ".match-tile.live" : ".match-tile.ready")
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Referee mode", exact: true })
    .click();
  return dialog;
}
test("persists running and paused Gol clocks across closing and reloading", async ({
  page,
}) => {
  await openGol(page);
  let dialog = await referee(page);
  await dialog
    .getByRole("button", { name: "Start timer", exact: true })
    .click();
  await expect(dialog.getByRole("timer")).not.toHaveText("00:00");
  await page.keyboard.press("Escape");
  await page.reload();
  dialog = await referee(page, true);
  await expect(
    dialog.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("timer")).not.toHaveText("00:00");
  await dialog
    .getByRole("button", { name: "Pause timer", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Start timer", exact: true }),
  ).toBeVisible();
  const paused = await dialog.getByRole("timer").textContent();
  await page.keyboard.press("Escape");
  await page.reload();
  dialog = await referee(page, true);
  await expect(dialog.getByRole("timer")).toHaveText(paused!);
});
test("automatically confirms the agreed target and advances the winner", async ({
  page,
}) => {
  await openGol(page, true);
  const dialog = await referee(page);
  await dialog
    .getByRole("spinbutton", { name: "Hand points", exact: true })
    .fill("6");
  await dialog
    .getByRole("button", { name: "Record hand", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Record hand", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.keyboard.press("Escape");
  await expect(page.locator(".match-tile.completed")).toHaveCount(1);
  await section(page, "Brackets");
  await expect(
    page
      .getByTestId("bracket-svg")
      .locator(".bracket-team")
      .filter({ hasText: "Gol team 1" }),
  ).toHaveCount(2);
});
test("saves named sport rules for a new tournament without copying participants", async ({
  page,
}) => {
  await openGol(page);
  await section(page, "Rules");
  await page
    .getByRole("combobox", { name: "Match ending policy", exact: true })
    .selectOption("target");
  await page
    .getByRole("spinbutton", { name: "Winning margin", exact: true })
    .fill("2");
  await page
    .getByRole("textbox", { name: "Sport preset name", exact: true })
    .fill("Club double margin");
  await page
    .getByRole("button", { name: "Save sport preset", exact: true })
    .click();
  await expect(
    page.getByText("Club double margin", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New tournament", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Saved sport preset", exact: true })
    .selectOption({ label: "Club double margin" });
  await page
    .getByRole("textbox", { name: "Tournament title", exact: true })
    .fill("New club cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await section(page, "Rules");
  await expect(
    page.getByRole("combobox", { name: "Match ending policy", exact: true }),
  ).toHaveValue("target");
  await expect(
    page.getByRole("spinbutton", { name: "Winning margin", exact: true }),
  ).toHaveValue("2");
});
