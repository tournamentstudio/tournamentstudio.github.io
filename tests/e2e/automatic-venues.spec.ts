import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";

function fixture(
  count = 8,
  format: "single-elimination" | "double-elimination" = "single-elimination",
) {
  const doc = createTournament(
    "Automatic venue cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      location: {
        latitude: 0,
        longitude: index < Math.ceil(count / 2) ? 0 : 20,
      },
      region: `Region ${index + 1}`,
      organization: `Club ${index + 1}`,
    })),
    format,
  );
  doc.schedule.startAt = "2026-10-21T09:00:00.000Z";
  doc.schedule.resources = [
    { id: "west", name: "West hall", location: { latitude: 0, longitude: 0 } },
    { id: "east", name: "East hall", location: { latitude: 0, longitude: 20 } },
    {
      id: "central",
      name: "Central arena",
      location: { latitude: 0, longitude: 10 },
    },
  ];
  return doc;
}
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
async function importFixture(page: Page, doc: Tournament | string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles(
    typeof doc === "string"
      ? doc
      : {
          name: "venues.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(doc)),
        },
  );
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
  await section(page, "Structure");
}
async function readDocument(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
    const id = location.hash.split("/")[2];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TournaStudio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const request = db
          .transaction("documents")
          .objectStore("documents")
          .get(id);
        request.onsuccess = () => resolve(request.result.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function assistant(page: Page, configure = true) {
  if (configure)
    await page
      .getByRole("button", { name: "Configure knockout draw", exact: true })
      .click();
  const panel = page.locator(".automatic-venue-assistant");
  await panel.locator(":scope > summary").click();
  return panel;
}
async function selectRound(panel: Locator, round: string) {
  await panel
    .getByRole("combobox", { name: "Bracket round", exact: true })
    .selectOption({ label: round });
  await panel
    .getByRole("button", {
      name: "Select available matches in round",
      exact: true,
    })
    .click();
}
async function find(panel: Locator, valid = true) {
  await panel
    .getByRole("button", { name: "Find venue assignments", exact: true })
    .click();
  await expect(
    panel.getByText(
      valid ? "Venue proposal is ready" : "Venue selection needs attention",
      { exact: true },
    ),
  ).toBeVisible();
}
async function addAndGenerate(page: Page, panel: Locator) {
  await panel
    .getByRole("button", { name: "Add suggestions to draw draft", exact: true })
    .click();
  await expect(
    panel.getByText("Venue proposal is ready", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
}

test("selects regional venues while retaining manual finals and earlier draw protections", async ({
  page,
  browser,
}, testInfo) => {
  const doc = fixture();
  doc.stages[0].config.knockoutDraw = {
    version: 6,
    protectedSeeds: 0,
    restrictions: ["region"],
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    distance: {
      maxKm: 3000,
      winnersThroughRound: 1,
      losersThroughRound: 0,
      finals: [],
    },
    pots: [
      {
        id: "one",
        name: "Pot 1",
        participantIds: doc.participants
          .filter((_, index) => index % 2 === 0)
          .map((item) => item.id),
      },
      {
        id: "two",
        name: "Pot 2",
        participantIds: doc.participants
          .filter((_, index) => index % 2 === 1)
          .map((item) => item.id),
      },
    ],
    venueRules: [
      {
        resourceId: "central",
        maxKm: 1200,
        targets: [{ bracket: "winners", round: 3, index: 0 }],
      },
    ],
  };
  await importFixture(page, doc);
  const panel = await assistant(page, false);
  await panel.getByLabel("West hall", { exact: true }).check();
  await panel.getByLabel("East hall", { exact: true }).check();
  await panel
    .getByLabel("Suggested maximum venue distance (km)", { exact: true })
    .fill("1000");
  await selectRound(panel, "Winners round 2");
  await panel
    .getByRole("combobox", { name: "Bracket round", exact: true })
    .selectOption({ label: "Winners round 3" });
  await expect(
    panel.getByRole("checkbox", { name: /Winners round 3, match 1/ }),
  ).toBeDisabled();
  await find(panel);
  await expect(panel.locator(".automatic-venue-choice")).toHaveCount(2);
  await expect(panel.locator(".automatic-venue-assignments")).toContainText(
    "West hall",
  );
  await expect(panel.locator(".automatic-venue-assignments")).toContainText(
    "East hall",
  );
  await expect(panel.locator(".automatic-venue-schedule-note")).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Add suggestions to draw draft",
      exact: true,
    }),
  ).toBeEnabled();
  await panel.locator(".automatic-venue-pairings summary").click();
  await expect(panel.locator(".automatic-venue-pairings li")).toHaveCount(4);
  const a11y = await new AxeBuilder({ page })
    .include(".automatic-venue-assistant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await panel
    .locator(".automatic-venue-preview")
    .screenshot({ path: testInfo.outputPath("automatic-venue-preview.png") });
  await addAndGenerate(page, panel);
  const drawn = await readDocument(page);
  const config = drawn.stages[0].config.knockoutDraw;
  expect(config?.version).toBe(6);
  expect(config).toMatchObject({
    pots: doc.stages[0].config.knockoutDraw.pots,
    distance: doc.stages[0].config.knockoutDraw.distance,
    restrictions: ["region"],
  });
  expect(config?.version === 6 ? config.venueRules[0] : null).toEqual(
    doc.stages[0].config.knockoutDraw.venueRules[0],
  );
  expect(
    new Set(
      drawn.matches
        .filter((match) => match.round === 2)
        .map((match) => match.resourceId),
    ),
  ).toEqual(new Set(["west", "east"]));
  expect(drawn.matches.find((match) => match.round === 3)?.resourceId).toBe(
    "central",
  );
  await expect(
    panel.getByRole("button", { name: "Find venue assignments", exact: true }),
  ).toBeDisabled();
  await section(page, "Schedule");
  await page
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).matches
      .filter((match) => match.round >= 2)
      .map((match) => match.resourceId),
  ).toEqual(
    drawn.matches
      .filter((match) => match.round >= 2)
      .map((match) => match.resourceId),
  );
  expect(
    (await readDocument(page)).matches.every((match) => !!match.scheduledAt),
  ).toBe(true);
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("automatic-venues.tourney");
  await (await download).saveAs(archive);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importFixture(recipient, archive);
    expect(
      (await readDocument(recipient)).stages[0].config.knockoutDraw,
    ).toEqual(config);
    expect((await readDocument(recipient)).matches).toEqual(
      (await readDocument(page)).matches,
    );
  } finally {
    await context.close();
  }
});

