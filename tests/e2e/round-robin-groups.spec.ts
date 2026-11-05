import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";

function fixture(
  count: number,
  format: "groups" | "round-robin" | "gsl",
  groups = 2,
) {
  const doc = createTournament(
    "Round robin review",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1} تیم`, index + 1),
      id: `p${index + 1}`,
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

async function open(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "round-robin.json",
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

test("standalone round robin exposes meetings without an ignored group count", async ({
  page,
}) => {
  await open(page, fixture(3, "round-robin", 3));
  await section(page, "Structure", "ساختار");
  const settings = page.locator(".structure-settings");
  await expect(settings.getByLabel("Groups", { exact: true })).toHaveCount(0);
  await expect(
    settings.getByText("Round robin uses one field of entrants.", {
      exact: false,
    }),
  ).toBeVisible();
  await settings.getByLabel("Meetings", { exact: true }).fill("12");
  await saved(page);
  await settings
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const doc = await stored(page);
  expect(doc.matches).toHaveLength(36);
  expect(doc.matches.every((match) => match.group === undefined)).toBe(true);
  await section(page, "Standings", "جدول رتبه‌ها");
  await expect(page.locator(".standings-table")).toHaveCount(1);
  await expect(page.locator(".standings-table tbody tr")).toHaveCount(3);
});

for (const options of [
  { count: 7, groups: 3, locale: "en" },
  { count: 18, groups: 4, locale: "fa" },
]) {
  test(`${options.locale} uneven round robin groups show every entrant and isolate results`, async ({
    page,
  }, testInfo) => {
    await open(page, fixture(options.count, "groups", options.groups));
    if (options.locale === "fa")
      await page
        .getByRole("button", { name: "Switch to Persian", exact: true })
        .click();
    await section(page, "Structure", "ساختار");
    await page
      .getByRole("button", { name: /^(Generate draw|ساخت قرعه)$/ })
      .click();
    await saved(page);
    let doc = await stored(page);
    const groups = doc.stages[0].metadata.groups as string[][];
    expect(groups).toHaveLength(options.groups);
    expect(new Set(groups.flat()).size).toBe(options.count);
    expect(doc.matches).toHaveLength(
      groups.reduce(
        (sum, group) => sum + (group.length * (group.length - 1)) / 2,
        0,
      ),
    );
    for (const match of doc.matches) {
      const group = groups.find((ids) =>
        ids.includes(match.slots[0].participantId!),
      )!;
      expect(group).toContain(match.slots[1].participantId);
    }
    await section(page, "Standings", "جدول رتبه‌ها");
    const tables = page.locator(".standings-table");
    await expect(tables).toHaveCount(options.groups);
    for (let index = 0; index < groups.length; index++) {
      await expect(tables.nth(index).locator("tbody tr")).toHaveCount(
        groups[index].length,
      );
      for (const id of groups[index]) {
        const name = doc.participants.find(
          (participant) => participant.id === id,
        )!.name;
        await expect(
          tables.nth(index).getByRole("rowheader", { name, exact: true }),
        ).toBeVisible();
      }
    }
    await section(page, "Matches", "دیدارها");
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", {
      name: /^(Match control|کنترل دیدار)$/,
    });
    await dialog.locator('.score-entry input[type="number"]').nth(0).fill("3");
    await dialog.locator('.score-entry input[type="number"]').nth(1).fill("1");
    await dialog
      .getByRole("button", { name: /^(Confirm result|تأیید نتیجه)$/ })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(page);
    doc = await stored(page);
    const result = doc.matches.find((match) => match.status === "completed")!;
    const winnerName = doc.participants.find(
      (participant) => participant.id === result.result!.winnerIds[0],
    )!.name;
    await section(page, "Standings", "جدول رتبه‌ها");
    const winnerRow = page
      .getByRole("rowheader", { name: winnerName, exact: true })
      .locator("..");
    await expect(winnerRow.locator("td").nth(1)).toHaveText(
      options.locale === "fa" ? "۱" : "1",
    );
    await expect(winnerRow.locator("td").last()).toHaveText(
      options.locale === "fa" ? "۳" : "3",
    );
    const unplayed = tables.filter({
      hasNot: page.getByRole("rowheader", { name: winnerName, exact: true }),
    });
    for (const table of await unplayed.all()) {
      for (const row of await table.locator("tbody tr").all()) {
        await expect(row.locator("td").nth(1)).toHaveText(
          options.locale === "fa" ? "۰" : "0",
        );
      }
    }
    await page.reload();
    await saved(page);
    await section(page, "Standings", "جدول رتبه‌ها");
    await expect(page.locator(".standings-table")).toHaveCount(options.groups);
    await expect(
      page
        .getByRole("rowheader", { name: winnerName, exact: true })
        .locator("..")
        .locator("td")
        .last(),
    ).toHaveText(options.locale === "fa" ? "۳" : "3");
    if (options.locale === "fa") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.screenshot({
        path: testInfo.outputPath("persian-group-standings.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "تغییر به انگلیسی", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await expect(page.locator(".standings-table")).toHaveCount(
        options.groups,
      );
      await expect(
        page
          .getByRole("rowheader", { name: winnerName, exact: true })
          .locator("..")
          .locator("td")
          .last(),
      ).toHaveText("3");
      expect((await stored(page)).matches).toEqual(doc.matches);
    }
  });
}

test("manual group composition does not offer an ignored group count", async ({
  page,
}) => {
  const doc = fixture(7, "groups");
  doc.stages[0].config.groups = [
    ["p1", "p2", "p3"],
    ["p4", "p5", "p6", "p7"],
  ];
  await open(page, doc);
  await section(page, "Structure", "ساختار");
  const groups = page
    .locator(".structure-settings")
    .getByLabel("Groups", { exact: true });
  await expect(groups).toBeDisabled();
  await expect(
    page.getByText("Manual group composition fixes the group count.", {
      exact: false,
    }),
  ).toBeVisible();
  const manual = page.locator(".manual-group-editor");
  await manual.locator(":scope > summary").click();
  await manual
    .getByRole("button", {
      name: "Restore automatic group composition",
      exact: true,
    })
    .click();
  await saved(page);
  await expect(groups).toBeEnabled();
  await groups.fill("3");
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  expect((await stored(page)).stages[0].metadata.groups).toHaveLength(3);
});

test("GSL explains fixed groups of four instead of an ignored group count", async ({
  page,
}) => {
  await open(page, fixture(8, "gsl", 5));
  await section(page, "Structure", "ساختار");
  const settings = page.locator(".structure-settings");
  await expect(settings.getByLabel("Groups", { exact: true })).toHaveCount(0);
  await expect(
    settings.getByText("GSL uses groups of exactly four entrants.", {
      exact: false,
    }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  const doc = await stored(page);
  expect(doc.stages[0].metadata.groups).toHaveLength(2);
  expect(doc.matches).toHaveLength(10);
});
