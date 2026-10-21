import { expect, test, type Page, type Locator } from "@playwright/test";
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
    "Venue distance cup",
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
async function importFixture(page: Page, file: Tournament | string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles(
    typeof file === "string"
      ? file
      : {
          name: "distance.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(file)),
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

async function configure(page: Page) {
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
}
async function addRule(page: Page, resourceId = "west") {
  await page
    .getByRole("button", { name: "Add venue restriction", exact: true })
    .click();
  const rule = page.locator(".draw-venue-rule").last();
  await rule
    .getByRole("combobox", { name: "Assigned venue", exact: true })
    .selectOption(resourceId);
  return rule;
}
async function target(rule: Locator, round: string, match: string) {
  const clear = rule.getByRole("button", {
    name: "Clear round selection",
    exact: true,
  });
  if (await clear.isEnabled()) await clear.click();
  await rule
    .getByRole("combobox", { name: "Bracket round", exact: true })
    .selectOption({ label: round });
  await rule.getByLabel(match, { exact: true }).check();
}
async function preview(page: Page, valid = true) {
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
  await expect(
    page.getByText(valid ? "Draw preview is ready" : "Draw needs attention", {
      exact: true,
    }),
  ).toBeVisible();
}
async function apply(page: Page) {
  await page
    .getByRole("button", { name: "Apply draw rules", exact: true })
    .click();
  await saved(page);
}
async function generate(page: Page) {
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
}
async function recordReady(page: Page) {
  await section(page, "Matches");
  await page
    .getByRole("button", { name: "Ready to play", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", { name: "Match control" });
  const inputs = dialog.locator('.score-entry input[type="number"]');
  await inputs.nth(0).fill("3");
  await inputs.nth(1).fill("1");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

test("assigns regional venues through later knockout rounds and transfers public and private copies", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await configure(page);
  const west = await addRule(page);
  await target(west, "Winners round 2", "Winners round 2, match 1");
  await west
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("1000");
  const east = await addRule(page, "east");
  await target(east, "Winners round 2", "Winners round 2, match 2");
  await east
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("1000");
  await preview(page);
  await expect(page.locator(".draw-venue-preview")).toContainText("West hall");
  await expect(page.locator(".draw-venue-preview")).toContainText("East hall");
  const a11y = await new AxeBuilder({ page })
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await page
    .locator(".draw-venue-preview")
    .screenshot({ path: testInfo.outputPath("venue-preview.png") });
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  expect(drawn.stages[0].config.knockoutDraw?.version).toBe(6);
  for (const match of drawn.matches.filter((match) => match.round === 1)) {
    expect(
      match.slots.map(
        (slot) =>
          drawn.participants.find(
            (participant) => participant.id === slot.participantId,
          )?.location?.longitude,
      ),
    ).toEqual(match.index < 2 ? [0, 0] : [20, 20]);
  }
  expect(
    drawn.matches
      .filter((match) => match.round === 2)
      .map((match) => match.resourceId),
  ).toEqual(["west", "east"]);
  await section(page, "Schedule");
  const fixed = drawn.matches.find((match) => match.round === 2)!;
  await expect(
    page.getByRole("combobox", {
      name: `Resource ${fixed.label}`,
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).matches
      .filter((match) => match.round === 2)
      .map((match) => match.resourceId),
  ).toEqual(["west", "east"]);
  const westResource = page.locator(".resource-edit").filter({
    has: page
      .getByRole("textbox", { name: "Resource name", exact: true })
      .and(page.locator('input[value="West hall"]')),
  });
  await expect(
    westResource.getByRole("button", { name: "Remove resource", exact: true }),
  ).toBeDisabled();
  await recordReady(page);
  await page.reload();
  await saved(page);
  const savedDoc = await readDocument(page);
  expect(savedDoc.matches.filter((match) => match.result)).toHaveLength(1);
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("venues.tourney");
  await (await download).saveAs(archive);
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  const link = page.getByLabel("Snapshot link", { exact: true });
  await expect(link).toHaveValue(/#\/open\/TS1/);
  for (const transport of ["file", "link"]) {
    const context = await browser.newContext();
    try {
      const recipient = await context.newPage();
      if (transport === "file") await importFixture(recipient, archive);
      else {
        await recipient.goto(await link.inputValue());
        await recipient
          .getByRole("dialog", { name: "Bring a tournament into your studio" })
          .getByRole("button", { name: "Save local copy", exact: true })
          .click();
        await saved(recipient);
      }
      const imported = await readDocument(recipient);
      const expectedMatches = structuredClone(savedDoc.matches);
      if (transport === "link")
        expectedMatches.forEach((match) => {
          delete match.notes;
          delete match.referee;
        });
      expect(imported.matches).toEqual(expectedMatches);
      expect(imported.stages[0].config.knockoutDraw).toEqual(
        savedDoc.stages[0].config.knockoutDraw,
      );
      expect(
        imported.schedule.resources.map((resource) => resource.location),
      ).toEqual(
        transport === "file"
          ? savedDoc.schedule.resources.map((resource) => resource.location)
          : savedDoc.schedule.resources.map(() => undefined),
      );
      expect(
        imported.participants.map((participant) => participant.location),
      ).toEqual(
        transport === "file"
          ? savedDoc.participants.map((participant) => participant.location)
          : savedDoc.participants.map(() => undefined),
      );
      await recordReady(recipient);
      expect(
        (await readDocument(recipient)).matches.filter((match) => match.result),
      ).toHaveLength(2);
    } finally {
      await context.close();
    }
  }
  expect((await readDocument(page)).matches).toEqual(savedDoc.matches);
});

test("edits venue coordinates explicitly and prevents partial or invalid saves", async ({
  page,
}) => {
  const doc = fixture(4);
  delete doc.schedule.resources[0].location;
  await importFixture(page, doc);
  await configure(page);
  await addRule(page);
  await preview(page, false);
  await expect(page.getByRole("alert")).toContainText(
    "Enter valid latitude and longitude for venue West hall",
  );
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await section(page, "Schedule");
  const resource = page.locator(".resource-edit").first();
  await resource
    .getByRole("button", { name: "Add venue location", exact: true })
    .click();
  await resource.getByLabel("Venue latitude", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Save schedule settings", exact: true })
    .click();
  expect(
    (await readDocument(page)).schedule.resources[0].location,
  ).toBeUndefined();
  await resource.getByLabel("Venue longitude", { exact: true }).fill("181");
  await page
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  expect(
    (await readDocument(page)).schedule.resources[0].location,
  ).toBeUndefined();
  await resource
    .getByLabel("Venue longitude", { exact: true })
    .fill("-179.999123456");
  await page
    .getByRole("button", { name: "Save schedule settings", exact: true })
    .click();
  await saved(page);
  expect((await readDocument(page)).schedule.resources[0].location).toEqual({
    latitude: 0,
    longitude: -179.999123456,
  });
  await page.reload();
  await saved(page);
  await section(page, "Schedule");
  await expect(
    resource.getByLabel("Venue longitude", { exact: true }),
  ).toHaveValue("-179.999123456");
  await resource
    .getByRole("button", { name: "Remove venue location", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save schedule settings", exact: true })
    .click();
  await saved(page);
  expect(
    (await readDocument(page)).schedule.resources[0].location,
  ).toBeUndefined();
});

test("keeps protected seeds and BYEs while rejecting impossible venue paths", async ({
  page,
}) => {
  const doc = fixture(4);
  await importFixture(page, doc);
  await configure(page);
  const rule = await addRule(page, "east");
  await rule
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("0");
  await page.getByLabel("Protected seed positions", { exact: true }).fill("1");
  await preview(page, false);
  await expect(page.getByRole("alert")).toContainText(
    "fixed position for Team 1",
  );
  await page.getByLabel("Protected seed positions", { exact: true }).fill("0");
  await preview(page);
  await target(rule, "Winners round 2", "Winners round 2, match 1");
  await preview(page, false);
  await expect(page.getByRole("alert").first()).toContainText(
    "No opening position keeps",
  );
  const byeDoc = fixture(3);
  byeDoc.participants[1].location = { latitude: 0, longitude: 20 };
  byeDoc.stages[0].config.thirdPlace = true;
  await importFixture(page, byeDoc);
  await configure(page);
  const byeRule = await addRule(page);
  await byeRule
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("0");
  await preview(page);
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  const bye = drawn.matches.find(
    (match) =>
      match.bracket === "winners" && match.round === 1 && match.index === 0,
  )!;
  expect(bye.status).toBe("bye");
  expect(bye.resourceId).toBe("west");
  expect(
    bye.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    ),
  ).toEqual([byeDoc.participants[0].id]);
  const placementDoc = fixture(3);
  placementDoc.participants[1].location = { latitude: 0, longitude: 20 };
  placementDoc.stages[0].config.thirdPlace = true;
  await importFixture(page, placementDoc);
  await configure(page);
  const placementRule = await addRule(page, "east");
  await target(placementRule, "Third-place match", "Third-place match");
  await placementRule
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("0");
  await preview(page);
  await apply(page);
  await expect(
    page.getByLabel("Third-place match", { exact: true }).first(),
  ).toBeDisabled();
  await generate(page);
  expect(
    (await readDocument(page)).matches.find(
      (match) => match.bracket === "placement",
    )?.resourceId,
  ).toBe("east");
});

test("preserves older protections through venue scopes and safe version downgrades", async ({
  page,
}) => {
  const doc = fixture(4, "double-elimination");
  doc.stages[0].config.knockoutDraw = {
    version: 4,
    pots: [],
    restrictions: ["region"],
    protectedSeeds: 1,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [{ field: "region", targets: ["grand-final"] }],
  };
  await importFixture(page, doc);
  const venue = await addRule(page, "central");
  const select = venue.getByRole("combobox", {
    name: "Bracket round",
    exact: true,
  });
  for (const option of await select
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    )) {
    await select.selectOption(option);
    const all = venue.getByRole("button", {
      name: "Select available matches in round",
      exact: true,
    });
    if (await all.isEnabled()) await all.click();
  }
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("0");
  await page
    .getByLabel("Separate organizations in grand final", { exact: true })
    .check();
  await preview(page);
  await apply(page);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.structure-settings option[value="single-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  const configured = (await readDocument(page)).stages[0].config.knockoutDraw;
  expect(configured).toMatchObject({
    version: 6,
    distance: { minKm: 0 },
    restrictions: ["region"],
  });
  expect(
    configured?.version === 6
      ? configured.venueRules[0].targets.map((item) => item.bracket)
      : [],
  ).toEqual(expect.arrayContaining(["winners", "losers", "final", "reset"]));
  await page
    .getByRole("button", { name: "Remove venue rule", exact: true })
    .click();
  await preview(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw?.version,
  ).toBe(5);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove distance restriction", exact: true })
    .click();
  await preview(page);
  await apply(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual({
    ...doc.stages[0].config.knockoutDraw,
    finalsSeparation: [
      { field: "region", targets: ["grand-final"] },
      { field: "organization", targets: ["grand-final"] },
    ],
  });
});

test("validates venue ranges and prevents duplicate match assignments", async ({
  page,
}) => {
  await importFixture(page, fixture(4));
  await configure(page);
  const first = await addRule(page);
  await first
    .getByLabel("Minimum venue distance (km)", { exact: true })
    .fill("0");
  await first
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("0");
  await preview(page);
  await first
    .getByLabel("Minimum venue distance (km)", { exact: true })
    .fill("1");
  await expect(first.getByRole("alert")).toContainText(
    "Minimum venue distance cannot exceed maximum venue distance",
  );
  await preview(page, false);
  await first
    .getByLabel("Minimum venue distance (km)", { exact: true })
    .fill("");
  await first
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("");
  await expect(first.getByRole("alert")).toContainText(
    "Enter a minimum or maximum venue distance",
  );
  await preview(page, false);
  await first
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("20017");
  await expect(first.getByRole("alert")).toContainText(
    "Venue distance limits must be from 0 to 20016 km",
  );
  await first
    .getByLabel("Maximum venue distance (km)", { exact: true })
    .fill("20016");
  const second = await addRule(page, "east");
  await expect(
    second.getByRole("checkbox", { name: /Winners round 1, match 1/ }),
  ).toBeDisabled();
  await second
    .getByRole("button", { name: "Clear round selection", exact: true })
    .click();
  await expect(second.getByRole("alert")).toContainText(
    "Select at least one match",
  );
  await preview(page, false);
  await second
    .getByRole("button", { name: "Remove venue rule", exact: true })
    .click();
  await preview(page);
  await apply(page);
  await page
    .getByRole("button", { name: "Remove venue rule", exact: true })
    .click();
  await preview(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw?.version,
  ).toBe(1);
});

test("invalidates a venue preview after a confirmed change in another local tab", async ({
  page,
  context,
}) => {
  await importFixture(page, fixture(4));
  await configure(page);
  await addRule(page);
  await preview(page);
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
      page.getByRole("button", { name: "Apply draw rules", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Draw preview is ready", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Preview knockout draw", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Discard draw edits", exact: true })
      .click();
    await configure(page);
    await addRule(page);
    await preview(page);
    await operator.getByLabel("Match minutes", { exact: true }).fill("31");
    await apply(page);
    expect(
      (await readDocument(page)).schedule.resources[0].location?.longitude,
    ).toBe(1);
    await expect(
      operator.getByRole("button", {
        name: "Save schedule settings",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      operator.getByRole("button", { name: "Generate schedule", exact: true }),
    ).toBeDisabled();
    await operator
      .getByRole("button", { name: "Reload schedule settings", exact: true })
      .click();
    await expect(
      operator.getByLabel("Match minutes", { exact: true }),
    ).not.toHaveValue("31");
    await expect(
      operator.getByRole("button", {
        name: "Save schedule settings",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await operator.close();
  }
});

test("fits Persian venue rules and location entry at 320 pixels", async ({
  page,
}, testInfo) => {
  const doc = fixture(7, "double-elimination");
  doc.schedule.resources[0].name =
    "سالن مسابقات قهرمانی شهرستان بزرگ گل یا پوچ West hall";
  await importFixture(page, doc);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .getByRole("button", { name: "تنظیم قرعه حذفی", exact: true })
    .click();
  await page
    .getByRole("button", { name: "افزودن محدودیت محل بازی", exact: true })
    .click();
  const rule = page.locator(".draw-venue-rule");
  await rule
    .getByRole("combobox", { name: "دور جدول", exact: true })
    .selectOption({ label: "فینال تکراری" });
  await rule.getByLabel("فینال تکراری", { exact: true }).check();
  await page
    .getByRole("button", { name: "پیش‌نمایش قرعه حذفی", exact: true })
    .click();
  await expect(
    page.getByText("پیش‌نمایش قرعه آماده است", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const clipped = await page
    .locator(
      ".draw-venue-restrictions > p, .draw-venue-rule .field > span, .draw-venue-targets span, .draw-venue-selection li > span, .draw-venue-rule .text-button, .draw-venue-preview li > span",
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
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.locator(".draw-venue-restrictions h4").click();
  await page
    .locator(".draw-venue-restrictions")
    .screenshot({ path: testInfo.outputPath("venue-persian.png") });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(6);
  await page
    .getByRole("navigation")
    .filter({ has: page.getByRole("button", { name: "برنامه", exact: true }) })
    .getByRole("button", { name: "برنامه", exact: true })
    .click();
  const resource = page.locator(".resource-edit").first();
  await expect(
    resource.getByLabel("عرض جغرافیایی محل بازی", { exact: true }),
  ).toHaveValue("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const scheduleA11y = await new AxeBuilder({ page })
    .include(".schedule-layout form")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scheduleA11y.violations).toEqual([]);
  await resource
    .locator(".resource-location")
    .screenshot({ path: testInfo.outputPath("venue-location-persian.png") });
});
