import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";

async function openDraw(page: Page, count = 8) {
  const tournament = createTournament(
    "Background draw check",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${index % 2}`,
    })),
    "single-elimination",
  );
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
      buffer: Buffer.from(JSON.stringify(tournament)),
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
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  return page.locator(".knockout-draw-editor");
}

async function delayWorkers(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      timer?: ReturnType<typeof setTimeout>;
      override postMessage(value: unknown) {
        this.timer = setTimeout(() => super.postMessage(value), 1200);
      }
      override terminate() {
        clearTimeout(this.timer);
        super.terminate();
      }
    };
  });
}

test("draw cancellation and changed inputs cannot display stale success", async ({
  page,
}) => {
  await delayWorkers(page);
  const editor = await openDraw(page);
  const preview = editor.getByRole("button", {
    name: "Preview knockout draw",
    exact: true,
  });
  const ready = editor.getByText("Draw preview is ready", { exact: true });
  const apply = editor.getByRole("button", {
    name: "Apply draw rules",
    exact: true,
  });
  await preview.click();
  await expect(
    editor.getByText("Calculating draw preview", { exact: true }),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  await editor
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await expect(preview).toBeEnabled();
  await expect(ready).toHaveCount(0);
  await preview.click();
  await editor
    .getByLabel("Protected seed positions", { exact: true })
    .fill("2");
  await expect(preview).toBeEnabled();
  await expect(apply).toBeDisabled();
  await expect(ready).toHaveCount(0);
  await preview.click();
  await expect(ready).toBeVisible();
  await expect(editor.locator(".draw-slot-label .badge")).toHaveCount(2);
  await expect(apply).toBeEnabled();
});

test("unavailable workers require an explicit local preview", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", { value: undefined });
  });
  const editor = await openDraw(page);
  await editor
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "Background computation is unavailable",
  );
  await expect(
    editor.getByText("Draw preview is ready", { exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "Run bounded preview locally", exact: true })
    .click();
  await expect(
    editor.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
});

test("512 entrant worker preview keeps the interface responsive", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const editor = await openDraw(page, 512);
  await editor.getByLabel("Separate the same region", { exact: true }).check();
  await page.evaluate(() => {
    const state = {
      count: 0,
      started: performance.now(),
      longestGap: 0,
      previous: performance.now(),
    };
    (window as unknown as { previewFrames: typeof state }).previewFrames =
      state;
    const tick = () => {
      const now = performance.now();
      state.longestGap = Math.max(state.longestGap, now - state.previous);
      state.previous = now;
      state.count++;
      if (now - state.started < 15000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const started = Date.now();
  await editor
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(
    editor.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const measurement = await page.evaluate(
    () =>
      (
        window as unknown as {
          previewFrames: { count: number; longestGap: number };
        }
      ).previewFrames,
  );
  expect(measurement.count).toBeGreaterThan(0);
  expect(measurement.longestGap).toBeLessThan(5000);
  await expect(editor.locator(".draw-preview-pair")).toHaveCount(256);
  await testInfo.attach("512-entrant-background-preview", {
    body: JSON.stringify({
      browser: testInfo.project.name,
      milliseconds: Date.now() - started,
      ...measurement,
    }),
    contentType: "application/json",
  });
});
