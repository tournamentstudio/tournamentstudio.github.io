import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { simulate } from "../../src/engine";

async function importCup(page: Page, title: string) {
  const document = simulate(
    createTournament(title, [
      createParticipant("آفتاب", 1),
      createParticipant("North", 2),
      createParticipant("East", 3),
      createParticipant("West", 4),
    ]),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "cup.json",
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
  return document;
}
async function createEvent(page: Page, title: string, secret = "") {
  await page.goto("/#/events");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Create event",
    exact: true,
  });
  await dialog.getByLabel("New event title", { exact: true }).fill(title);
  await dialog.getByLabel("Season label", { exact: true }).fill("2026");
  if (secret)
    await dialog
      .getByLabel("Event vault secret (optional)", { exact: true })
      .fill(secret);
  await dialog
    .getByRole("button", { name: "Save new event", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function link(page: Page, title: string) {
  await page
    .getByLabel("Local competition", { exact: true })
    .selectOption({ label: title });
  await page
    .getByRole("button", { name: "Preview competition link", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review competition link" })
    .getByRole("button", { name: "Link reviewed competition" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review competition link" }),
  ).not.toBeVisible();
  await expect(page.locator(".event-fieldset")).not.toBeDisabled();
}

test("links weighted competitions, maps shared identities, and saves season adjustments", async ({
  page,
}) => {
  await importCup(page, "Chess cup");
  await importCup(page, "Quiz cup");
  await createEvent(page, "University games");
  await link(page, "Chess cup");
  await link(page, "Quiz cup");
  await page
    .getByRole("button", { name: "Competition links", exact: true })
    .click();
  const panel = page
    .locator(".event-editor details")
    .filter({ has: page.locator("summary", { hasText: "Quiz cup" }) });
  await panel.locator("summary").click();
  await panel.getByLabel("Competition weight", { exact: true }).fill("2");
  for (const [index, name] of ["آفتاب", "North", "East", "West"].entries()) {
    const field = panel.getByLabel(name, { exact: true });
    const value = await field
      .locator("option")
      .nth(index)
      .getAttribute("value");
    await field.selectOption(value!);
  }
  await page.getByRole("button", { name: "Save event configuration" }).click();
  await expect(page.locator(".event-fieldset")).not.toBeDisabled();
  await expect(page.locator(".event-results tbody tr")).toHaveCount(4);
  await expect(page.locator(".event-results tbody tr").first()).toContainText(
    "75",
  );
  await page
    .getByText("Points adjustments and penalties", { exact: true })
    .click();
  await page
    .getByLabel("Adjustment recipient", { exact: true })
    .selectOption({ label: "آفتاب" });
  await page.getByLabel("Points adjustment", { exact: true }).fill("-5");
  await page
    .getByLabel("Adjustment reason", { exact: true })
    .fill("Reviewed ruling");
  await page
    .getByRole("button", { name: "Record points adjustment", exact: true })
    .click();
  await expect(page.locator(".event-results tbody tr").first()).toContainText(
    "70",
  );
  await page.reload();
  await page.getByRole("button", { name: "Open event", exact: true }).click();
  await expect(page.locator(".event-results tbody tr").first()).toContainText(
    "70",
  );
  await page
    .getByRole("button", { name: "Present event", exact: true })
    .click();
  const presentation = page.getByRole("dialog", {
    name: "Event presentation",
    exact: true,
  });
  await expect(presentation).toContainText("University games");
  await expect(presentation).not.toContainText("Reviewed ruling");
  await presentation.getByRole("button", { name: "Close dialog" }).click();
});

test("portable event import restores all competitions in a fresh profile", async ({
  page,
  browser,
}) => {
  await importCup(page, "Final cup");
  await createEvent(page, "Portable festival");
  await link(page, "Final cup");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download event package", exact: true })
    .click();
  const bytes = await readFile((await (await downloading).path())!);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto("/#/events");
    await recipient
      .getByRole("button", { name: "Import event", exact: true })
      .click();
    const dialog = recipient.getByRole("dialog", {
      name: "Import event package",
    });
    await dialog
      .getByLabel("Event package file", { exact: true })
      .setInputFiles({
        name: "event.tsevent",
        mimeType: "text/plain",
        buffer: bytes,
      });
    await dialog
      .getByRole("button", { name: "Preview event import", exact: true })
      .click();
    await expect(dialog).toContainText("Portable festival");
    await dialog
      .getByRole("button", {
        name: "Import independent event copy",
        exact: true,
      })
      .click();
    await expect(recipient.locator(".event-results tbody tr")).toHaveCount(4);
    await expect(
      recipient.locator(".event-results tbody tr").first(),
    ).toContainText("25");
    await recipient
      .getByLabel("Event title", { exact: true })
      .fill("Recipient festival");
    await recipient
      .getByRole("button", { name: "Save event configuration" })
      .click();
    await expect(
      recipient.getByRole("heading", {
        name: "Recipient festival",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Portable festival", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("protected event hides persisted metadata and retains protection in copied seasons", async ({
  page,
}) => {
  await importCup(page, "Recurring cup");
  await createEvent(page, "Private festival", "event-browser-test-secret");
  await link(page, "Recurring cup");
  const persisted = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onsuccess = () => {
          const db = request.result;
          const query = db
            .transaction("preferences")
            .objectStore("preferences")
            .getAll();
          query.onsuccess = () => {
            resolve(JSON.stringify(query.result));
            db.close();
          };
          query.onerror = () => reject(query.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(persisted).not.toContain("Private festival");
  expect(persisted).not.toContain("event-browser-test-secret");
  await page.getByRole("button", { name: "Duplicate for next season" }).click();
  const dialog = page.getByRole("dialog", { name: "Create next season" });
  await dialog
    .getByLabel("Next event title", { exact: true })
    .fill("Next festival");
  await dialog.getByLabel("Next season label", { exact: true }).fill("2027");
  await dialog
    .getByRole("button", { name: "Create independent season" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Next festival", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".event-results")).toContainText(
    "Their points are excluded",
  );
  await page.getByRole("button", { name: "Lock event", exact: true }).click();
  await expect(page.getByText("Next festival", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open event", exact: true })
    .first()
    .click();
  const unlock = page.getByRole("dialog", { name: "Unlock event" });
  await unlock
    .getByLabel("Event secret", { exact: true })
    .fill("wrong-event-secret");
  await unlock.getByRole("button", { name: "Unlock saved event" }).click();
  await expect(unlock.getByRole("alert")).toBeVisible();
  await unlock
    .getByLabel("Event secret", { exact: true })
    .fill("event-browser-test-secret");
  await unlock.getByRole("button", { name: "Unlock saved event" }).click();
  await expect(
    page.getByRole("heading", { name: "Next festival", exact: true }),
  ).toBeVisible();
});

test("event controls fit Persian at 320px and pass automated AA checks", async ({
  page,
}) => {
  await importCup(page, "Persian cup");
  await createEvent(page, "جشنواره دانشگاه تهران");
  await link(page, "Persian cup");
  await page.setViewportSize({ width: 320, height: 860 });
  await page.getByRole("button", { name: "Switch to Persian" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [
      ...document.querySelectorAll(
        "main, main > div, .event-fieldset, .event-results, .event-editor, .event-attach, .event-transfer, .section-heading, .table-scroll",
      ),
    ].map((e) => ({
      tag: e.tagName,
      cls: e.className,
      width: e.getBoundingClientRect().width,
    })),
  }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.width,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/collections-persian-mobile.png",
    fullPage: true,
  });
});
