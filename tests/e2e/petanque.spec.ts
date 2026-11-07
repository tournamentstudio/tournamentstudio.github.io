import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";
import { applySport } from "../../src/sports";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const games: Record<string, Record<string, number>> = {
  AB: { A: 13, B: 5 },
  AC: { A: 13, C: 8 },
  AD: { A: 6, D: 13 },
  BC: { B: 13, C: 7 },
  BD: { B: 13, D: 5 },
  CD: { C: 13, D: 9 },
};
const expected = [
  { name: "A", rank: 1, wins: 2, diff: 6, scored: 32, conceded: 26 },
  { name: "B", rank: 2, wins: 2, diff: 6, scored: 31, conceded: 25 },
  { name: "D", rank: 3, wins: 1, diff: -5, scored: 27, conceded: 32 },
  { name: "C", rank: 4, wins: 1, diff: -7, scored: 28, conceded: 35 },
];

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText(
    /Saved locally|ذخیره شد/,
  );
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
}

async function section(page: Page, en: string, fa: string) {
  await page
    .locator(".workspace-tabs")
    .getByRole("button", { name: new RegExp(`^(${en}|${fa})$`) })
    .click();
}

async function stored(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
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
          .get(location.hash.split("/")[2]);
        request.onsuccess = () => resolve(request.result.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function create(page: Page, names = ["A", "B", "C", "D"]) {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Pétanque club round robin");
  await page.getByLabel("Sport or activity").selectOption("petanque");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Competition format")).toHaveValue(
    "round-robin",
  );
  await page
    .getByLabel("Participant count", { exact: true })
    .fill(String(names.length));
  await page.getByLabel("Or paste names, one per line").fill(names.join("\n"));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await saved(page);
}

async function recordReady(
  page: Page,
  scores: Record<string, Record<string, number>>,
) {
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: /^(Enter result|ثبت نتیجه)$/,
  });
  const names = await dialog.locator(".score-side > bdi").allTextContents();
  const game = scores[[...names].sort().join("")];
  expect(game, `Recorded fixture for ${names.join(" vs ")}`).toBeDefined();
  for (const [index, name] of names.entries()) {
    await dialog
      .locator('.score-entry input[type="number"]')
      .nth(index)
      .fill(String(game[name]));
  }
  await dialog
    .getByRole("button", { name: /^(Save result|ذخیره نتیجه)$/ })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

async function assertTable(
  table: Locator,
  locale: "en" | "fa" = "en",
  names?: string[],
) {
  const headers = await table.locator("thead th").allTextContents();
  const number = (value: number) =>
    value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
  const fields = [
    ["Rank", "رتبه", "rank"],
    ["Won", "برد", "wins"],
    ["Point difference", "تفاضل امتیاز", "diff"],
    ["Points scored", "امتیاز کسب‌شده", "scored"],
    ["Points conceded", "امتیاز واگذارشده", "conceded"],
  ] as const;
  const displayedNames = expected.map(
    (row) => names?.[row.name.charCodeAt(0) - 65] ?? row.name,
  );
  await expect(table.locator("tbody th")).toHaveText(displayedNames);
  for (const [index, result] of expected.entries()) {
    const row = table.locator("tbody tr").nth(index);
    for (const [en, fa, key] of fields) {
      const column = headers.indexOf(locale === "fa" ? fa : en);
      expect(column, `${en} is visible`).toBeGreaterThanOrEqual(0);
      await expect(row.locator(":scope > *").nth(column)).toHaveText(
        number(result[key]),
      );
    }
  }
  await expect(
    table.getByRole("columnheader", {
      name: /^(Points|Standings points|امتیاز جدول)$/,
    }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: /^(Drawn|مساوی)$/ }),
  ).toHaveCount(0);
}