test("checks venue windows and invalidates proposals when availability options or seeds change", async ({
  page,
}) => {
  const doc = fixture(4);
  doc.participants.forEach((participant) => {
    participant.location = { latitude: 0, longitude: 0 };
  });
  doc.schedule.resources = doc.schedule.resources.slice(0, 2);
  doc.schedule.resources[0].availableUntil = "2020-01-01T00:00:00.000Z";
  doc.stages[0].config.knockoutDraw = {
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
  };
  await importFixture(page, doc);
  const panel = await assistant(page, false);
  await panel
    .getByRole("button", {
      name: "Select first 16 located venues",
      exact: true,
    })
    .click();
  await selectRound(panel, "Winners round 1");
  await find(panel);
  await expect(panel.locator(".automatic-venue-choice h6")).toHaveText(
    "East hall",
  );
  await panel
    .getByLabel("Check schedule availability", { exact: true })
    .uncheck();
  await expect(
    panel.getByRole("button", {
      name: "Add suggestions to draw draft",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(panel.getByRole("status")).toContainText("Inputs changed");
  await find(panel);
  await expect(panel.locator(".automatic-venue-choice h6")).toHaveText(
    "West hall",
  );
  await page.getByLabel("Draw seed", { exact: true }).fill("new-venue-seed");
  await page.getByLabel("Draw seed", { exact: true }).press("Tab");
  await saved(page);
  await expect(
    panel.getByText("Venue proposal is ready", { exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", {
      name: "Add suggestions to draw draft",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByLabel("Check schedule availability", { exact: true })
    .check();
  await find(panel);
  await addAndGenerate(page, panel);
  await section(page, "Schedule");
  await page
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).matches.every(
      (match) => match.resourceId === "east",
    ),
  ).toBe(true);
});

test("rejects invalid automatic requests and impossible finalist venue ranges", async ({
  page,
}) => {
  const doc = fixture(4);
  delete doc.schedule.resources[2].location;
  await importFixture(page, doc);
  const panel = await assistant(page);
  await expect(
    panel.getByRole("checkbox", { name: /Central arena/ }),
  ).toBeDisabled();
  await find(panel, false);
  await expect(panel.getByRole("alert")).toContainText(
    "Choose 1 to 16 distinct venues",
  );
  await panel.getByLabel("West hall", { exact: true }).check();
  await panel.getByLabel("East hall", { exact: true }).check();
  await selectRound(panel, "Winners round 2");
  await panel
    .getByLabel("Suggested maximum venue distance (km)", { exact: true })
    .fill("1000");
  await find(panel, false);
  await expect(panel.getByRole("alert")).toContainText(
    "No candidate venue assignment",
  );
  await panel
    .getByLabel("Suggested minimum venue distance (km)", { exact: true })
    .fill("2000");
  await find(panel, false);
  await expect(panel.getByRole("alert")).toContainText("valid distance range");
  await panel
    .getByLabel("Suggested minimum venue distance (km)", { exact: true })
    .fill("");
  await panel
    .getByLabel("Suggested maximum venue distance (km)", { exact: true })
    .fill("");
  await find(panel, false);
  await panel
    .getByLabel("Suggested minimum venue distance (km)", { exact: true })
    .fill("0");
  await find(panel);
  await expect(panel.locator(".draw-summary")).toContainText("Minimum: 0 km");
  await panel
    .getByLabel("Suggested maximum venue distance (km)", { exact: true })
    .fill("20017");
  await find(panel, false);
  expect((await readDocument(page)).matches).toHaveLength(0);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toBeUndefined();
});

test("assigns venues to losers brackets, finals, resets and third place", async ({
  page,
}) => {
  for (const format of ["double-elimination", "single-elimination"] as const) {
    const doc = fixture(7, format);
    if (format === "single-elimination") doc.stages[0].config.thirdPlace = true;
    await importFixture(page, doc);
    const panel = await assistant(page);
    await panel.getByLabel("Central arena", { exact: true }).check();
    const select = panel.getByRole("combobox", {
      name: "Bracket round",
      exact: true,
    });
    const rounds = await select.locator("option").allTextContents();
    for (const round of rounds) await selectRound(panel, round);
    await find(panel);
    await addAndGenerate(page, panel);
    const drawn = await readDocument(page);
    expect(drawn.matches.every((match) => match.resourceId === "central")).toBe(
      true,
    );
    expect(drawn.matches.some((match) => match.status === "bye")).toBe(true);
    expect(drawn.matches.map((match) => match.bracket)).toEqual(
      expect.arrayContaining(
        format === "double-elimination"
          ? ["winners", "losers", "final", "reset"]
          : ["winners", "placement"],
      ),
    );
    await page.reload();
    await saved(page);
    expect((await readDocument(page)).matches).toEqual(drawn.matches);
  }
});

test("discards stale automatic proposals after another tab saves venue coordinates", async ({
  page,
  context,
}) => {
  await importFixture(page, fixture(4));
  const panel = await assistant(page);
  await panel.getByLabel("West hall", { exact: true }).check();
  await selectRound(panel, "Winners round 1");
  await find(panel);
  const operator = await context.newPage();
  try {
    await operator.goto(page.url());
    await saved(operator);
    await section(operator, "Schedule");
    await operator
      .locator(".resource-edit")
      .first()
      .getByLabel("Venue longitude", { exact: true })
      .fill("1");
    await operator
      .getByRole("button", { name: "Save schedule settings", exact: true })
      .click();
    await saved(operator);
    await expect(
      panel.getByText("Venue proposal is ready", { exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", {
        name: "Add suggestions to draw draft",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", {
        name: "Find venue assignments",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Discard draw edits", exact: true })
      .click();
    await assistant(page);
    await expect(
      panel.getByRole("button", {
        name: "Find venue assignments",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await operator.close();
  }
});

test("limits automatic candidates without dropping existing selections", async ({
  page,
}) => {
  const doc = fixture(4);
  doc.schedule.resources = Array.from({ length: 17 }, (_, index) => ({
    id: `hall-${index}`,
    name: `Hall ${index + 1}`,
    location: { latitude: 0, longitude: 0 },
  }));
  await importFixture(page, doc);
  const panel = await assistant(page);
  await panel
    .getByRole("button", {
      name: "Select first 16 located venues",
      exact: true,
    })
    .click();
  await expect(
    panel.locator(".automatic-venue-options input:checked"),
  ).toHaveCount(16);
  await expect(panel.getByLabel("Hall 17", { exact: true })).toBeDisabled();
  await panel.getByLabel("Hall 1", { exact: true }).uncheck();
  await panel.getByLabel("Hall 17", { exact: true }).check();
  await expect(
    panel.locator(".automatic-venue-options input:checked"),
  ).toHaveCount(16);
  await expect(panel.getByLabel("Hall 1", { exact: true })).toBeDisabled();
});

test("blocks an accepted venue draft when another tab changes schedule timing", async ({
  page,
  context,
}) => {
  const doc = fixture(4);
  doc.stages[0].config.knockoutDraw = {
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
  };
  await importFixture(page, doc);
  const panel = await assistant(page, false);
  await panel.getByLabel("Central arena", { exact: true }).check();
  await selectRound(panel, "Winners round 1");
  await find(panel);
  const estimate = panel.getByRole("region", {
    name: "Stage schedule estimate",
    exact: true,
  });
  await expect(estimate).toContainText("Matches in this stage");
  await expect(estimate.locator("time")).toHaveCount(2);
  await panel
    .getByRole("button", { name: "Add suggestions to draw draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeEnabled();
  const operator = await context.newPage();
  try {
    await operator.goto(page.url());
    await saved(operator);
    await section(operator, "Schedule");
    await operator.getByLabel("Rest minutes", { exact: true }).fill("31");
    await operator
      .getByRole("button", { name: "Save schedule settings", exact: true })
      .click();
    await saved(operator);
    await expect(
      page.getByRole("button", { name: "Apply draw rules", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Preview knockout draw", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", {
        name: "Find venue assignments",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.locator(".knockout-draw-editor > .notice-danger"),
    ).toContainText("This stage changed in another edit");
    expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
      doc.stages[0].config.knockoutDraw,
    );
    expect((await readDocument(page)).schedule.restMinutes).toBe(31);
    expect((await readDocument(page)).schedule.resources).toEqual(
      doc.schedule.resources,
    );
    await page
      .getByRole("button", { name: "Discard draw edits", exact: true })
      .click();
    await expect(
      panel.getByRole("button", {
        name: "Find venue assignments",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await operator.close();
  }
});

test("fits Persian automatic venue selection and previews at 320 pixels", async ({
  page,
}, testInfo) => {
  const doc = fixture(7, "double-elimination");
  doc.schedule.resources[2].name =
    "سالن مسابقات قهرمانی شهرستان بزرگ گل یا پوچ Central arena";
  await importFixture(page, doc);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .getByRole("button", { name: "تنظیم قرعه حذفی", exact: true })
    .click();
  const panel = page.locator(".automatic-venue-assistant");
  await panel.locator(":scope > summary").click();
  await panel
    .getByLabel(doc.schedule.resources[2].name, { exact: true })
    .check();
  await panel
    .getByRole("combobox", { name: "دور جدول", exact: true })
    .selectOption({ label: "فینال تکراری" });
  await panel.getByLabel("فینال تکراری", { exact: true }).check();
  await panel
    .getByRole("button", { name: "یافتن محل بازی دیدارها", exact: true })
    .click();
  await expect(
    panel.getByText("پیشنهاد محل بازی آماده است", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const clipped = await panel
    .locator(
      "p, legend, .field > span, .check-row > span, .text-button, .button, .automatic-venue-choice h6, .automatic-venue-choice li > span",
    )
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.textContent),
    );
  expect(clipped).toEqual([]);
  const a11y = await new AxeBuilder({ page })
    .include(".automatic-venue-assistant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await panel.locator(".automatic-venue-preview h5").click();
  await page.evaluate(() => {
    if (window.document.activeElement instanceof HTMLElement)
      window.document.activeElement.blur();
  });
  await expect(page.locator(".skip-link")).not.toBeFocused();
  expect(
    await page
      .locator(".skip-link")
      .evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);
  await panel.locator(":scope > summary").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("automatic-venue-persian.png"),
  });
  await panel.locator(".automatic-venue-preview").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("automatic-venue-persian-preview.png"),
  });
  await panel
    .getByRole("button", {
      name: "افزودن پیشنهادها به پیش‌نویس قرعه",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "پیش‌نمایش قرعه حذفی", exact: true })
    .click();
  await expect(
    page.getByText("پیش‌نمایش قرعه آماده است", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(6);
});
