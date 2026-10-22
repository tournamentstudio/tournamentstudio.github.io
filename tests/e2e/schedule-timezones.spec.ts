import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function importSchedule(page: Page, document: Tournament) {
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
      name: "schedule.json",
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
  await section(page, "Schedule");
}

for (const setting of [
  {
    zone: "America/Los_Angeles",
    summer: "2026-10-21T11:00",
    summerEnd: "2026-10-21T14:00",
    winterInstant: "2026-12-21T18:00:00.000Z",
    winterFrom: "2026-12-21T17:30:00.000Z",
    winterUntil: "2026-12-21T21:00:00.000Z",
    recipientZone: "Asia/Tehran",
    recipientLocal: "2026-12-21T21:30",
  },
  {
    zone: "Asia/Tehran",
    summer: "2026-10-21T21:30",
    summerEnd: "2026-10-22T00:30",
    winterInstant: "2026-12-21T06:30:00.000Z",
    winterFrom: "2026-12-21T06:00:00.000Z",
    winterUntil: "2026-12-21T09:30:00.000Z",
    recipientZone: "America/Los_Angeles",
    recipientLocal: "2026-12-20T22:30",
  },
]) {
  test.describe(setting.zone, () => {
    test.use({ timezoneId: setting.zone });

    test("new tournament starts at the current device-local minute", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-21T18:00:42.000Z"));
      await page.goto("/#/create");
      await page
        .getByLabel("Tournament title", { exact: true })
        .fill("Local start cup");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Participant count", { exact: true }).fill("2");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("button", { name: "Create tournament", exact: true })
        .click();
      await expect(page.locator(".save-status")).toHaveText("Saved locally");
      await section(page, "Schedule");
      await expect(
        page.getByLabel("Start time (device timezone)", { exact: true }),
      ).toHaveValue(setting.summer);
    });

    test("imports UTC availability and keeps edited schedule instants across devices", async ({
      page,
      browser,
      baseURL,
    }) => {
      let document = createTournament("Timezone transfer", [
        createParticipant("آفتاب A", 1),
        createParticipant("سپهر B", 2),
      ]);
      document.schedule.startAt = "2026-10-21T18:00:00.000Z";
      document.schedule.resources[0].availableFrom = "2026-10-21T18:00:00.000Z";
      document.schedule.resources[0].availableUntil =
        "2026-10-21T21:00:00.000Z";
      document = generateStage(document, document.stages[0].id);
      await importSchedule(page, document);
      await expect(
        page.getByLabel("Start time (device timezone)", { exact: true }),
      ).toHaveValue(setting.summer);
      await page.getByText("Availability", { exact: true }).click();
      await expect(
        page.getByLabel("Available from", { exact: true }),
      ).toHaveValue(setting.summer);
      await expect(
        page.getByLabel("Available until", { exact: true }),
      ).toHaveValue(setting.summerEnd);
      await page
        .getByLabel("Start time (device timezone)", { exact: true })
        .fill("2026-12-21T10:00");
      await page
        .getByLabel("Available from", { exact: true })
        .fill("2026-12-21T09:30");
      await page
        .getByLabel("Available until", { exact: true })
        .fill("2026-12-21T13:00");
      await page
        .getByRole("button", { name: "Generate schedule", exact: true })
        .click();
      await expect(page.locator(".save-status")).toHaveText("Saved locally");
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.reload();
      await section(page, "Schedule");
      await expect(
        page.getByLabel("Start time (device timezone)", { exact: true }),
      ).toHaveValue("2026-12-21T10:00");
      await section(page, "Share Center");
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "JSON", exact: true }).click();
      const download = await pending;
      const exported = JSON.parse(
        await readFile((await download.path())!, "utf8"),
      ) as Tournament;
      expect(exported.schedule.startAt).toBe(setting.winterInstant);
      expect(exported.schedule.resources[0].availableFrom).toBe(
        setting.winterFrom,
      );
      expect(exported.schedule.resources[0].availableUntil).toBe(
        setting.winterUntil,
      );
      expect(exported.matches[0].scheduledAt).toBe(setting.winterInstant);
      const recipient = await browser.newContext({
        baseURL,
        timezoneId: setting.recipientZone,
      });
      try {
        const other = await recipient.newPage();
        await importSchedule(other, exported);
        await expect(
          other.getByLabel("Start time (device timezone)", { exact: true }),
        ).toHaveValue(setting.recipientLocal);
      } finally {
        await recipient.close();
      }
    });
  });
}