test("Pétanque creation, saved scores and portable standings use the agreed ranking order", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  await create(page);
  let document = await stored(page);
  expect(document.rules.tieBreakers).toEqual([
    "wins",
    "differential",
    "scored",
  ]);
  expect(document.rules.allowDraws).toBe(false);
  await section(page, "Rules", "قوانین");
  await page.getByLabel("Target score", { exact: true }).fill("11");
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await saved(page);
  expect((await stored(page)).rules.targetScore).toBe(11);
  await section(page, "Matches", "دیدارها");
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Enter result",
    exact: true,
  });
  await expect(
    dialog
      .getByLabel("Result type", { exact: true })
      .locator('option[value="draw"]'),
  ).toHaveCount(0);
  for (const input of await dialog
    .locator('.score-entry input[type="number"]')
    .all())
    await input.fill("5");
  await dialog
    .getByRole("button", { name: "Save result", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Scores are tied. Enter the agreed final score after resolving the tie.",
  );
  expect((await stored(page)).matches.some((match) => match.result)).toBe(
    false,
  );
  await page.keyboard.press("Escape");
  for (let index = 0; index < 6; index++) await recordReady(page, games);
  document = await stored(page);
  expect(document.matches.every((match) => match.status === "completed")).toBe(
    true,
  );
  await section(page, "Standings", "جدول رتبه‌ها");
  await assertTable(page.locator(".standings-table"));
  await section(page, "Rules", "قوانین");
  await page
    .getByRole("button", { name: "Move earlier: Points scored", exact: true })
    .click();
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await saved(page);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(page.locator(".standings-table tbody th")).toHaveText([
    "A",
    "B",
    "C",
    "D",
  ]);
  await section(page, "Rules", "قوانین");
  await page
    .getByRole("button", { name: "Move later: Points scored", exact: true })
    .click();
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await saved(page);
  expect((await stored(page)).matches).toEqual(document.matches);
  await page.reload();
  await saved(page);
  await section(page, "Standings", "جدول رتبه‌ها");
  await assertTable(page.locator(".standings-table"));
  await section(page, "Export Studio", "استودیو خروجی");
  await page
    .getByRole("combobox", { name: "Graphic", exact: true })
    .selectOption("standings");
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  const graphic = await pendingDownload;
  expect(await graphic.failure()).toBeNull();
  const svg = await readFile((await graphic.path())!, "utf8");
  const exportedText = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    return Array.from(
      document.querySelectorAll("tspan"),
      (node) => node.textContent,
    )
      .join(" ")
      .replace(/\s+/g, " ");
  }, svg);
  for (const row of expected) {
    expect(exportedText).toContain(
      `${row.rank}. ${row.name} · ${row.wins} wins · ${row.diff} point difference · ${row.scored} points scored · 3 played`,
    );
  }
  await expect(
    page.getByRole("img", { name: "Graphic export preview" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("petanque-standings-export.png"),
    fullPage: true,
  });
  await section(page, "Share Center", "مرکز اشتراک");
  await page.locator("details.share-advanced > summary").click();
  await page.getByRole("button", { name: "Generate link & code" }).click();
  const linkField = page.getByLabel("Snapshot link", { exact: true });
  await expect(linkField).toHaveValue(/#\/open\/TS1/);
  const freshContext = await browser.newContext();
  try {
    const copy = await freshContext.newPage();
    const copyErrors: string[] = [];
    copy.on("pageerror", (error) => copyErrors.push(error.message));
    await copy.goto(await linkField.inputValue());
    const preview = copy.getByRole("dialog", {
      name: "Bring a tournament into your studio",
    });
    await preview
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await expect(preview).not.toBeVisible();
    await saved(copy);
    await section(copy, "Standings", "جدول رتبه‌ها");
    await assertTable(copy.locator(".standings-table"));
    const restored = await stored(copy);
    expect(restored.rules).toEqual((await stored(page)).rules);
    expect(restored.matches.map((match) => match.result?.scores)).toEqual(
      document.matches.map((match) => match.result?.scores),
    );
    expect(copyErrors).toEqual([]);
  } finally {
    await freshContext.close();
  }
});

test("equal Pétanque totals retain an explicit shared rank after all games finish", async ({
  page,
}) => {
  await create(page, ["A", "B", "C"]);
  await section(page, "Matches", "دیدارها");
  const equalCycle = {
    AB: { A: 9, B: 5 },
    BC: { B: 9, C: 5 },
    AC: { A: 5, C: 9 },
  };
  for (let index = 0; index < 3; index++) await recordReady(page, equalCycle);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(
    page.locator('.standings-table [title="Shared rank"]'),
  ).toHaveCount(3);
  for (const row of await page.locator(".standings-table tbody tr").all()) {
    await expect(row.locator("td").first()).toHaveText("1*");
  }
  await page.reload();
  await saved(page);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(
    page.locator('.standings-table [title="Shared rank"]'),
  ).toHaveCount(3);
});

