import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

test("home leaves specialist engines and editing screens unloaded", async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let the games begin.", exact: true }),
  ).toBeVisible();
  expect(scripts.join("\n")).not.toMatch(
    /\/(?:dutch|CreateFlow|ImportCenter|Workspace|StorageHealth|ExportStudio)-/,
  );
  await page
    .getByRole("button", { name: "New tournament", exact: true })
    .click();
  await expect(
    page.getByLabel("Tournament title", { exact: true }),
  ).toBeVisible();
  expect(scripts.some((url) => /\/CreateFlow-/.test(url))).toBe(true);
  expect(scripts.join("\n")).not.toMatch(/\/dutch-/);
});

test("a failed import module keeps the received code recoverable without crashing the studio", async ({
  page,
}) => {
  const code = "TS1:RECEIVED-CODE-RECOVERY-SENTINEL";
  await page.route(/\/assets\/ImportCenter-[^/]+\.js$/, (route) =>
    route.abort("failed"),
  );
  await page.goto(`/#/open/${encodeURIComponent(code)}`);
  const failed = page.getByRole("dialog", {
    name: "Import could not open",
    exact: true,
  });
  await expect(failed).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Let the games begin.", exact: true }),
  ).toBeVisible();
  const field = failed.getByLabel("Received share code", { exact: true });
  await expect(field).toHaveValue(code);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain(code);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new Error("Clipboard denied for recovery test")),
      },
    }),
  );
  await failed
    .getByRole("button", { name: "Copy received code", exact: true })
    .click();
  await expect(failed.getByRole("status")).toHaveText(
    "Copy the selected code, or download it below.",
  );
  await expect(field).toBeFocused();
  expect(
    await field.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe(code);
  const downloadPromise = page.waitForEvent("download");
  await failed
    .getByRole("button", { name: "Download received code", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(code);
  await failed
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(failed).toBeVisible();
  await expect(field).toHaveValue(code);
  await failed.getByRole("button", { name: "Close", exact: true }).click();
  await expect(failed).not.toBeVisible();
  await expect(
    page.getByLabel("Received share code", { exact: true }),
  ).toHaveCount(0);
  const opener = page.getByRole("button", {
    name: "Import & restore",
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(failed).toBeVisible();
  await expect(
    failed.getByLabel("Received share code", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("canceling a loading import cannot reopen it after its module arrives", async ({
  page,
}) => {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/ImportCenter-[^/]+\.js$/, async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto("/");
    const opener = page.getByRole("button", {
      name: "Import & restore",
      exact: true,
    });
    await opener.focus();
    await page.keyboard.press("Enter");
    const loading = page.getByRole("dialog", {
      name: "Opening import...",
      exact: true,
    });
    await expect(loading).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(loading).not.toBeVisible();
    await expect(opener).toBeFocused();
    release();
    await page.keyboard.press("Enter");
    const importer = page.getByRole("dialog", {
      name: "Bring a tournament into your studio",
      exact: true,
    });
    await expect(importer).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(importer).not.toBeVisible();
    await expect(opener).toBeFocused();
  } finally {
    release();
  }
});
