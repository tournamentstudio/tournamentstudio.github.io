import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { sports } from "../../src/sports";

test("shows a distinct activity icon for every creation preset", async ({
  page,
  browserName,
}) => {
  await page.goto("/#/create");
  const icons: { name: string; svg: string }[] = [];
  for (const sport of sports) {
    await page
      .getByLabel("Sport or activity", { exact: true })
      .selectOption(sport.id);
    const icon = page.locator(".creation-note .game-icon");
    await expect(icon).toHaveAttribute("data-game-icon", sport.id);
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    icons.push({
      name: sport.name,
      svg: await icon.evaluate((element) => element.outerHTML),
    });
  }
  expect(icons).toHaveLength(14);
  expect(
    new Set(icons.map((icon) => icon.svg.replace(/data-game-icon="[^"]*"/, "")))
      .size,
  ).toBe(14);
  if (browserName === "chromium") {
    const gallery = await page.context().newPage();
    try {
      await gallery.setViewportSize({ width: 1120, height: 440 });
      await gallery.setContent(
        `<html><head><style>body{margin:0;padding:32px;background:#f6f4ee;color:#173f33;font:16px system-ui}h1{font-size:24px;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:16px}.card{display:grid;justify-items:center;gap:16px;padding:24px 8px;border:1px solid #c8d1c5;border-radius:16px;background:#fff}.card svg{width:72px;height:72px}.card span{font-size:13px}</style></head><body><h1>TournaStudio activity icons</h1><div class="grid">${icons.map((icon) => `<div class="card">${icon.svg}<span>${icon.name}</span></div>`).join("")}</div></body></html>`,
      );
      await mkdir(".local", { recursive: true });
      await gallery.screenshot({
        path: ".local/activity-icon-gallery.png",
        fullPage: true,
      });
    } finally {
      await gallery.close();
    }
  }
});

test("keeps Gol identity with a neutral theme and private state out of public icons", async ({
  page,
  browserName,
}) => {
  let doc = createTournament(
    "جام دست‌ها Hands cup",
    [
      createParticipant("شاهین Tehran", 1),
      createParticipant("آفتاب Shiraz", 2),
    ],
    "single-elimination",
    "gol-ya-pooch",
  );
  doc = generateStage(doc, doc.stages[0].id);
  doc.theme.preset = "minimal-light";
  doc.matches[0].private = { concealedPosition: "PRIVATE-ICON-SENTINEL" };
  doc.presentation.autoRotate = false;
  doc.presentation.scenes = [
    { id: "current", type: "current", title: "", text: "", duration: 15 },
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const importer = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await importer
    .getByLabel("Import code", { exact: true })
    .fill(JSON.stringify(doc));
  await importer
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await importer
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const workspaceURL = page.url();
  await expect(page.locator(".workspace-heading .game-icon")).toHaveAttribute(
    "data-game-icon",
    "gol-ya-pooch",
  );
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const match = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  const emblems = match.locator(".score-side .game-icon");
  await expect(emblems).toHaveCount(2);
  expect(await emblems.nth(0).innerHTML()).toBe(
    await emblems.nth(1).innerHTML(),
  );
  await expect(emblems.first()).toHaveAttribute(
    "data-game-icon",
    "gol-ya-pooch",
  );
  const publicGlyph = await emblems.first().innerHTML();
  await match
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("button.match-tile.ready").first().click();
  await expect(
    page.getByRole("dialog", { name: "کنترل دیدار", exact: true }),
  ).toBeVisible();
  const progressLabel = page.locator(".gol-target-track > span").first();
  await expect(progressLabel).toHaveText("۰ / ۶");
  await expect(progressLabel).toHaveCSS("direction", "ltr");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  if (browserName === "chromium")
    await page.screenshot({
      path: ".local/gol-game-icons-mobile.png",
      fullPage: true,
    });
  const spectator = await page.context().newPage();
  try {
    await spectator.goto(workspaceURL.replace("#/t/", "#/present/"));
    const board = spectator.getByTestId("presentation-scoreboard");
    await expect(board.locator(".game-icon")).toHaveCount(2);
    expect(await board.locator(".game-icon").first().innerHTML()).toBe(
      publicGlyph,
    );
    expect(await spectator.content()).not.toContain("PRIVATE-ICON-SENTINEL");
    if (browserName === "chromium")
      await spectator.screenshot({
        path: ".local/gol-game-presentation.png",
        animations: "disabled",
      });
  } finally {
    await spectator.close();
  }
  await page.goto("/#/");
  await expect(page.locator(".cover-sport")).toHaveText("گل یا پوچ");
  await expect(page.locator(".cover-sport")).toHaveCSS(
    "letter-spacing",
    "normal",
  );
  await expect(page.locator(".tournament-cover .game-icon")).toHaveAttribute(
    "data-game-icon",
    "gol-ya-pooch",
  );
});
