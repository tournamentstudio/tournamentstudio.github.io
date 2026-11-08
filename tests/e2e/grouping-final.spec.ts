import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

function fixture(count: number, format: FormatId, groups = 2) {
  const doc = createTournament(
    "Grouping review بازبینی گروه‌ها",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Entrant ${index + 1} تیم`, index + 1),
      id: `entrant-${index + 1}`,
    })),
    format,
  );
  doc.stages[0].config.groupCount = groups;
  return doc;
}

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText(
    /Saved locally|ذخیره شد/,
  );
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
}

async function stored(page: Page): Promise<Tournament> {
  return page.evaluate(async () => {
    const request = indexedDB.open("TournaStudio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Tournament>((resolve, reject) => {
        const read = db
          .transaction("documents")
          .objectStore("documents")
          .get(location.hash.split("/")[2]);
        read.onsuccess = () => resolve(read.result.payload);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

async function open(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "grouping-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

async function section(page: Page, en: string, fa: string) {
  await page
    .locator(".workspace-tabs")
    .getByRole("button", {
      name: new RegExp(`^(${en}|${fa})$`),
    })
    .click();
}

async function draw(page: Page) {
  await section(page, "Structure", "ساختار");
  await page
    .getByRole("button", { name: /^(Generate draw|ساخت قرعه)$/ })
    .click();
  await saved(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
}

async function result(page: Page) {
  const tile = page.locator("button.match-tile.ready").first();
  const names = await tile.locator(".match-entrant bdi").allTextContents();
  await tile.click();
  const dialog = page.getByRole("dialog", {
    name: /^(Enter result|ثبت نتیجه)$/,
  });
  const fields = dialog.locator('.score-entry input[type="number"]');
  expect(await fields.count()).toBe(names.length);
  const ranks = names.map((name) => Number(name.match(/Entrant (\d+)/)![1]));
  for (let index = 0; index < names.length; index++) {
    // Lower entrant numbers win, keeping group qualification unambiguous.
    await fields
      .nth(index)
      .fill(
        String(
          names.length - ranks.filter((rank) => rank < ranks[index]).length,
        ),
      );
  }
  await dialog
    .getByRole("button", { name: /^(Save result|ذخیره نتیجه)$/ })
    .click();
  await expect(dialog).not.toBeVisible();
  await saved(page);
}

async function complete(page: Page, expected: number) {
  await section(page, "Matches", "دیدارها");
  await page
    .getByRole("button", { name: /^(Ready to play|آماده بازی)$/ })
    .click();
  for (let index = 0; index < expected; index++) await result(page);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(0);
}

async function assertGroupTables(page: Page, doc: Tournament, count: number) {
  await section(page, "Standings", "جدول رتبه‌ها");
  const groups = [
    ...new Set(
      doc.matches
        .filter((match) => match.stageId === doc.stages[0].id)
        .map((match) => match.group!),
    ),
  ];
  expect(groups).toHaveLength(count);
  const tables = page.locator(".standings-table");
  await expect(tables).toHaveCount(count);
  const allNames: string[] = [];
  for (let index = 0; index < count; index++) {
    const ids = new Set(
      doc.matches
        .filter((match) => match.group === groups[index])
        .flatMap((match) =>
          match.slots.map((slot) => slot.participantId).filter(Boolean),
        ),
    );
    const names = doc.participants
      .filter((participant) => ids.has(participant.id))
      .map((participant) => participant.name)
      .sort();
    const shown = await tables
      .nth(index)
      .getByRole("rowheader")
      .allTextContents();
    expect(shown.sort()).toEqual(names);
    allNames.push(...shown);
  }
  expect(new Set(allNames).size).toBe(doc.participants.length);
}

test("creates sixteen entrants in four groups and completes eight-entrant playoffs", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/#/create");
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Group finals review");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Competition format", { exact: true })
    .selectOption("groups");
  await page
    .getByLabel("Or paste names, one per line", { exact: true })
    .fill(
      Array.from({ length: 16 }, (_, index) => `Entrant ${index + 1} تیم`).join(
        "\n",
      ),
    );
  await page.getByLabel("Number of groups", { exact: true }).fill("4");
  await page
    .getByRole("checkbox", {
      name: "Add a knockout playoff stage",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await saved(page);
  let doc = await stored(page);
  expect(doc.matches).toHaveLength(24);
  for (const participant of doc.participants) {
    const home = doc.matches.filter(
      (match) => match.slots[0].participantId === participant.id,
    ).length;
    const away = doc.matches.filter(
      (match) => match.slots[1].participantId === participant.id,
    ).length;
    expect(home + away).toBe(3);
    expect(Math.abs(home - away)).toBe(1);
  }
  await assertGroupTables(page, doc, 4);
  await complete(page, 24);
  doc = await stored(page);
  expect(doc.stages[0].status).toBe("completed");
  await section(page, "Structure", "ساختار");
  await page
    .getByLabel("Selected stage", { exact: true })
    .selectOption(doc.stages[1].id);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  doc = await stored(page);
  const groups = doc.stages[0].metadata.groups as string[][];
  const expected = groups.flatMap((ids) =>
    [...ids]
      .sort(
        (a, b) =>
          doc.participants.find((p) => p.id === a)!.seed! -
          doc.participants.find((p) => p.id === b)!.seed!,
      )
      .slice(0, 2),
  );
  expect([...doc.stages[1].participantIds].sort()).toEqual(expected.sort());
  expect(
    doc.matches.filter((match) => match.stageId === doc.stages[1].id),
  ).toHaveLength(7);
  await complete(page, 7);
  doc = await stored(page);
  const final = doc.matches.find(
    (match) => match.stageId === doc.stages[1].id && match.round === 3,
  )!;
  expect(final.result!.winnerIds).toEqual([doc.participants[0].id]);
  expect(doc.stages.every((stage) => stage.status === "completed")).toBe(true);
  await page.reload();
  await saved(page);
  expect((await stored(page)).matches).toEqual(doc.matches);
});

test("GSL groups finish through winners and deciders with correct Persian standings", async ({
  page,
}, testInfo) => {
  await open(page, fixture(8, "gsl"));
  await page.getByTestId("language-select").selectOption("fa");
  await page.setViewportSize({ width: 390, height: 844 });
  await draw(page);
  await complete(page, 10);
  const doc = await stored(page);
  expect(doc.stages[0].status).toBe("completed");
  await assertGroupTables(page, doc, 2);
  for (let index = 0; index < 2; index++) {
    const qualifiers = doc.matches
      .filter(
        (match) =>
          match.group === String.fromCharCode(65 + index) &&
          match.metadata.qualifier,
      )
      .sort(
        (a, b) => Number(a.metadata.qualifier) - Number(b.metadata.qualifier),
      )
      .map(
        (match) =>
          doc.participants.find(
            (participant) => participant.id === match.result!.winnerIds[0],
          )!.name,
      );
    const names = await page
      .locator(".standings-table")
      .nth(index)
      .getByRole("rowheader")
      .allTextContents();
    expect(names.slice(0, 2)).toEqual(qualifiers);
  }
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("gsl-fa-mobile.png"),
    fullPage: true,
  });
});

for (const meetings of [2, 3]) {
  test(`${meetings} meetings retain every within-group pairing and independent standings`, async ({
    page,
  }, testInfo) => {
    await open(page, fixture(6, "groups"));
    await section(page, "Structure", "ساختار");
    await page
      .locator(".structure-settings")
      .getByLabel("Meetings", { exact: true })
      .fill(String(meetings));
    await saved(page);
    await draw(page);
    let doc = await stored(page);
    expect(doc.matches).toHaveLength(6 * meetings);
    const pairs = new Map<string, number>();
    for (const match of doc.matches) {
      const pair = match.slots
        .map((slot) => slot.participantId)
        .sort()
        .join(":");
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    expect(pairs.size).toBe(6);
    expect([...pairs.values()]).toEqual(Array(6).fill(meetings));
    if (meetings === 3)
      await page.getByTestId("language-select").selectOption("fa");
    await page.setViewportSize({ width: 320, height: 760 });
    await section(page, "Matches", "دیدارها");
    await result(page);
    doc = await stored(page);
    await assertGroupTables(page, doc, 2);
    const completed = doc.matches.find(
      (match) => match.status === "completed",
    )!;
    const winner = doc.participants.find(
      (participant) => participant.id === completed.result!.winnerIds[0],
    )!;
    await expect(
      page
        .getByRole("rowheader", { name: winner.name, exact: true })
        .locator("..")
        .locator("td")
        .nth(1),
    ).toHaveText(meetings === 3 ? "۱" : "1");
    const untouched = page.locator(".workspace-group").filter({
      has: page.getByRole("heading", {
        name: new RegExp(
          `^(Group|گروه) ${completed.group === "A" ? "B" : "A"}$`,
        ),
      }),
    });
    await expect(untouched).toHaveCount(1);
    await expect(untouched.locator("tbody tr")).toHaveCount(3);
    for (const row of await untouched.locator("tbody tr").all()) {
      await expect(row.locator("td").nth(1)).toHaveText(
        meetings === 3 ? "۰" : "0",
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: testInfo.outputPath(`group-meetings-${meetings}-mobile.png`),
      fullPage: true,
    });
    await page.reload();
    await saved(page);
    expect((await stored(page)).matches).toEqual(doc.matches);
  });
}

test("group labels beyond Z keep separate standings and reload correctly", async ({
  page,
}) => {
  await open(page, fixture(54, "groups", 27));
  await draw(page);
  const doc = await stored(page);
  expect(doc.matches).toHaveLength(27);
  await assertGroupTables(page, doc, 27);
  await expect(
    page.getByRole("heading", { name: "Group AA", exact: true }),
  ).toBeVisible();
  await page.getByTestId("language-select").selectOption("fa");
  await expect(
    page.getByRole("heading", { name: "گروه AA", exact: true }),
  ).toBeVisible();
  await page.reload();
  await saved(page);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(page.locator(".standings-table")).toHaveCount(27);
  expect((await stored(page)).matches).toEqual(doc.matches);
});

test("multi-entrant heats retain their entrants and isolate a recorded result", async ({
  page,
}) => {
  const source = fixture(16, "free-for-all");
  source.stages[0].config.capacity = 4;
  source.stages[0].config.rounds = 2;
  await open(page, source);
  await draw(page);
  let doc = await stored(page);
  expect(doc.matches).toHaveLength(8);
  expect(doc.matches.every((match) => match.slots.length === 4)).toBe(true);
  await assertGroupTables(page, doc, 4);
  await section(page, "Matches", "دیدارها");
  await result(page);
  doc = await stored(page);
  expect(
    doc.matches.filter((match) => match.status === "completed"),
  ).toHaveLength(1);
  await assertGroupTables(page, doc, 4);
  const played = doc.matches.find((match) => match.status === "completed")!;
  const winner = doc.participants.find(
    (participant) => participant.id === played.result!.winnerIds[0],
  )!;
  await expect(
    page
      .getByRole("rowheader", { name: winner.name, exact: true })
      .locator("..")
      .locator("td")
      .nth(1),
  ).toHaveText("1");
  const unaffected = page.locator(".workspace-group").filter({
    hasNot: page.getByRole("heading", {
      name: `Group ${played.group}`,
      exact: true,
    }),
  });
  await expect(unaffected).toHaveCount(3);
  await expect(unaffected.locator("tbody tr")).toHaveCount(12);
  for (const row of await unaffected.locator("tbody tr").all()) {
    await expect(row.locator("td").nth(1)).toHaveText("0");
  }
});

test("ready group fixtures stay in round order across page boundaries", async ({
  page,
}) => {
  let source = fixture(40, "groups", 10);
  source = generateStage(source, source.stages[0].id);
  for (const match of source.matches.slice(0, 2)) {
    source = recordResult(source, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: source.updatedAt,
    });
  }
  await open(page, source);
  await section(page, "Matches", "دیدارها");
  const pagination = page.getByRole("navigation", {
    name: "Match pages",
    exact: true,
  });
  await pagination
    .getByLabel("Items per page", { exact: true })
    .selectOption("25");
  const rounds = page.locator(".fixture-round-heading h3");
  await expect(rounds).toHaveText(["Round 1", "Round 2"]);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(25);
  await pagination.getByRole("button", { name: "Next", exact: true }).click();
  await expect(rounds).toHaveText(["Round 2", "Round 3"]);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(25);
  await pagination.getByRole("button", { name: "Next", exact: true }).click();
  await expect(rounds).toHaveText(["Round 3"]);
  await expect(page.locator("button.match-tile.ready")).toHaveCount(8);
  expect((await stored(page)).matches).toEqual(source.matches);
});
