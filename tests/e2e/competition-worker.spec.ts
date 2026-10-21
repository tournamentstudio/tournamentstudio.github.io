import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { encodeCode, encodeRecipe } from "../../src/sharing";

function fixture(count = 512) {
  const doc = createTournament(
    "Background Swiss",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`Player ${i + 1}`, i + 1, "individual"),
    ),
    "swiss",
    "chess",
  );
  doc.rules.pointsWin = 1;
  doc.rules.pointsDraw = 0.5;
  doc.rules.pointsLoss = 0;
  doc.rules.allowDraws = true;
  doc.stages[0].config.rounds = Math.min(9, count - 1);
  doc.stages[0].config.swiss = {
    version: 1,
    colorPolicy: "balanced",
    allowLateEntrants: false,
    preferences: {},
    lateEntries: [],
    federation: {
      system: "fide-dutch-2026",
      engine: "bbp-6.0.0-ts1",
      initialColor: "white",
    },
  };
  return doc;
}
async function open(page: Page, count = 512) {
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeCode(fixture(count)))}`,
  );
  await page
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await section(page, "Structure");
}
async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("512-player simulation keeps cancellation and section navigation responsive without saving results", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const cancel = page.getByRole("button", {
    name: "Cancel computation",
    exact: true,
  });
  await expect(cancel).toBeVisible();
  await expect(page.locator(".competition-fieldset")).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(
    page.getByRole("button", { name: "Run simulation", exact: true }),
  ).toBeDisabled();
  const start = Date.now();
  await cancel.click();
  expect(Date.now() - start).toBeLessThan(2000);
  await expect(cancel).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Simulation preview", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(cancel).toBeVisible();
  await section(page, "Matches");
  await expect(cancel).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator("button.match-tile")).toHaveCount(0);
});

test("named draw refuses unavailable workers and leaves existing data unchanged", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: undefined,
    }),
  );
  await open(page, 8);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Background computation is unavailable",
  );
  await expect(page.getByRole("alert")).toContainText(
    "No results were changed",
  );
  await expect(page.getByRole("button", { name: /run.*locally/i })).toHaveCount(
    0,
  );
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator("button.match-tile")).toHaveCount(0);
});

test("a single-stage named recipe computes its draw in a worker before import preview", async ({
  page,
}) => {
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeRecipe(fixture(8)))}`,
  );
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await expect(dialog).toContainText("4 matches");
  expect(workers.some((url) => url.includes("competition.worker"))).toBe(true);
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await section(page, "Matches");
  await expect(page.locator("button.match-tile.ready")).toHaveCount(4);
});

test("closing import while recipe validation is pending cannot launch a detached worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (
      ...args: Parameters<SubtleCrypto["digest"]>
    ) => {
      const value = await original(...args);
      await new Promise((resolve) => setTimeout(resolve, 700));
      document.documentElement.dataset.validationFinished = "true";
      return value;
    };
  });
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeRecipe(fixture(8)))}`,
  );
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-validation-finished",
    "true",
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  expect(workers.filter((url) => url.includes("competition.worker"))).toEqual(
    [],
  );
  await expect(page.locator(".workspace-title")).toHaveCount(0);
});
