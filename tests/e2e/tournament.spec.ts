import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const testSecret = "test-only-vault-secret";

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function create(
  page: Page,
  options: {
    title?: string;
    count?: number;
    sport?: string;
    format?: string;
    secret?: string;
    names?: string[];
    groups?: number;
    playoffs?: boolean;
    theme?: string;
  } = {},
) {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill(options.title ?? "Browser cup");
  if (options.sport)
    await page.getByLabel("Sport or activity").selectOption(options.sport);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (options.format)
    await page.getByLabel("Competition format").selectOption(options.format);
  await page
    .getByLabel("Participant count", { exact: true })
    .fill(String(options.count ?? 4));
  if (options.groups)
    await page
      .getByLabel("Number of groups", { exact: true })
      .fill(String(options.groups));
  if (options.playoffs)
    await page.getByLabel("Add a knockout playoff stage").check();
  if (options.names)
    await page
      .getByLabel("Or paste names, one per line")
      .fill(options.names.join("\n"));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (options.theme)
    await page
      .getByRole("combobox", { name: "Tournament theme", exact: true })
      .selectOption(options.theme);
  if (options.secret) {
    await page.getByLabel("Keep this tournament in a protected vault").check();
    await page.getByLabel("Vault secret", { exact: true }).fill(options.secret);
  }
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await expect(
    page.getByRole("heading", {
      name: options.title ?? "Browser cup",
      exact: true,
    }),
  ).toBeVisible();
  await saved(page);
  return page.url();
}

