import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";

function fixture(
  count = 7,
  format: "single-elimination" | "double-elimination" = "double-elimination",
) {
  return createTournament(
    "Distance draw cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${index + 1}`,
      organization: `Club ${index + 1}`,
      location: { latitude: 0, longitude: index * 10 },
    })),
    format,
  );
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
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
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

test("draws with distance across every double-elimination path and transfers public and private copies", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await configure(page);
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("20016");
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("2");
  await page
    .getByRole("combobox", {
      name: "Apply distance through losers round",
      exact: true,
    })
    .selectOption("4");
  await page
    .getByLabel("Apply distance range to grand final", { exact: true })
    .check();
  await page
    .getByLabel("Apply distance range to reset final", { exact: true })
    .check();
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await page
    .getByRole("combobox", {
      name: "Separate regions through round",
      exact: true,
    })
    .selectOption("2");
  await page
    .getByRole("combobox", {
      name: "Separate organizations through losers round",
      exact: true,
    })
    .selectOption("2");
  await page
    .getByLabel("Separate organizations in grand final", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await preview(page);
  await expect(page.locator("[data-distance-target]")).toHaveCount(4);
  await expect(page.locator(".draw-pair-distance")).toHaveCount(3);
  const slots = await page
    .locator(".draw-preview-pair li")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-participant-id") || null),
    );
  const accessibility = await new AxeBuilder({ page })
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.locator(".draw-distance-preview h4").click();
  await page
    .locator(".draw-distance-preview")
    .screenshot({ path: testInfo.outputPath("distance-preview.png") });
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  expect(drawn.stages[0].config.knockoutDraw).toMatchObject({
    version: 5,
    separation: [{ field: "region", throughRound: 2 }],
    losersSeparation: [{ field: "organization", throughRound: 2 }],
    finalsSeparation: [{ field: "organization", targets: ["grand-final"] }],
    distance: {
      minKm: 100,
      maxKm: 20016,
      winnersThroughRound: 2,
      losersThroughRound: 4,
      finals: ["grand-final", "reset"],
    },
  });
  expect(
    drawn.matches
      .filter((match) => match.bracket === "winners" && match.round === 1)
      .sort((a, b) => a.index - b.index)
      .flatMap((match) =>
        match.slots.map((slot) => slot.participantId ?? null),
      ),
  ).toEqual(slots);
  await expect(
    page.getByLabel("Minimum opponent distance (km)", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await saved(page);
  expect(
    (await readDocument(page)).participants.map(
      (participant) => participant.location,
    ),
  ).toEqual(drawn.participants.map((participant) => participant.location));
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("distance.tourney");
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
      expect(imported.stages[0].config.knockoutDraw).toEqual(
        drawn.stages[0].config.knockoutDraw,
      );
      expect(imported.matches).toEqual(drawn.matches);
      expect(
        imported.participants.map((participant) => participant.location),
      ).toEqual(
        transport === "file"
          ? drawn.participants.map((participant) => participant.location)
          : drawn.participants.map(() => undefined),
      );
    } finally {
      await context.close();
    }
  }
  expect((await readDocument(page)).matches).toEqual(drawn.matches);
});

