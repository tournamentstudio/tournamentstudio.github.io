import { expect, test, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const title = "Returning cup جام دوستان";

async function saveReturningTournament(page: Page) {
  const draft = createTournament(title, [
    createParticipant("Cedar سرو", 1),
    createParticipant("سپهر Sepehr", 2),
  ]);
  const tournament = generateStage(draft, draft.stages[0].id);
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeCode(tournament))}`,
  );
  await page
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
}

async function observeWelcome(page: Page) {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector(".welcome-page"))
        document.documentElement.dataset.welcomeSeenDuringStartup = "yes";
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}

test("a delayed IndexedDB startup keeps the returning library loading without showing the welcome page", async ({
  page,
}) => {
  await saveReturningTournament(page);
  await observeWelcome(page);
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    const success = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      "onsuccess",
    )!;
    let intercepted = false;
    IDBFactory.prototype.open = function (name, version) {
      const request =
        version === undefined
          ? open.call(this, name)
          : open.call(this, name, version);
      if (name !== "TournaStudio" || intercepted) return request;
      intercepted = true;
      Object.defineProperty(request, "onsuccess", {
        configurable: true,
        get() {
          return success.get?.call(request);
        },
        set(listener: IDBRequest["onsuccess"]) {
          success.set?.call(request, function (event: Event) {
            document.documentElement.dataset.libraryOpenPending = "true";
            document.addEventListener(
              "release-initial-library-open",
              () => listener?.call(request, event),
              { once: true },
            );
          });
        },
      });
      return request;
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-library-open-pending",
    "true",
  );
  await expect(
    page.getByText("Loading tournaments...", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page.locator(".tournament-card")).toHaveCount(0);
  const importControl = page.getByRole("button", {
    name: "Import & restore",
    exact: true,
    includeHidden: true,
  });
  await importControl.evaluate((element: HTMLButtonElement) => element.focus());
  await expect(importControl).not.toBeFocused();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("release-initial-library-open")),
  );
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tournament-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Import & restore", exact: true }),
  ).toBeVisible();
  await importControl.focus();
  await expect(importControl).toBeFocused();
  await expect(
    page.getByText("Loading tournaments...", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-welcome-seen-during-startup",
    "yes",
  );
});

test("an initial IndexedDB library read failure offers retry and recovers the saved library", async ({
  page,
}, testInfo) => {
  await saveReturningTournament(page);
  await observeWelcome(page);
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    let failRead = true;
    document.addEventListener("restore-initial-library-read", () => {
      failRead = false;
    });
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const [storeNames, mode] = args;
      const names =
        typeof storeNames === "string" ? [storeNames] : Array.from(storeNames);
      if (
        this.name === "TournaStudio" &&
        names.length === 1 &&
        names[0] === "documents" &&
        (mode ?? "readonly") === "readonly" &&
        failRead
      ) {
        document.documentElement.dataset.libraryReadFailed = "true";
        throw new DOMException(
          "Test library storage read is unavailable",
          "UnknownError",
        );
      }
      return transaction.call(this, ...args);
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-library-read-failed",
    "true",
  );
  await expect(
    page.getByText("Could not load your tournaments.", { exact: true }),
  ).toBeVisible();
  const retry = page.getByRole("button", {
    name: "Retry loading",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({
    path: testInfo.outputPath("library-read-error-320.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("restore-initial-library-read")),
  );
  await retry.focus();
  await retry.press("Enter");
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tournament-card")).toHaveCount(1);
  await expect(retry).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-welcome-seen-during-startup",
    "yes",
  );
});