async function recordFirstReady(page: Page, first = 3, second = 1) {
  await section(page, "Matches");
  await page
    .getByRole("button", { name: "Ready to play", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  const inputs = dialog.locator('.score-entry input[type="number"]');
  await inputs.nth(0).fill(String(first));
  await inputs.nth(1).fill(String(second));
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

async function recordSeededReady(page: Page) {
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  const names = await dialog.locator(".score-side bdi").allTextContents();
  for (let index = 0; index < names.length; index++) {
    const seed = Number(names[index].match(/\d+$/)?.[0]);
    expect(seed).toBeGreaterThan(0);
    await dialog
      .locator('.score-entry input[type="number"]')
      .nth(index)
      .fill(String(100 - seed));
  }
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

async function snapshotLink(page: Page) {
  await section(page, "Share Center");
  await page.getByRole("button", { name: "Generate link & code" }).click();
  await expect(page.getByLabel("Snapshot link", { exact: true })).toHaveValue(
    /#\/open\/TS1/,
  );
  return page.getByLabel("Snapshot link", { exact: true }).inputValue();
}

async function importLink(context: BrowserContext, link: string) {
  const page = await context.newPage();
  await page.goto(link);
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await expect(
    dialog.getByText("This is a read-only preview.", { exact: false }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/#\/open/);
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  return page;
}

async function pasteImport(page: Page, code: string) {
  await section(page, "Share Center");
  await page
    .getByRole("button", { name: "Import a package", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.getByLabel("Import code", { exact: true }).fill(code);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  return dialog;
}

test("completes a 13-entrant knockout with byes and retains its champion after reload", async ({
  page,
}) => {
  const url = await create(page, { title: "Thirteen-team cup", count: 13 });
  await section(page, "Matches");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator(".match-tile.bye")).toHaveCount(3);
  for (let match = 0; match < 12; match++) await recordFirstReady(page);
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.locator(".match-tile.completed")).toHaveCount(12);
  await section(page, "Overview");
  await expect(page.locator(".overview-welcome h2")).toHaveText("Team 1");
  await expect(page.locator(".workspace-title .badge")).toHaveText("Completed");
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".overview-welcome h2")).toHaveText("Team 1");
  await saved(page);
});

for (const scenario of [
  {
    title: "Sixteen-team group cup",
    count: 16,
    groups: 4,
    groupMatches: 24,
    qualifiers: 8,
    sport: "generic",
    theme: "minimal-light",
  },
  {
    title: "Gol eight-team championship",
    count: 8,
    groups: 2,
    groupMatches: 12,
    qualifiers: 4,
    sport: "gol-ya-pooch",
    theme: "gol-traditional",
  },
]) {
  test(`completes ${scenario.title} from groups through playoffs`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await create(page, { ...scenario, format: "groups", playoffs: true });
    if (scenario.sport === "gol-ya-pooch") {
      await section(page, "Participants");
      await expect(page.locator("tbody tr")).toHaveCount(8);
      await expect(page.locator("tbody tr td:nth-child(3)")).toHaveText(
        Array.from({ length: 8 }, () => "3"),
      );
      await page
        .getByRole("button", { name: "Edit", exact: true })
        .first()
        .click();
      const roster = page.getByRole("dialog", { name: "Edit participant" });
      await expect(
        roster.getByLabel("Player name", { exact: true }),
      ).toHaveCount(3);
      await expect(
        roster.getByRole("combobox", { name: "Role", exact: true }).first(),
      ).toHaveValue("captain");
      await roster
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await section(page, "Theme Studio");
      await expect(
        page.getByRole("button", {
          name: "Gol Ya Pooch Traditional",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await section(page, "Matches");
    for (let index = 0; index < scenario.groupMatches; index++)
      await recordSeededReady(page);
    await expect(page.locator(".match-tile.ready")).toHaveCount(0);
    await section(page, "Standings");
    await expect(page.locator(".standings-table tbody tr")).toHaveCount(
      scenario.count,
    );
    await section(page, "Structure");
    await page.locator(".stage-node").filter({ hasText: "Playoffs" }).click();
    await page
      .getByRole("button", { name: "Generate draw", exact: true })
      .click();
    await saved(page);
    await expect(page.locator(".stage-node.active")).toContainText(
      `${scenario.qualifiers - 1} matches`,
    );
    await section(page, "Rules");
    await expect(
      page.getByRole("button", { name: "Save rules", exact: true }),
    ).toBeDisabled();
    await section(page, "Matches");
    await expect(page.locator(".match-tile.ready")).toHaveCount(
      scenario.qualifiers / 2,
    );
    for (let index = 0; index < scenario.qualifiers - 1; index++)
      await recordSeededReady(page);
    await section(page, "Overview");
    await expect(page.locator(".workspace-title .badge")).toHaveText(
      "Completed",
    );
    await expect(page.locator(".overview-welcome h2")).toHaveText("Team 1");
    await page.reload();
    await expect(page.locator(".overview-welcome h2")).toHaveText("Team 1");
  });
}

test("opens GSL and triple elimination draws and completes a five-round Swiss field of 17", async ({
  page,
}) => {
  test.setTimeout(150000);
  for (const format of ["gsl", "triple-elimination"]) {
    await create(page, { title: `${format} draw`, count: 8, format });
    await section(page, "Matches");
    await expect(page.locator(".match-tile.ready")).toHaveCount(4);
    await recordSeededReady(page);
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(page.locator(".match-tile.completed")).toHaveCount(1);
  }
  await create(page, { title: "Swiss seventeen", count: 17, format: "swiss" });
  await section(page, "Matches");
  for (let round = 1; round <= 5; round++) {
    await expect(page.locator(".match-tile.ready")).toHaveCount(8);
    for (let index = 0; index < 8; index++) await recordSeededReady(page);
    if (round < 5) {
      await page
        .getByRole("button", { name: "Next round", exact: true })
        .click();
      await saved(page);
    }
  }
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await expect(page.locator(".match-tile.completed")).toHaveCount(40);
  await expect(page.locator(".match-tile.bye")).toHaveCount(5);
  const pairs = await page
    .locator(".match-tile.completed")
    .evaluateAll((tiles) =>
      tiles.map((tile) =>
        [...tile.querySelectorAll(".match-entrant bdi")]
          .map((name) => name.textContent)
          .sort()
          .join("|"),
      ),
    );
  expect(new Set(pairs).size).toBe(40);
  const byeNames = await page
    .locator(".match-tile.bye")
    .evaluateAll((tiles) =>
      tiles.map((tile) =>
        [...tile.querySelectorAll(".match-entrant bdi")]
          .map((name) => name.textContent)
          .find((name) => name?.startsWith("Team")),
      ),
    );
  expect(new Set(byeNames).size).toBe(5);
  await expect(page.locator(".workspace-title .badge")).toHaveText("Completed");
});

test("persists a theme and a recorded result independently of display settings", async ({
  page,
}, testInfo) => {
  await create(page, { title: "Theme cup" });
  await recordFirstReady(page, 7, 2);
  await section(page, "Theme Studio");
  await page
    .getByRole("button", { name: "Championship Gold", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("button", { name: "Championship Gold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await section(page, "Theme Studio");
  await expect(
    page.getByRole("button", { name: "Championship Gold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: testInfo.outputPath("theme-desktop.png"),
    fullPage: true,
  });
  await section(page, "Matches");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.locator(".match-tile.completed")).toHaveCount(1);
  await expect(
    page.locator(".match-tile.completed .match-entrant strong"),
  ).toHaveText(["7", "2"]);
});

test("reconstructs a public link in another browser profile and keeps edits independent", async ({
  page,
  browser,
}) => {
  await create(page, {
    title: "Portable Persian cup",
    names: ["Atlas United", "تیم آفتاب", "North Stars", "تیم باران"],
  });
  const link = await snapshotLink(page);
  const recipientContext = await browser.newContext();
  try {
    const recipient = await importLink(recipientContext, link);
    await expect(
      recipient.getByRole("heading", {
        name: "Portable Persian cup",
        exact: true,
      }),
    ).toBeVisible();
    await recordFirstReady(recipient, 8, 3);
    await page.reload();
    await section(page, "Matches");
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(page.locator(".match-tile.completed")).toHaveCount(0);
    await section(recipient, "Matches");
    await recipient
      .getByRole("button", { name: "Completed", exact: true })
      .click();
    await expect(recipient.locator(".match-tile.completed")).toHaveCount(1);
  } finally {
    await recipientContext.close();
  }
});

test("applies a versioned update once and rejects duplicate and divergent copies", async ({
  page,
  browser,
}) => {
  await create(page, { title: "Update cup" });
  const link = await snapshotLink(page);
  const recipientContext = await browser.newContext();
  const divergentContext = await browser.newContext();
  try {
    const recipient = await importLink(recipientContext, link);
    const divergent = await importLink(divergentContext, link);
    await recordFirstReady(divergent, 5, 4);
    await recordFirstReady(page, 4, 1);
    await section(page, "Share Center");
    await page.getByLabel("Recipient base revision", { exact: true }).fill("1");
    await page
      .getByRole("button", { name: "Generate update code", exact: true })
      .click();
    await expect(page.getByLabel("Portable code", { exact: true })).toHaveValue(
      /^TSP1:/,
    );
    const code = await page
      .getByLabel("Portable code", { exact: true })
      .inputValue();
    const preview = await pasteImport(recipient, code);
    await expect(
      preview.getByRole("button", { name: "Apply verified update" }),
    ).toBeVisible();
    await preview
      .getByRole("button", { name: "Apply verified update" })
      .click();
    await expect(preview).not.toBeVisible();
    await saved(recipient);
    await section(recipient, "Matches");
    await recipient
      .getByRole("button", { name: "Completed", exact: true })
      .click();
    await expect(
      recipient.locator(".match-tile.completed .match-entrant strong"),
    ).toHaveText(["4", "1"]);
    const duplicate = await pasteImport(recipient, code);
    await expect(duplicate.getByRole("alert")).toContainText(
      /already|base|revision/i,
    );
    await expect(
      duplicate.getByRole("button", { name: "Apply verified update" }),
    ).toHaveCount(0);
    const conflict = await pasteImport(divergent, code);
    await expect(conflict.getByRole("alert")).toContainText(
      /diverg|base|revision/i,
    );
    await expect(
      conflict.getByRole("button", { name: "Apply verified update" }),
    ).toHaveCount(0);
  } finally {
    await recipientContext.close();
    await divergentContext.close();
  }
});

test("exports a private archive and imports it into a clean profile", async ({
  page,
  browser,
}, testInfo) => {
  await create(page, { title: "Archive cup" });
  await recordFirstReady(page, 6, 2);
  await section(page, "Share Center");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const download = await downloadPromise;
  const archive = testInfo.outputPath("archive-cup.tourney");
  await download.saveAs(archive);
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    await fresh.goto("/");
    await fresh
      .getByRole("button", { name: "Import a tournament", exact: true })
      .click();
    const dialog = fresh.getByRole("dialog", {
      name: "Bring a tournament into your studio",
    });
    await dialog.locator('input[type="file"]').setInputFiles(archive);
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Archive cup", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(fresh);
    await section(fresh, "Matches");
    await fresh.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(
      fresh.locator(".match-tile.completed .match-entrant strong"),
    ).toHaveText(["6", "2"]);
  } finally {
    await freshContext.close();
  }
});

test("locks an encrypted tournament and rejects the wrong secret", async ({
  page,
}) => {
  await create(page, { title: "Private vault cup", secret: testSecret });
  const persisted = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<string>((resolve, reject) => {
      const transaction = database.transaction(
        ["documents", "snapshots"],
        "readonly",
      );
      const records: unknown[] = [];
      for (const name of ["documents", "snapshots"]) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => records.push(...request.result);
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(JSON.stringify(records));
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
  expect(persisted).not.toContain("Private vault cup");
  expect(persisted).not.toContain(testSecret);
  expect(persisted).toContain("AES-256-GCM");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Private vault cup", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Protected tournament", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Unlock your tournament" });
  await dialog
    .getByLabel("Vault secret", { exact: true })
    .fill("wrong-test-secret");
  await dialog
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Incorrect secret or damaged encrypted data",
  );
  await dialog.getByLabel("Vault secret", { exact: true }).fill(testSecret);
  await dialog
    .getByRole("button", { name: "Unlock tournament", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private vault cup", exact: true }),
  ).toBeVisible();
});

test("recovers an encrypted backup in a clean profile with its separate secret", async ({
  page,
  browser,
}, testInfo) => {
  await create(page, { title: "Encrypted archive cup", secret: testSecret });
  await section(page, "Share Center");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("encrypted-cup.tourney");
  await (await downloadPromise).saveAs(archive);
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    await fresh.goto("/");
    await fresh
      .getByRole("button", { name: "Import a tournament", exact: true })
      .click();
    const dialog = fresh.getByRole("dialog", {
      name: "Bring a tournament into your studio",
    });
    await dialog.locator('input[type="file"]').setInputFiles(archive);
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill("wrong-test-secret");
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Incorrect secret or damaged encrypted data",
    );
    await dialog
      .getByLabel("Separate secret, if encrypted", { exact: true })
      .fill(testSecret);
    await dialog
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", {
        name: "Encrypted archive cup",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Save in a protected local vault"),
    ).toBeChecked();
    await dialog
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(fresh);
    await expect(
      fresh.getByRole("heading", {
        name: "Encrypted archive cup",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      fresh.getByRole("button", { name: "Lock", exact: true }),
    ).toBeVisible();
  } finally {
    await freshContext.close();
  }
});

test("a save finishing after vault lock cannot reopen the unlocked document", async ({
  page,
}) => {
  const url = await create(page, {
    title: "Lock race cup",
    secret: testSecret,
  });
  const id = url.split("/t/")[1];
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("2");
  await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = async (
      ...arguments_: Parameters<SubtleCrypto["encrypt"]>
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return original(...arguments_);
    };
  });
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saving...");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lock race cup", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(async (tournamentId) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("TournaStudio");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          return new Promise<number>((resolve, reject) => {
            const request = database
              .transaction("documents")
              .objectStore("documents")
              .get(tournamentId);
            request.onsuccess = () => {
              database.close();
              resolve(request.result?.revision ?? 0);
            };
            request.onerror = () => reject(request.error);
          });
        }, id),
      { timeout: 15000 },
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "Protected tournament", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Unlock your tournament" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lock race cup", exact: true }),
  ).toHaveCount(0);
});

test("requires confirmation before a correction clears a played final", async ({
  page,
}) => {
  await create(page, { title: "Correction cup" });
  for (let index = 0; index < 3; index++) await recordFirstReady(page);
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await page.locator(".match-tile.completed").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog.locator('.score-entry input[type="number"]').nth(0).fill("1");
  await dialog.locator('.score-entry input[type="number"]').nth(1).fill("3");
  await dialog
    .getByRole("combobox", { name: "Winner decision", exact: true })
    .selectOption("");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(
    dialog.getByText("This correction affects played matches.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator(".correction-warning li")).toHaveCount(1);
  await dialog
    .getByRole("button", {
      name: "Confirm correction and reset dependents",
      exact: true,
    })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await expect(page.locator(".match-tile.completed")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Ready to play", exact: true })
    .click();
  await expect(page.locator(".match-tile.ready")).toHaveCount(1);
  await expect(page.locator(".match-tile.ready")).toContainText("Team 4");
  await section(page, "History");
  await expect(
    page.getByText("Record match result", { exact: true }).first(),
  ).toBeVisible();
});

test("updates a same-profile spectator scoreboard after a confirmed referee hand", async ({
  page,
  context,
}) => {
  await create(page, {
    title: "Gol projector cup",
    count: 2,
    sport: "gol-ya-pooch",
  });
  await section(page, "Presentation");
  await page
    .getByRole("combobox", { name: "Scene type", exact: true })
    .selectOption("current");
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await saved(page);
  const spectatorPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Present", exact: true }).click();
  const spectator = await spectatorPromise;
  await spectator.waitForLoadState("domcontentloaded");
  for (let index = 0; index < 3; index++)
    await spectator
      .getByRole("button", { name: "Next scene", exact: true })
      .click();
  await expect(spectator.getByTestId("presentation-scoreboard")).toBeVisible();
  await expect(spectator.locator(".scoreboard-entrant strong")).toHaveText([
    "0",
    "0",
  ]);
  await section(page, "Matches");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  await dialog
    .getByRole("button", { name: "Referee mode", exact: true })
    .click();
  await dialog
    .getByLabel("Concealed position (private)", { exact: true })
    .fill("PRIVATE-REFEREE-LOCATION");
  await dialog.getByLabel("Hand points", { exact: true }).fill("3");
  await dialog
    .getByRole("button", { name: "Record hand", exact: true })
    .click();
  await saved(page);
  await expect(spectator.locator(".scoreboard-entrant strong")).toHaveText([
    "3",
    "0",
  ]);
  await expect(spectator.locator("body")).not.toContainText(
    "PRIVATE-REFEREE-LOCATION",
  );
  await expect(spectator.locator('input[type="password"]')).toHaveCount(0);
  await spectator.close();
});

test("renders Persian navigation and mixed-script names on a mobile viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, {
    title: "جام پاییز Autumn",
    names: ["تیم آفتاب", "North Stars", "تیم باران", "Atlas United"],
  });
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await page
    .getByRole("navigation", { name: "بخش‌های مسابقات" })
    .getByRole("button", { name: "دیدارها", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "میز دیدارها", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".match-tile").filter({ hasText: "تیم آفتاب" }),
  ).toBeVisible();
  await expect(
    page.locator(".match-tile").filter({ hasText: "North Stars" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("persian-mobile.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("opens the cached application and records a result while offline", async ({
  page,
  context,
}) => {
  const url = await create(page, { title: "Offline cup" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Offline cup", exact: true }),
    ).toBeVisible();
    await recordFirstReady(page, 9, 4);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(
      reopened.getByRole("heading", { name: "Offline cup", exact: true }),
    ).toBeVisible();
    await section(reopened, "Matches");
    await reopened
      .getByRole("button", { name: "Completed", exact: true })
      .click();
    await expect(
      reopened.locator(".match-tile.completed .match-entrant strong"),
    ).toHaveText(["9", "4"]);
  } finally {
    await context.setOffline(false);
  }
});
