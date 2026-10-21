import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { autoSchedule } from "../../src/scheduling";
test("reviews each leg booking, persists changes and fits Persian mobile", async ({
  page,
}, info) => {
  let t = createTournament("Return leg cup", [
    createParticipant("آفتاب A", 1),
    createParticipant("آسمان B", 2),
  ]);
  t.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  t.schedule.startAt = "2027-01-01T10:00:00";
  t = autoSchedule(generateStage(t, t.stages[0].id));
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
      name: "legs.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(t)),
    });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const schedule = async () =>
    page
      .getByRole("navigation", { name: "Tournament sections" })
      .getByRole("button", { name: "Schedule", exact: true })
      .click();
  await schedule();
  await page.getByText("Aggregate leg bookings", { exact: true }).click();
  await page
    .getByLabel("Aggregate tie", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Leg start 2", { exact: true })
    .fill("2027-01-01T11:30");
  await page
    .getByRole("button", { name: "Review leg bookings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save leg bookings", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.reload();
  await schedule();
  await page.getByText("Aggregate leg bookings", { exact: true }).click();
  await page
    .getByLabel("Aggregate tie", { exact: true })
    .selectOption({ index: 1 });
  await expect(page.getByLabel("Leg start 2", { exact: true })).toHaveValue(
    "2027-01-01T11:30",
  );
  await page.getByText("Timeline and match delays", { exact: true }).click();
  await expect(
    page.getByLabel("Timeline match", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption({ index: 2 });
  await page.getByLabel("Delay minutes", { exact: true }).fill("15");
  await page
    .getByRole("button", { name: "Preview propagated delay", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review schedule changes" });
  await expect(review).toContainText("Leg 2");
  await review
    .getByRole("button", { name: "Confirm schedule changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 900 });
  await page
    .getByLabel("دیدار رفت‌وبرگشت", { exact: true })
    .selectOption({ index: 1 });
  await expect(page.getByLabel("شروع بازی ۲", { exact: true })).toHaveValue(
    "2027-01-01T11:45",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("aggregate-rtl.png"),
    fullPage: true,
  });
});
