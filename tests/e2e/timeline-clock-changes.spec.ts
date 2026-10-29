import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";

test.use({ timezoneId: "America/Los_Angeles" });

async function openTimeline(page: Page, times: string[]) {
  let document = createTournament(
    "Clock change cup",
    [
      createParticipant("آفتاب A", 1),
      createParticipant("سپهر B", 2),
      createParticipant("Team C", 3),
    ],
    "round-robin",
  );
  document.schedule.startAt = times[0];
  document.schedule.resources = [
    { id: "west", name: "West" },
    { id: "east", name: "East" },
  ];
  document = generateStage(document, document.stages[0].id);
  document.matches.forEach((match, index) => {
    match.scheduledAt = times[index];
    match.resourceId = "west";
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "clock-change.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
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
  await page.getByText("Timeline and match delays", { exact: true }).click();
  return document;
}

async function storedBooking(page: Page, id: string, matchId: string) {
  return page.evaluate(
    ({ id, matchId }) =>
      new Promise<{ scheduledAt: string; resourceId: string }>(
        (resolve, reject) => {
          const opening = indexedDB.open("TournaStudio");
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const database = opening.result;
            const reading = database
              .transaction("documents")
              .objectStore("documents")
              .get(id);
            reading.onsuccess = () => {
              const match = reading.result.payload.matches.find(
                (item: { id: string }) => item.id === matchId,
              );
              database.close();
              resolve({
                scheduledAt: match.scheduledAt,
                resourceId: match.resourceId,
              });
            };
            reading.onerror = () => {
              database.close();
              reject(reading.error);
            };
          };
        },
      ),
    { id, matchId },
  );
}

async function confirmMove(page: Page) {
  const review = page.getByRole("dialog", { name: "Review schedule changes" });
  await review
    .getByRole("button", { name: "Confirm schedule changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}

test("spring timeline excludes the next day and moves to the displayed local clock", async ({
  page,
}) => {
  const document = await openTimeline(page, [
    "2026-03-08T10:30:00.000Z",
    "2026-03-09T07:15:00.000Z",
    "2026-03-09T09:00:00.000Z",
  ]);
  await expect(page.locator(".timeline-slot")).toHaveCount(92);
  await expect(page.locator(".timeline-match")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "West 02:00", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption(document.matches[0].id);
  await page
    .getByLabel("Proposed start", { exact: true })
    .fill("2026-03-08T02:30");
  await page
    .getByRole("button", { name: "Preview timeline move", exact: true })
    .click();
  await expect(
    page.getByText(
      "This clock time does not exist in the device timezone. Choose a valid time on the timeline.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Review schedule changes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "West 03:00", exact: true }).click();
  await confirmMove(page);
  expect(
    await storedBooking(page, document.id, document.matches[0].id),
  ).toEqual({ scheduledAt: "2026-03-08T10:00:00.000Z", resourceId: "west" });
  await page
    .getByLabel("Timeline day (device timezone)", { exact: true })
    .fill("");
  await expect(page.locator(".timeline-slot")).toHaveCount(0);
  await expect(page.locator(".timeline-match")).toHaveCount(0);
});

test("autumn timeline includes the last hour and preserves the chosen repeated-clock instant", async ({
  page,
}) => {
  const document = await openTimeline(page, [
    "2026-11-01T08:00:00.000Z",
    "2026-11-02T07:30:00.000Z",
    "2026-11-02T08:15:00.000Z",
  ]);
  await expect(page.locator(".timeline-slot")).toHaveCount(100);
  await expect(page.locator(".timeline-match")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "West 01:30 UTC-7", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "West 01:30 UTC-8", exact: true }),
  ).toHaveCount(1);
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption(document.matches[0].id);
  await page
    .getByRole("button", { name: "West 01:30 UTC-8", exact: true })
    .click();
  await confirmMove(page);
  await page.getByLabel("Timeline match", { exact: true }).selectOption("");
  await page
    .getByLabel("Timeline match", { exact: true })
    .selectOption(document.matches[0].id);
  await expect(page.getByLabel("Proposed start", { exact: true })).toHaveValue(
    "2026-11-01T01:30",
  );
  await page.getByLabel("Proposed venue", { exact: true }).selectOption("east");
  await page
    .getByRole("button", { name: "Preview timeline move", exact: true })
    .click();
  await confirmMove(page);
  expect(
    await storedBooking(page, document.id, document.matches[0].id),
  ).toEqual({ scheduledAt: "2026-11-01T09:30:00.000Z", resourceId: "east" });
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(
    page.getByRole("button", { name: "West ۰۱:۳۰ UTC-8", exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
