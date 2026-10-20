import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  uid,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, previewAdvancement, simulate } from "../../src/engine";

function fixture(count = 7) {
  return createTournament(
    "Losers bracket cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: index >= count - 2 ? "North" : `Region ${index + 1}`,
      organization: `Club ${index + 1}`,
    })),
    "double-elimination",
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
          name: "losers.json",
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
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Preview knockout draw", exact: true })
    .click();
}
async function ready(page: Page) {
  await expect(
    page.getByText("Draw preview is ready", { exact: true }),
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
async function losersRound(page: Page, value: string, field = "regions") {
  await page
    .getByRole("combobox", {
      name: `Separate ${field} through losers round`,
      exact: true,
    })
    .selectOption(value);
}

test("protects losers paths independently and transfers v3 rules with the generated bracket", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  await page
    .getByLabel("Separate the same organization", { exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "Separate organizations through round",
      exact: true,
    })
    .selectOption("2");
  await losersRound(page, "2");
  await losersRound(page, "4", "organizations");
  await page.getByLabel("Protected seed positions", { exact: true }).fill("1");
  await expect(
    page.getByLabel("Separate the same region", { exact: true }),
  ).not.toBeChecked();
  await preview(page);
  await ready(page);
  await expect(
    page.locator('[data-losers-separation-field="region"]'),
  ).toHaveAttribute("data-through-round", "2");
  await expect(
    page.locator('[data-losers-separation-field="organization"]'),
  ).toHaveAttribute("data-through-round", "4");
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
  await page.locator(".draw-losers-preview h4").click();
  await page.locator(".draw-losers-preview").screenshot({
    path: testInfo.outputPath("losers-preview.png"),
  });
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  const opening = drawn.matches
    .filter((match) => match.round === 1 && match.bracket === "winners")
    .sort((a, b) => a.index - b.index);
  expect(
    opening.flatMap((match) =>
      match.slots.map((slot) => slot.participantId ?? null),
    ),
  ).toEqual(slots);
  expect(
    opening.find((match) => match.status === "bye")!.result!.winnerIds,
  ).toEqual([drawn.participants[0].id]);
  expect(drawn.stages[0].config.knockoutDraw).toMatchObject({
    version: 3,
    restrictions: ["organization"],
    separation: [{ field: "organization", throughRound: 2 }],
    losersSeparation: [
      { field: "region", throughRound: 2 },
      { field: "organization", throughRound: 4 },
    ],
  });
  await expect(
    page.getByRole("combobox", {
      name: "Separate regions through losers round",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await saved(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    drawn.stages[0].config.knockoutDraw,
  );
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("losers.tourney");
  await (await download).saveAs(archive);
  await page
    .getByRole("button", { name: "Generate link & code", exact: true })
    .click();
  const linkField = page.getByLabel("Snapshot link", { exact: true });
  await expect(linkField).toHaveValue(/#\/open\/TS1/);
  const link = await linkField.inputValue();
  for (const transport of ["file", "link"]) {
    const context = await browser.newContext();
    try {
      const recipient = await context.newPage();
      if (transport === "file") await importFixture(recipient, archive);
      else {
        await recipient.goto(link);
        const dialog = recipient.getByRole("dialog", {
          name: "Bring a tournament into your studio",
        });
        await dialog
          .getByRole("button", { name: "Save local copy", exact: true })
          .click();
        await saved(recipient);
      }
      const imported = await readDocument(recipient);
      expect(imported.stages[0].config.knockoutDraw).toEqual(
        drawn.stages[0].config.knockoutDraw,
      );
      expect(imported.matches).toEqual(drawn.matches);
    } finally {
      await context.close();
    }
  }
  expect((await readDocument(page)).matches).toEqual(drawn.matches);
});

test("preserves winners settings and safely downgrades after disabling losers rules", async ({
  page,
}) => {
  const tournament = fixture(8);
  tournament.participants.forEach((participant) => {
    participant.region = participant.name;
  });
  const original = {
    version: 2 as const,
    pots: [],
    restrictions: ["region" as const],
    protectedSeeds: 0,
    separation: [{ field: "region" as const, throughRound: 2 }],
  };
  tournament.stages[0].config.knockoutDraw = original;
  await importFixture(page, tournament);
  await losersRound(page, "1");
  await losersRound(page, "0");
  await preview(page);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    original,
  );
  await losersRound(page, "3");
  await preview(page);
  await ready(page);
  await apply(page);
  await expect(
    page.locator('.structure-settings option[value="single-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await page.getByLabel("Separate the same region", { exact: true }).uncheck();
  await preview(page);
  await ready(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw,
  ).toMatchObject({
    version: 3,
    restrictions: [],
    separation: [],
    losersSeparation: [{ field: "region", throughRound: 3 }],
  });
  await losersRound(page, "0");
  await preview(page);
  await ready(page);
  await apply(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual({
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
  });
  await page
    .locator(".structure-settings")
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("single-elimination");
  await saved(page);
  await expect(page.locator(".draw-losers-restrictions")).toHaveCount(0);
  await generate(page);
  expect(
    (await readDocument(page)).matches.some(
      (match) => match.bracket === "losers",
    ),
  ).toBe(false);
});

test("rejects fixed qualifier losers conflicts without changing saved rules or slots", async ({
  page,
}) => {
  let tournament = fixture(8);
  const source = tournament.stages[0];
  source.format = "round-robin";
  tournament = simulate(generateStage(tournament, source.id));
  const targetId = uid();
  tournament.stages.push({
    id: targetId,
    name: "Final stage",
    format: "double-elimination",
    formatVersion: 1,
    order: 1,
    config: {
      ...DEFAULT_CONFIG,
      knockoutDraw: {
        version: 1,
        pots: [],
        restrictions: ["region"],
        protectedSeeds: 0,
      },
    },
    participantIds: [],
    sources: [
      {
        stageId: source.id,
        count: 8,
        perGroup: false,
        bracketSlots: [1, 2, 3, 4, 5, 6, 7, 8],
      },
    ],
    status: "draft",
    metadata: {},
  });
  const ids = previewAdvancement(tournament, targetId).participantIds;
  tournament.participants.forEach((participant) => {
    participant.region = [ids[0], ids[2]].includes(participant.id)
      ? "North"
      : participant.name;
  });
  tournament.status = "in-progress";
  await importFixture(page, tournament);
  await page
    .getByRole("combobox", { name: /^Selected stage/ })
    .selectOption(targetId);
  const before = (await readDocument(page)).stages[1];
  await preview(page);
  await ready(page);
  await losersRound(page, "1");
  await preview(page);
  await expect(
    page.getByText("Draw needs attention", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert").first()).toContainText(/losers/i);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).stages[1]).toEqual(before);
  await losersRound(page, "0");
  await preview(page);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await generate(page);
  expect(
    (await readDocument(page)).matches
      .filter(
        (match) =>
          match.stageId === targetId &&
          match.round === 1 &&
          match.bracket === "winners",
      )
      .flatMap((match) => match.slots.map((slot) => slot.participantId)),
  ).toEqual(ids);
});

test("keeps invalid saved losers rounds visible after bracket size changes", async ({
  page,
}) => {
  const tournament = fixture(9);
  tournament.participants.forEach((participant) => {
    participant.region = participant.name;
  });
  tournament.stages[0].config.knockoutDraw = {
    version: 3,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [{ field: "region", throughRound: 6 }],
  };
  await importFixture(page, tournament);
  await preview(page);
  await ready(page);
  await section(page, "Participants");
  await page
    .getByRole("row")
    .filter({ hasText: "Team 9" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit participant",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("withdrawn");
  await dialog
    .getByRole("button", { name: "Save participant", exact: true })
    .click();
  await saved(page);
  await section(page, "Structure");
  await expect(
    page.getByRole("combobox", {
      name: "Separate regions through losers round",
      exact: true,
    }),
  ).toHaveValue("6");
  await expect(
    page.locator('option[value="6"]').filter({
      hasText: "outside this bracket",
    }),
  ).toHaveCount(1);
  await preview(page);
  await expect(
    page.getByText("Draw needs attention", { exact: true }),
  ).toBeVisible();
  await losersRound(page, "4");
  await preview(page);
  await ready(page);
  await apply(page);
  await generate(page);
  expect(
    Math.max(
      ...(await readDocument(page)).matches
        .filter((match) => match.bracket === "losers")
        .map((match) => match.round),
    ),
  ).toBe(4);
});

test("fits Persian losers controls and verified rules at 320 pixels", async ({
  page,
}, testInfo) => {
  const tournament = fixture(7);
  tournament.participants.forEach((participant, index) => {
    participant.name = `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان بزرگ ${index + 1}`;
    participant.region =
      index >= 5 ? "منطقه فرهنگی ورزشی شمال" : `منطقه شماره ${index + 1}`;
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
    .getByRole("combobox", {
      name: "جداسازی منطقه‌ها تا پایان دور بازندگان",
      exact: true,
    })
    .selectOption("2");
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
      ".knockout-draw-editor .button, .knockout-draw-editor .field > span, .draw-losers-preview li, .draw-losers-preview h4, .draw-preview-pair li",
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
  await page.locator(".knockout-draw-editor h3").click();
  await page.locator(".knockout-draw-editor").screenshot({
    path: testInfo.outputPath("losers-persian.png"),
  });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(3);
});