test("edits base coordinates explicitly and prevents partial or invalid locations", async ({
  page,
}) => {
  const tournament = fixture(4, "single-elimination");
  delete tournament.participants[0].location;
  tournament.stages[0].config.knockoutDraw = {
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
  };
  await importFixture(page, tournament);
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await preview(page, false);
  await expect(page.getByRole("alert")).toContainText(
    "Enter valid latitude and longitude for Team 1",
  );
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await section(page, "Participants");
  async function edit() {
    await page
      .getByRole("row")
      .filter({ hasText: "Team 1" })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Edit participant" });
  }
  let dialog = await edit();
  await dialog
    .getByRole("button", { name: "Add base location", exact: true })
    .click();
  await dialog.getByLabel("Latitude", { exact: true }).fill("0");
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect((await readDocument(page)).participants[0].location).toBeUndefined();
  await dialog.getByLabel("Longitude", { exact: true }).fill("-179.999123456");
  await dialog.getByLabel("Latitude", { exact: true }).fill("91");
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Latitude", { exact: true }).fill("0");
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await saved(page);
  const location = { latitude: 0, longitude: -179.999123456 };
  expect((await readDocument(page)).participants[0].location).toEqual(location);
  await page.reload();
  await saved(page);
  expect((await readDocument(page)).participants[0].location).toEqual(location);
  await section(page, "Structure");
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await preview(page);
  await apply(page);
  await section(page, "Participants");
  dialog = await edit();
  await dialog
    .getByRole("button", { name: "Remove base location", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  expect((await readDocument(page)).participants[0].location).toEqual(location);
  dialog = await edit();
  await dialog
    .getByRole("button", { name: "Remove base location", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await saved(page);
  await section(page, "Structure");
  await preview(page, false);
  await expect(page.getByRole("alert")).toContainText(
    "Enter valid latitude and longitude for Team 1",
  );
  expect((await readDocument(page)).participants[0].location).toBeUndefined();
});

test("explains impossible final distances and keeps zero distinct from missing bounds", async ({
  page,
}) => {
  const tournament = fixture(4);
  tournament.participants.forEach((participant, index) => {
    participant.location = { latitude: 0, longitude: index < 2 ? -30 : 30 };
  });
  await importFixture(page, tournament);
  await configure(page);
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("5000");
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("8000");
  await preview(page);
  await apply(page);
  const original = (await readDocument(page)).stages[0].config.knockoutDraw;
  for (const target of ["grand final", "reset final"]) {
    await page
      .getByLabel(`Apply distance range to ${target}`, { exact: true })
      .check();
    await preview(page, false);
    await expect(page.getByRole("alert")).toContainText(
      "seeding cannot prevent this meeting",
    );
    await expect(
      page.getByRole("button", { name: "Apply draw rules", exact: true }),
    ).toBeDisabled();
    expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
      original,
    );
    await page
      .getByLabel(`Apply distance range to ${target}`, { exact: true })
      .uncheck();
  }
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("0");
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("0");
  await preview(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toMatchObject({ distance: { minKm: 0, maxKm: 0 } });
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("1");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Minimum distance cannot exceed maximum distance." }),
  ).toBeVisible();
  await preview(page, false);
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("");
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Enter a minimum or maximum distance." }),
  ).toBeVisible();
  await preview(page, false);
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("20017");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Distance limits must be from 0 to 20016 km." }),
  ).toBeVisible();
  await preview(page, false);
  await page
    .getByLabel("Maximum opponent distance (km)", { exact: true })
    .fill("20016");
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("0");
  await expect(
    page.getByRole("alert").filter({
      hasText: "Select a round range or final for the distance rule.",
    }),
  ).toBeVisible();
  await preview(page, false);
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("1");
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("0.000000001");
  await preview(page);
  await expect(page.locator(".draw-distance-preview")).toContainText(
    "Minimum: 1E-9 km",
  );
});

test("preserves affiliation rules and guards distance targets while downgrading safely", async ({
  page,
}) => {
  const tournament = fixture(8);
  const original = {
    version: 4 as const,
    pots: [],
    restrictions: ["region" as const],
    protectedSeeds: 1,
    separation: [{ field: "region" as const, throughRound: 2 }],
    losersSeparation: [{ field: "organization" as const, throughRound: 2 }],
    finalsSeparation: [
      { field: "region" as const, targets: ["grand-final" as const] },
    ],
  };
  tournament.stages[0].config.knockoutDraw = original;
  await importFixture(page, tournament);
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove distance restriction", exact: true })
    .click();
  await preview(page);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("0");
  await page
    .getByLabel("Apply distance range to reset final", { exact: true })
    .check();
  await preview(page);
  await apply(page);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Separate organizations in grand final", { exact: true })
    .check();
  await preview(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toMatchObject({
    version: 5,
    distance: { winnersThroughRound: 0, finals: ["reset"] },
  });
  await page
    .getByRole("button", { name: "Remove distance restriction", exact: true })
    .click();
  await preview(page);
  await apply(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual({
    ...original,
    finalsSeparation: [
      ...original.finalsSeparation,
      { field: "organization", targets: ["grand-final"] },
    ],
  });
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Double elimination final reset", { exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Add distance restriction", exact: true })
    .click();
  await expect(
    page.getByLabel("Apply distance range to reset final", { exact: true }),
  ).toBeDisabled();
});

test("checks third-place distance separately from winners pairings and handles BYEs", async ({
  page,
}) => {
  const tournament = fixture(4, "single-elimination");
  tournament.stages[0].config.thirdPlace = true;
  tournament.participants.forEach((participant, index) => {
    participant.location = { latitude: 0, longitude: index < 2 ? -30 : 30 };
  });
  await importFixture(page, tournament);
  await configure(page);
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("0");
  await page
    .getByLabel("Apply distance range to third-place match", { exact: true })
    .check();
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("5000");
  await preview(page);
  await apply(page);
  await expect(
    page.getByLabel("Third-place match", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.structure-settings option[value="double-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("1");
  await preview(page, false);
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await generate(page);
  const drawn = await readDocument(page);
  for (const match of drawn.matches.filter(
    (match) => match.bracket === "winners" && match.round === 1,
  )) {
    const locations = match.slots.map(
      (slot) =>
        drawn.participants.find(
          (participant) => participant.id === slot.participantId,
        )?.location,
    );
    expect(locations[0]).toEqual(locations[1]);
  }
  const byeTournament = fixture(3, "single-elimination");
  byeTournament.stages[0].config.thirdPlace = true;
  byeTournament.participants.forEach((participant) => {
    participant.location = { latitude: 0, longitude: 0 };
  });
  await importFixture(page, byeTournament);
  await configure(page);
  await page
    .getByRole("combobox", {
      name: "Apply distance through winners round",
      exact: true,
    })
    .selectOption("0");
  await page
    .getByLabel("Apply distance range to third-place match", { exact: true })
    .check();
  await page
    .getByLabel("Minimum opponent distance (km)", { exact: true })
    .fill("20000");
  await preview(page);
  await apply(page);
  await generate(page);
  const withBye = await readDocument(page);
  expect(
    withBye.matches.filter((match) => match.bracket === "placement"),
  ).toHaveLength(1);
});

test("fits Persian distance controls and coordinate entry at 320 pixels", async ({
  page,
}, testInfo) => {
  const tournament = fixture(7);
  tournament.participants.forEach((participant, index) => {
    participant.name = `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان بزرگ Team ${index + 1}`;
  });
  await importFixture(page, tournament);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 760 });
  await page
    .getByRole("button", { name: "تنظیم قرعه حذفی", exact: true })
    .click();
  await page
    .getByRole("button", { name: "افزودن محدودیت فاصله", exact: true })
    .click();
  await page
    .getByLabel("حداکثر فاصله حریفان (کیلومتر)", { exact: true })
    .fill("20016");
  await page
    .getByRole("combobox", {
      name: "اعمال فاصله تا پایان دور برندگان",
      exact: true,
    })
    .selectOption("2");
  await page
    .getByRole("combobox", {
      name: "اعمال فاصله تا پایان دور بازندگان",
      exact: true,
    })
    .selectOption("4");
  await page
    .getByLabel("اعمال بازه فاصله در فینال بزرگ", { exact: true })
    .check();
  await page
    .getByLabel("اعمال بازه فاصله در فینال تکراری", { exact: true })
    .check();
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
      ".draw-distance-restrictions .field > span, .draw-distance-targets span, .draw-distance-preview li, .draw-pair-distance, .draw-distance-restrictions .button",
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
  const accessibility = await new AxeBuilder({ page })
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.locator(".draw-distance-restrictions h4").click();
  await page
    .locator(".draw-distance-restrictions")
    .screenshot({ path: testInfo.outputPath("distance-persian.png") });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(5);
  await page
    .getByRole("navigation")
    .filter({
      has: page.getByRole("button", { name: "شرکت‌کنندگان", exact: true }),
    })
    .getByRole("button", { name: "شرکت‌کنندگان", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Team 1" })
    .getByRole("button", { name: "ویرایش", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "ویرایش شرکت‌کننده" });
  await expect(modal.getByLabel("عرض جغرافیایی", { exact: true })).toHaveValue(
    "0",
  );
  expect(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  const modalA11y = await new AxeBuilder({ page })
    .include(".modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(modalA11y.violations).toEqual([]);
});
