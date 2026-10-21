import { expect, test, type Page } from "@playwright/test";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator(".loading-state")).toHaveCount(0);
}

async function measure(page: Page, action: () => Promise<void>) {
  const start = Date.now();
  await action();
  return {
    milliseconds: Date.now() - start,
    elements: await page.evaluate(
      () => document.getElementsByTagName("*").length,
    ),
  };
}

test("512 entrants stay bounded while last-page edits, search, and schedules remain reachable", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const timings: Record<string, { milliseconds: number; elements: number }> =
    {};
  timings.create = await measure(page, async () => {
    await page.goto("/#/create");
    await page
      .getByLabel("Tournament title", { exact: true })
      .fill("512 entrant rendering check");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Participant count", { exact: true }).fill("512");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Create tournament", exact: true })
      .click();
    await expect(page.locator(".workspace-title h1")).toHaveText(
      "512 entrant rendering check",
    );
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
  });
  timings.participants = await measure(page, () =>
    section(page, "Participants"),
  );
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  const participantPages = page.getByRole("navigation", {
    name: "Participant pages",
    exact: true,
  });
  await participantPages
    .getByRole("button", { name: "Last", exact: true })
    .click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(12);
  const lastParticipant = page
    .locator(".data-table tbody tr")
    .filter({ hasText: "Team 512" });
  await lastParticipant
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit participant",
    exact: true,
  });
  await dialog
    .getByLabel("Display name", { exact: true })
    .fill("Tehran finalist 512");
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("searchbox", { name: "Search entrants", exact: true })
    .fill("Tehran finalist");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table tbody")).toContainText(
    "Tehran finalist 512",
  );
  await page
    .getByRole("searchbox", { name: "Search entrants", exact: true })
    .fill("");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);

  timings.matches = await measure(page, () => section(page, "Matches"));
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator("button.match-tile")).toHaveCount(50);
  const matchPages = page.getByRole("navigation", {
    name: "Match pages",
    exact: true,
  });
  await matchPages.getByRole("button", { name: "Last", exact: true }).click();
  await expect(page.locator("button.match-tile")).toHaveCount(11);
  await matchPages
    .getByRole("combobox", { name: "Items per page", exact: true })
    .selectOption("100");
  await expect(page.locator("button.match-tile")).toHaveCount(11);
  await matchPages.getByRole("button", { name: "First", exact: true }).click();
  await expect(page.locator("button.match-tile")).toHaveCount(100);
  await page
    .getByRole("searchbox", { name: "Search matches", exact: true })
    .fill("Tehran finalist 512");
  await expect(page.locator("button.match-tile")).toHaveCount(1);

  timings.schedule = await measure(page, () => section(page, "Schedule"));
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);
  const schedulePages = page.getByRole("navigation", {
    name: "Schedule pages",
    exact: true,
  });
  await schedulePages
    .getByRole("button", { name: "Last", exact: true })
    .click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(11);
  await page
    .getByRole("searchbox", { name: "Search schedule", exact: true })
    .fill("Tehran finalist 512");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search schedule", exact: true })
    .fill("");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(50);

  await page.reload();
  await section(page, "Participants");
  await page
    .getByRole("searchbox", { name: "Search entrants", exact: true })
    .fill("Tehran finalist 512");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  for (const [name, measurement] of Object.entries(timings)) {
    expect(measurement.elements, `${name} DOM size`).toBeLessThan(8000);
    expect(measurement.milliseconds, `${name} display latency`).toBeLessThan(
      name === "create" ? 30000 : 15000,
    );
  }
  await testInfo.attach("512-participant-browser-timings", {
    body: JSON.stringify(
      {
        browser: testInfo.project.name,
        participantCount: 512,
        matchCount: 511,
        timings,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