test("choosing Pétanque preserves an explicitly selected group format", async ({
  page,
}) => {
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Pétanque pools");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Competition format").selectOption("groups");
  await page.getByLabel("Participant count", { exact: true }).fill("4");
  await page.getByLabel("Number of groups", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Sport or activity").selectOption("petanque");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Competition format")).toHaveValue("groups");
  await expect(
    page.getByLabel("Number of groups", { exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await saved(page);
  const doc = await stored(page);
  expect(doc.sport).toBe("petanque");
  expect(doc.stages[0].format).toBe("groups");
  expect(doc.stages[0].config.groupCount).toBe(2);
  expect(doc.rules.tieBreakers).toEqual(["wins", "differential", "scored"]);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(page.locator(".standings-table")).toHaveCount(2);
  await expect(page.locator(".ranking-summary")).toHaveCount(1);
});

function groupedFixture() {
  const names = "ABCDEFGH".split("").map((name) => `${name} باشگاه ساحل`);
  let doc = applySport(
    createTournament(
      "Pétanque گروه‌های باشگاه ساحل",
      names.map((name, index) => createParticipant(name, index + 1)),
      "groups",
    ),
    "petanque",
  );
  doc.stages[0].config.groupCount = 2;
  doc.stages[0].config.groups = [
    doc.participants.slice(0, 4).map((p) => p.id),
    doc.participants.slice(4).map((p) => p.id),
  ];
  doc = generateStage(doc, doc.stages[0].id);
  for (const match of [...doc.matches]) {
    const sides = match.slots.map((slot) =>
      String.fromCharCode(
        65 +
          (doc.participants.findIndex(
            (participant) => participant.id === slot.participantId,
          ) %
            4),
      ),
    );
    const scores = games[[...sides].sort().join("")];
    doc = recordResult(doc, match.id, {
      scores: sides.map((side) => scores[side]),
      sets: [],
      winnerIds: [],
      outcome: "played",
      recordedAt: "2026-11-07T12:00:00Z",
    });
  }
  return doc;
}

test("grouped Pétanque standings and rules fit English and Persian at four widths", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const doc = groupedFixture();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await preview.locator('input[type="file"]').setInputFiles({
    name: "petanque.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await preview
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(preview).not.toBeVisible();
  await saved(page);
  await expect(page.locator(".toast")).not.toBeVisible();
  for (const locale of ["en", "fa"] as const) {
    if (locale === "fa")
      await page
        .getByRole("button", { name: "Switch to Persian", exact: true })
        .click();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "fa" ? "rtl" : "ltr",
    );
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [en, fa] of [
        ["Standings", "جدول رتبه‌ها"],
        ["Rules", "قوانین"],
      ]) {
        await section(page, en, fa);
        if (en === "Standings") {
          await expect(page.locator(".standings-table")).toHaveCount(2);
          await assertTable(
            page.locator(".standings-table").nth(0),
            locale,
            doc.participants.slice(0, 4).map((p) => p.name),
          );
          await assertTable(
            page.locator(".standings-table").nth(1),
            locale,
            doc.participants.slice(4).map((p) => p.name),
          );
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const clipped = await page
          .locator(
            ".workspace-fieldset .button, .workspace-fieldset .field > span, .ranking-summary",
          )
          .evaluateAll((elements) =>
            elements
              .filter(
                (element) =>
                  element.clientWidth > 0 &&
                  (element.scrollWidth > element.clientWidth + 2 ||
                    element.scrollHeight > element.clientHeight + 2),
              )
              .map((element) => element.textContent),
          );
        expect(clipped).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath(
            `petanque-${en.toLowerCase()}-${locale}-${width}.png`,
          ),
          fullPage: true,
        });
        if (width === 320) {
          const accessibility = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(accessibility.violations).toEqual([]);
        }
      }
      await section(page, "Matches", "دیدارها");
      await page
        .getByRole("button", { name: /^(All matches|همه دیدارها)$/ })
        .click();
      await page.locator("button.match-tile.completed").first().click();
      const resultDialog = page.getByRole("dialog", {
        name: /^(Edit result|ویرایش نتیجه)$/,
      });
      await expect(resultDialog).toBeVisible();
      expect(
        await resultDialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      const clippedScores = await resultDialog
        .locator(".score-side > bdi, .button")
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.clientWidth > 0 &&
                (element.scrollWidth > element.clientWidth + 2 ||
                  element.scrollHeight > element.clientHeight + 2),
            )
            .map((element) => element.textContent),
        );
      expect(clippedScores).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`petanque-score-${locale}-${width}.png`),
        fullPage: true,
      });
      if (width === 320) {
        const accessibility = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(accessibility.violations).toEqual([]);
      }
      await page.keyboard.press("Escape");
      await expect(resultDialog).not.toBeVisible();
    }
  }
});
