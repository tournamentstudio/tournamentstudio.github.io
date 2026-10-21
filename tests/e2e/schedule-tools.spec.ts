import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";
import { autoSchedule } from "../../src/scheduling";
import { newRun } from "../../src/timing/model";
import { generatedMatchLabel } from "../../src/i18n/match-labels";
async function openSchedule(page: Page, withEvidence = false) {
  let t = createTournament(
    "Travel cup",
    Array.from({ length: 4 }, (_, i) => ({
      ...createParticipant(`تیم ${i + 1} Team`, i + 1),
      location: { latitude: 0, longitude: i },
    })),
  );
  t.schedule.startAt = "2027-01-01T10:00:00";
  t.schedule.resources = [
    { id: "west", name: "West", location: { latitude: 0, longitude: 0 } },
    { id: "east", name: "East", location: { latitude: 0, longitude: 3 } },
  ];
  t = autoSchedule(generateStage(t, t.stages[0].id));
  if (withEvidence) {
    t = recordResult(t, t.matches[0].id, {
      scores: [2, 1],
      winnerIds: [t.matches[0].slots[0].participantId!],
      outcome: "played",
      recordedAt: t.updatedAt,
    });
    const match = t.matches[1];
    match.metadata.timing = {
      [match.slots[0].participantId!]: { ...newRun(), elapsedMs: 4000 },
    };
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "schedule.json",
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
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  return t;
}

test("locks saved booking controls and inherited duration after recorded play", async ({
  page,
}) => {
  const doc = await openSchedule(page, true);
  await expect(
    page.getByLabel("Match minutes", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Default match duration is locked after play starts. Review individual unfinished bookings instead.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const match of doc.matches.slice(0, 2)) {
    const label = generatedMatchLabel(match, "en");
    await expect(
      page.getByLabel(`Start ${label}`, { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: `Resource ${label}`, exact: true }),
    ).toBeDisabled();
  }
  const final = generatedMatchLabel(doc.matches[2], "en");
  await expect(
    page.getByLabel(`Start ${final}`, { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Rest minutes", { exact: true }).fill("12");
  await page
    .getByRole("button", { name: "Save schedule settings", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await expect(page.getByLabel("Rest minutes", { exact: true })).toHaveValue(
    "12",
  );
  await expect(page.getByLabel("Match minutes", { exact: true })).toHaveValue(
    String(doc.schedule.matchMinutes),
  );
  await expect(
    page.getByLabel("Match minutes", { exact: true }),
  ).toBeDisabled();
});
test("reviews propagated delays, saves confirmed start times and blocks conflicting moves", async ({
  page,
}) => {
  await openSchedule(page);
  await page.getByText("Timeline and match delays", { exact: true }).click();
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption({ index: 1 });
  const original = await page
    .getByLabel("Proposed start", { exact: true })
    .inputValue();
  await page.getByLabel("Delay minutes", { exact: true }).fill("15");
  await page
    .getByRole("button", { name: "Preview propagated delay", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Review schedule changes" });
  await expect(
    dialog.getByRole("button", { name: "Confirm schedule changes" }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Confirm schedule changes" })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await page.getByText("Timeline and match delays", { exact: true }).click();
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption({ index: 1 });
  const after = await page
    .getByLabel("Proposed start", { exact: true })
    .inputValue();
  expect(Date.parse(after) - Date.parse(original)).toBe(15 * 60000);
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption({ index: 3 });
  await page.getByLabel("Proposed start", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Preview timeline move" }).click();
  dialog = page.getByRole("dialog", { name: "Review schedule changes" });
  await expect(
    dialog.getByRole("button", { name: "Confirm schedule changes" }),
  ).toBeDisabled();
});
test("estimates venue travel and applies a reviewed assignment", async ({
  page,
}) => {
  await openSchedule(page);
  await page.getByText("Venue travel estimates", { exact: true }).click();
  await page
    .getByLabel("Travel planning matches (up to 12)", { exact: true })
    .selectOption([{ index: 0 }, { index: 1 }]);
  await page
    .getByRole("button", { name: "Preview travel assignments", exact: true })
    .click();
  await expect(
    page.getByText(
      "Minimum estimate for these fixed times and available venues",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Apply travel venue assignments",
      exact: true,
    })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
});
test("reviews a proven small schedule before replacing delayed bookings", async ({
  page,
}) => {
  await openSchedule(page);
  await page.getByText("Timeline and match delays", { exact: true }).click();
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption({ index: 3 });
  const original = await page
    .getByLabel("Proposed start", { exact: true })
    .inputValue();
  const delayed = new Date(Date.parse(original) + 3600000);
  const local = new Date(
    delayed.getTime() - delayed.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Proposed start", { exact: true }).fill(local);
  await page
    .getByRole("button", { name: "Preview timeline move", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review schedule changes" })
    .getByRole("button", { name: "Confirm schedule changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("button", { name: "Optimize small schedule", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Review schedule changes" });
  await expect(dialog).toContainText(
    "Minimum schedule proven for these constraints",
  );
  await dialog
    .getByRole("button", { name: "Confirm schedule changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
});
test("timeline supports Persian at320px with keyboard access", async ({
  page,
}) => {
  await openSchedule(page);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByText("خط زمان و تأخیر دیدارها", { exact: true }).click();
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [
      ...document.querySelectorAll(
        "main, .panel-content, .schedule-timeline, .timeline-scroll, .schedule-layout, .timeline-grid, .field, .panel",
      ),
    ].map((e) => ({
      cls: e.className,
      width: e.getBoundingClientRect().width,
      left: e.getBoundingClientRect().left,
    })),
  }));
  expect(bounds.scroll, JSON.stringify(bounds)).toBeLessThanOrEqual(
    bounds.width + 1,
  );
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("persian-timeline.png"),
    fullPage: true,
  });
});
