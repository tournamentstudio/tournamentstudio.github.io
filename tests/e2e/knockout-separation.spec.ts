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

function fixture(count = 16) {
  return createTournament(
    "Separated knockout cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${(index % 4) + 1}`,
      organization: `Club ${Math.floor(index / 2) + 1}`,
    })),
    "single-elimination",
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
          name: "separation.json",
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
async function round(page: Page, value: string, field = "regions") {
  await page
    .getByRole("combobox", {
      name: `Separate ${field} through round`,
      exact: true,
    })
    .selectOption(value);
}

test("protects later rounds, previews their sections, and transfers the saved rules", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await round(page, "2");
  await page
    .getByLabel("Separate the same organization", { exact: true })
    .check();
  await round(page, "3", "organizations");
  await preview(page);
  await ready(page);
  const regions = page.locator('[data-separation-field="region"]');
  const organizations = page.locator('[data-separation-field="organization"]');
  await expect(regions.locator(".draw-separation-block")).toHaveCount(4);
  await expect(organizations.locator(".draw-separation-block")).toHaveCount(2);
  const slots = await page
    .locator(".draw-preview-pair li")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-participant-id")),
    );
  const before = await readDocument(page);
  expect(before.stages[0].config.knockoutDraw).toBeUndefined();
  for (const [field, size] of [
    ["region", 4],
    ["organization", 8],
  ] as const) {
    for (let index = 0; index < slots.length; index += size) {
      const labels = slots
        .slice(index, index + size)
        .map(
          (id) =>
            before.participants.find((participant) => participant.id === id)![
              field
            ],
        );
      expect(new Set(labels).size).toBe(size);
    }
  }
  const accessibility = await new AxeBuilder({ page })
    .include(".knockout-draw-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.locator(".knockout-draw-editor h3").click();
  await page.locator(".draw-separation-preview").screenshot({
    path: testInfo.outputPath("separation-preview.png"),
  });
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  expect(drawn.stages[0].config.knockoutDraw?.version).toBe(2);
  expect(
    drawn.matches
      .filter((match) => match.round === 1 && match.bracket === "winners")
      .sort((a, b) => a.index - b.index)
      .flatMap((match) => match.slots.map((slot) => slot.participantId)),
  ).toEqual(slots);
  await expect(
    page.getByRole("combobox", {
      name: "Separate regions through round",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await section(page, "Structure");
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    drawn.stages[0].config.knockoutDraw,
  );
  await section(page, "Share Center");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private backup", exact: true })
    .click();
  const archive = testInfo.outputPath("separation.tourney");
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
        await expect(
          dialog.getByText("This is a read-only preview.", { exact: false }),
        ).toBeVisible();
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
});

test("keeps fixed qualifiers in place and preserves v1 until a valid change is applied", async ({
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
  await round(page, "2");
  await preview(page);
  await expect(page.getByRole("alert").first()).toContainText(
    "Fixed positions",
  );
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).stages[1]).toEqual(before);
  await round(page, "1");
  await preview(page);
  await ready(page);
  await expect(page.locator(".draw-separation-rule")).toHaveCount(0);
  await expect(page.locator(".draw-slot-label .badge")).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await generate(page);
  const drawn = await readDocument(page);
  expect(drawn.stages[1].config.knockoutDraw?.version).toBe(1);
  expect(
    drawn.matches
      .filter(
        (match) =>
          match.stageId === targetId &&
          match.round === 1 &&
          match.bracket === "winners",
      )
      .flatMap((match) => match.slots.map((slot) => slot.participantId)),
  ).toEqual(ids);
});

test("revises an unplayed draw and blocks impossible depth without discarding saved rules", async ({
  page,
}) => {
  const tournament = fixture();
  tournament.stages[0].config.knockoutDraw = {
    version: 2,
    pots: [],
    restrictions: ["region"],
    protectedSeeds: 0,
    separation: [{ field: "region", throughRound: 2 }],
  };
  await importFixture(page, tournament);
  await generate(page);
  const previous = await readDocument(page);
  await page
    .getByRole("button", { name: "Reset unplayed draw", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Reset unplayed draw?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await saved(page);
  await round(page, "4");
  await expect(
    page.getByText("Every entrant needs a different region at this depth.", {
      exact: true,
    }),
  ).toBeVisible();
  await preview(page);
  await expect(
    page.getByText("Draw needs attention", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    previous.stages[0].config.knockoutDraw,
  );
  await round(page, "1");
  await preview(page);
  await ready(page);
  await apply(page);
  await generate(page);
  const current = await readDocument(page);
  expect(current.stages[0].config.knockoutDraw).toEqual({
    version: 1,
    pots: [],
    restrictions: ["region"],
    protectedSeeds: 0,
  });
  expect(current.matches).toHaveLength(previous.matches.length);
  await section(page, "History");
  await expect(
    page.getByText("Reset unplayed stage draw", { exact: true }),
  ).toBeVisible();
});

test("keeps an out-of-range saved round visible after an entrant withdraws", async ({
  page,
}) => {
  const tournament = fixture(9);
  tournament.participants.forEach((participant) => {
    participant.region = participant.name;
  });
  tournament.stages[0].config.knockoutDraw = {
    version: 2,
    pots: [],
    restrictions: ["region"],
    protectedSeeds: 0,
    separation: [{ field: "region", throughRound: 4 }],
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
      name: "Separate regions through round",
      exact: true,
    }),
  ).toHaveValue("4");
  await expect(
    page
      .locator('option[value="4"]')
      .filter({ hasText: "outside this bracket" }),
  ).toHaveCount(1);
  await preview(page);
  await expect(
    page.getByText("Draw needs attention", { exact: true }),
  ).toBeVisible();
  await round(page, "3");
  await preview(page);
  await ready(page);
  await expect(page.locator(".draw-separation-block")).toHaveCount(1);
  await apply(page);
  await generate(page);
  expect(
    (await readDocument(page)).matches.filter((match) => match.round === 1),
  ).toHaveLength(4);
});

test("fits Persian separation controls and protected sections at 320 pixels", async ({
  page,
}, testInfo) => {
  const tournament = fixture(13);
  tournament.participants.forEach((participant, index) => {
    participant.name = `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان بزرگ ${index + 1}`;
    participant.region = `منطقه فرهنگی ورزشی شماره ${(index % 4) + 1}`;
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
    .getByLabel("جدا کردن شرکت‌کنندگان هم‌منطقه", { exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "جداسازی منطقه‌ها تا پایان دور",
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
  await expect(page.locator(".draw-separation-block")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const clipped = await page
    .locator(
      ".knockout-draw-editor .button, .knockout-draw-editor .field > span, .draw-separation-rule summary, .draw-separation-block li, .draw-separation-block h5",
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
    path: testInfo.outputPath("separation-persian.png"),
  });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(2);
});
