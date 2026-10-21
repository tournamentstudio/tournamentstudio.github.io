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
    "Finals separation cup",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      region: `Region ${index + 1}`,
      organization: `Club ${index + 1}`,
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
          name: "finals.json",
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

test("protects grand finals and resets independently and transfers v4 rules", async ({
  page,
  browser,
}, testInfo) => {
  await importFixture(page, fixture());
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  for (const target of ["grand final", "reset final"])
    for (const field of ["regions", "organizations"])
      await page
        .getByLabel(`Separate ${field} in ${target}`, { exact: true })
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
    .selectOption("4");
  await page.getByLabel("Protected seed positions", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Fill pots by seed", exact: true })
    .click();
  await preview(page);
  await ready(page);
  await expect(page.locator("[data-finals-separation-target]")).toHaveCount(4);
  await expect(
    page.locator('[data-separation-field="region"]'),
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
  await page.locator(".draw-finals-preview h4").click();
  await page
    .locator(".draw-finals-preview")
    .screenshot({ path: testInfo.outputPath("finals-preview.png") });
  await apply(page);
  await generate(page);
  const drawn = await readDocument(page);
  expect(drawn.stages[0].config.knockoutDraw).toMatchObject({
    version: 4,
    restrictions: ["region"],
    separation: [{ field: "region", throughRound: 2 }],
    losersSeparation: [{ field: "organization", throughRound: 4 }],
    finalsSeparation: [
      { field: "region", targets: ["grand-final", "reset"] },
      { field: "organization", targets: ["grand-final", "reset"] },
    ],
  });
  expect(
    drawn.matches
      .filter((match) => match.bracket === "winners" && match.round === 1)
      .sort((a, b) => a.index - b.index)
      .flatMap((match) =>
        match.slots.map((slot) => slot.participantId ?? null),
      ),
  ).toEqual(slots);
  expect(
    drawn.matches.filter((match) => match.bracket === "final"),
  ).toHaveLength(1);
  expect(
    drawn.matches.filter((match) => match.bracket === "reset"),
  ).toHaveLength(1);
  await expect(
    page.getByLabel("Separate regions in grand final", { exact: true }),
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
  const archive = testInfo.outputPath("finals.tourney");
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
    } finally {
      await context.close();
    }
  }
  expect((await readDocument(page)).matches).toEqual(drawn.matches);
});

test("rejects repeated normalized labels in either final without changing saved rules", async ({
  page,
}) => {
  const tournament = fixture(5);
  tournament.participants[0].region = " North ";
  tournament.participants[4].region = "NORTH";
  tournament.stages[0].config.knockoutDraw = {
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
  };
  await importFixture(page, tournament);
  const original = (await readDocument(page)).stages[0].config.knockoutDraw;
  await expect(
    page.getByText(/Moving seeds cannot separate repeated labels/),
  ).toBeVisible();
  for (const target of ["grand final", "reset final"]) {
    await page
      .getByLabel(`Separate regions in ${target}`, { exact: true })
      .check();
    await preview(page);
    await expect(
      page.getByText("Draw needs attention", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert").first()).toContainText(
      /North has 2 entrants/,
    );
    await expect(
      page.getByRole("button", { name: "Apply draw rules", exact: true }),
    ).toBeDisabled();
    expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
      original,
    );
    await page
      .getByLabel(`Separate regions in ${target}`, { exact: true })
      .uncheck();
    await preview(page);
    await ready(page);
    await expect(
      page.getByRole("button", { name: "Apply draw rules", exact: true }),
    ).toBeDisabled();
  }
  await generate(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    original,
  );
});

test("protects third place and explains incompatible winners-round rules", async ({
  page,
}) => {
  const tournament = fixture(8, "single-elimination");
  tournament.stages[0].config.thirdPlace = true;
  tournament.participants[0].region = "North";
  tournament.participants[1].region = "North";
  await importFixture(page, tournament);
  await page
    .getByRole("button", { name: "Configure knockout draw", exact: true })
    .click();
  await page
    .getByLabel("Separate regions in third-place match", { exact: true })
    .check();
  await page
    .getByLabel("Separate organizations in third-place match", { exact: true })
    .check();
  await preview(page);
  await ready(page);
  await expect(
    page.locator('[data-finals-separation-target="third-place"]'),
  ).toHaveCount(2);
  await apply(page);
  const protectedDraw = (await readDocument(page)).stages[0].config
    .knockoutDraw;
  await expect(
    page.getByLabel("Third-place match", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.structure-settings option[value="double-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await page.getByLabel("Separate the same region", { exact: true }).check();
  await page
    .getByRole("combobox", {
      name: "Separate regions through round",
      exact: true,
    })
    .selectOption("2");
  await preview(page);
  await expect(
    page.getByText("Draw needs attention", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    protectedDraw,
  );
  await page
    .getByRole("button", { name: "Discard draw edits", exact: true })
    .click();
  await generate(page);
  const drawn = await readDocument(page);
  expect(
    drawn.matches.filter((match) => match.bracket === "placement"),
  ).toHaveLength(1);
  const slots = drawn.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .sort((a, b) => a.index - b.index)
    .flatMap((match) => match.slots.map((slot) => slot.participantId));
  const north = drawn.participants
    .filter((participant) => participant.region === "North")
    .map((participant) => slots.indexOf(participant.id));
  expect(Math.floor(north[0] / 4)).toBe(Math.floor(north[1] / 4));
  expect(drawn.stages[0].config.knockoutDraw).toEqual(protectedDraw);
});

test("guards match settings and downgrades finals rules without losing other protections", async ({
  page,
}) => {
  const tournament = fixture(8);
  const original = {
    version: 3 as const,
    pots: [],
    restrictions: ["region" as const],
    protectedSeeds: 0,
    separation: [{ field: "region" as const, throughRound: 2 }],
    losersSeparation: [{ field: "organization" as const, throughRound: 2 }],
  };
  tournament.stages[0].config.knockoutDraw = original;
  await importFixture(page, tournament);
  await page
    .getByLabel("Separate regions in grand final", { exact: true })
    .check();
  await page
    .getByLabel("Separate regions in grand final", { exact: true })
    .uncheck();
  await preview(page);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Apply draw rules", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Separate regions in grand final", { exact: true })
    .check();
  await page
    .getByLabel("Separate organizations in reset final", { exact: true })
    .check();
  await preview(page);
  await ready(page);
  await apply(page);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.structure-settings option[value="single-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByLabel("Separate regions in grand final", { exact: true })
    .uncheck();
  await preview(page);
  await ready(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw?.version,
  ).toBe(4);
  await page
    .getByLabel("Separate organizations in reset final", { exact: true })
    .uncheck();
  await preview(page);
  await ready(page);
  await apply(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual(
    original,
  );
  await page
    .getByLabel("Double elimination final reset", { exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByLabel("Double elimination final reset", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Separate regions in reset final", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Separate regions in grand final", { exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", {
      name: "Separate organizations through losers round",
      exact: true,
    })
    .selectOption("0");
  await preview(page);
  await ready(page);
  await apply(page);
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw?.version,
  ).toBe(2);
  await page
    .getByRole("combobox", {
      name: "Separate regions through round",
      exact: true,
    })
    .selectOption("1");
  await preview(page);
  await ready(page);
  await apply(page);
  expect((await readDocument(page)).stages[0].config.knockoutDraw).toEqual({
    version: 1,
    pots: [],
    restrictions: ["region"],
    protectedSeeds: 0,
  });
  await page
    .locator(".structure-settings")
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("single-elimination");
  await saved(page);
  await expect(
    page.getByLabel("Separate regions in third-place match", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Third-place match", { exact: true }).click();
  await saved(page);
  await expect(
    page.getByLabel("Third-place match", { exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Separate regions in third-place match", { exact: true })
    .check();
  await preview(page);
  await ready(page);
  await apply(page);
  await expect(
    page.getByLabel("Third-place match", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.structure-settings option[value="double-elimination"]'),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByLabel("Separate regions in third-place match", { exact: true })
    .uncheck();
  await preview(page);
  await ready(page);
  await apply(page);
  await page.getByLabel("Third-place match", { exact: true }).click();
  await saved(page);
  await expect(
    page.getByLabel("Third-place match", { exact: true }),
  ).not.toBeChecked();
  expect(
    (await readDocument(page)).stages[0].config.knockoutDraw?.version,
  ).toBe(1);
});

test("fits Persian finals controls and explains the three-entrant walkover at 320 pixels", async ({
  page,
}, testInfo) => {
  const tournament = fixture(3, "single-elimination");
  tournament.stages[0].config.thirdPlace = true;
  tournament.participants.forEach((participant, index) => {
    participant.name = `تیم پیشکسوتان مسابقات گل یا پوچ شهرستان بزرگ Team ${index + 1}`;
    participant.region = "منطقه فرهنگی ورزشی شمال";
    participant.organization = "سازمان شرکت‌کنندگان پیشکسوتان شهرستان";
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
    .getByLabel("جداسازی منطقه‌ها در دیدار رده‌بندی", { exact: true })
    .check();
  await page
    .getByLabel("جداسازی سازمان‌ها در دیدار رده‌بندی", { exact: true })
    .check();
  await expect(
    page.getByText(/با سه شرکت‌کننده، دریافت‌کننده استراحت آغازین/),
  ).toBeVisible();
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
      ".knockout-draw-editor .button, .knockout-draw-editor .field > span, .draw-finals-fields .check-row span, .draw-finals-preview li, .draw-finals-preview h4, .draw-preview-pair li",
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
  await page
    .locator(".knockout-draw-editor")
    .screenshot({ path: testInfo.outputPath("finals-persian.png") });
  await page
    .getByRole("button", { name: "اعمال قوانین قرعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDocument(page)).stages[0].config.knockoutDraw?.version,
    )
    .toBe(4);
});
