import { test, expect } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { simulate } from "../../src/engine";
import { createCollection, linkCompetition } from "../../src/collections/model";
import { exportCollection } from "../../src/collections/transport";
test("reviews promotions into a separate league season and retains the original", async ({
  page,
}) => {
  const documents = ["Premier", "Second"].map((title) =>
    simulate(
      createTournament(
        title,
        Array.from({ length: 4 }, (_, i) =>
          createParticipant(`${title} ${i + 1}`, i + 1),
        ),
        "round-robin",
      ),
    ),
  );
  let event = createCollection("Season movement", "2026");
  event.divisions = [
    { id: "a", name: "Premier", promote: 0, relegate: 1 },
    { id: "b", name: "Second", promote: 1, relegate: 0 },
  ];
  documents.forEach((d, i) => {
    event = linkCompetition(event, d, d.stages[0].id, i === 0 ? "a" : "b");
  });
  event.adjustments = event.directory.map((p, i) => ({
    id: `adj-${i}`,
    directoryId: p.id,
    points: 1000 * (8 - i),
    reason: "Season carry-over",
  }));
  const packet = await exportCollection(event, documents, { private: false });
  await page.goto("/#/events");
  await page.getByRole("button", { name: "Import event", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import event package" });
  await dialog
    .getByLabel("Event package file", { exact: true })
    .setInputFiles({
      name: "season.tsevent",
      mimeType: "text/plain",
      buffer: Buffer.from(packet),
    });
  await dialog
    .getByRole("button", { name: "Preview event import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Import independent event copy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Season movement", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Apply promotion and relegation",
      exact: true,
    })
    .click();
  const review = page.getByRole("dialog", {
    name: "Move divisions into next season",
  });
  await review
    .getByLabel("New league title", { exact: true })
    .fill("Next league");
  await review.getByLabel("New league season", { exact: true }).fill("2027");
  await review
    .getByRole("button", { name: "Review division movements", exact: true })
    .click();
  await expect(review).toContainText("Premier 4");
  await expect(review).toContainText("Second 1");
  await review
    .getByRole("button", {
      name: "Confirm and create league season",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Next league", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".event-results tbody")).toContainText("Second 1");
  await expect(page.locator(".event-results tbody")).not.toContainText(
    "Premier 4",
  );
  await page.getByRole("button", { name: "All events", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Season movement", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Next league", exact: true }),
  ).toBeVisible();
});
