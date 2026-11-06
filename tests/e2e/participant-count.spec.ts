import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_CONFIG } from "../../src/domain/types";

async function playingField(page: Page, locale: "en" | "fa" = "en") {
  await page.addInitScript((value) => {
    localStorage.setItem("tournastudio-locale", value);
  }, locale);
  await page.goto("/#/create");
  await page
    .getByLabel(locale === "en" ? "Tournament title" : "عنوان مسابقات", {
      exact: true,
    })
    .fill("Count review جام");
  await page
    .getByRole("button", {
      name: locale === "en" ? "Continue" : "ادامه",
      exact: true,
    })
    .click();
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/t\/[^/]+$/);
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  return page.evaluate(async () => {
    const request = indexedDB.open("TournaStudio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<import("../../src/domain/types").Tournament>(
        (resolve, reject) => {
          const read = db
            .transaction("documents")
            .objectStore("documents")
            .get(location.hash.split("/")[2]);
          read.onsuccess = () => resolve(read.result.payload);
          read.onerror = () => reject(read.error);
        },
      );
    } finally {
      db.close();
    }
  });
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} rejects invalid counts before leaving the playing field`, async ({
    page,
  }) => {
    await playingField(page, locale);
    const count = page.getByLabel(
      locale === "en" ? "Participant count" : "تعداد شرکت‌کنندگان",
      { exact: true },
    );
    for (const input of ["", "0", "-3", "1", "2.5", "513", "1e309"]) {
      await count.fill(input);
      await page
        .getByRole("button", {
          name: locale === "en" ? "Continue" : "ادامه",
          exact: true,
        })
        .click();
      await expect
        .soft(count, `Invalid count ${input} stays editable`)
        .toBeVisible();
      await expect.soft(count).toHaveAttribute("aria-invalid", "true");
      await expect
        .soft(page.getByRole("alert"))
        .toContainText(locale === "en" ? "whole number" : "عدد صحیح");
      if (!(await count.isVisible())) break;
    }
  });
}

test("keeps count drafts editable and generates exactly the final count", async ({
  page,
}) => {
  await playingField(page);
  const count = page.getByLabel("Participant count", { exact: true });
  await count.fill("");
  await expect(count).toHaveValue("");
  for (const value of ["512", "2", "13", "7"]) {
    await count.fill(value);
    await expect(count).toHaveValue(value);
    await expect(page.locator(".inline-metric b")).toHaveText(value);
  }
  const doc = await finish(page);
  expect(doc.participants).toHaveLength(7);
  expect(doc.matches.filter((match) => match.status !== "bye")).toHaveLength(6);
});

test("shows the pasted name count and restores the numeric draft when cleared", async ({
  page,
}) => {
  await playingField(page);
  const count = page.getByLabel("Participant count", { exact: true });
  const names = page.getByLabel("Or paste names, one per line", {
    exact: true,
  });
  await count.fill("13");
  await names.fill("North Stars\n  \nتیم آفتاب\nAtlas\n");
  await expect(count).toBeDisabled();
  await expect.soft(count).toHaveValue("3");
  await expect(page.locator(".inline-metric b")).toHaveText("3");
  await names.fill("");
  await expect(count).toBeEnabled();
  await expect(count).toHaveValue("13");
  await names.fill("North Stars\nتیم آفتاب\nAtlas");
  const doc = await finish(page);
  expect(doc.participants.map((participant) => participant.name)).toEqual([
    "North Stars",
    "تیم آفتاب",
    "Atlas",
  ]);
});

test("keeps group defaults valid after the participant count shrinks", async ({
  page,
}) => {
  await playingField(page);
  await page
    .getByLabel("Competition format", { exact: true })
    .selectOption("groups");
  await page.getByLabel("Participant count", { exact: true }).fill("3");
  await page.getByLabel("Participant count", { exact: true }).press("Tab");
  await expect
    .soft(page.getByLabel("Number of groups", { exact: true }))
    .toHaveValue("1");
  const doc = await finish(page);
  expect(doc.participants).toHaveLength(3);
  expect(doc.stages[0].config.groupCount).toBe(1);
  expect(doc.matches).toHaveLength(3);
});

test("advisor preserves invalid count drafts and offers no misleading plans", async ({
  page,
}) => {
  await page.goto("/#/advisor");
  const count = page.getByLabel("Participants", { exact: true });
  for (const value of ["", "1", "2.5", "513"]) {
    await count.fill(value);
    await expect.soft(count).toHaveValue(value);
    await expect.soft(page.locator(".advisor-card")).toHaveCount(0);
  }
  await count.fill("13");
  await expect(page.locator(".advisor-card")).toHaveCount(6);
  await page
    .locator(".advisor-card")
    .first()
    .getByRole("button", { name: "Open builder", exact: true })
    .click();
  await page
    .getByLabel("Tournament title", { exact: true })
    .fill("Advisor count cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Participant count", { exact: true }),
  ).toHaveValue("13");
});

for (const count of [2, 512]) {
  test(`creates the supported ${count}-participant boundary exactly`, async ({
    page,
  }) => {
    await playingField(page);
    await page
      .getByLabel("Participant count", { exact: true })
      .fill(String(count));
    const doc = await finish(page);
    expect(doc.participants).toHaveLength(count);
    expect(doc.matches).toHaveLength(count - 1);
    expect(
      new Set(doc.participants.map((participant) => participant.id)).size,
    ).toBe(count);
  });
}

test("preserves explicit singleton groups and displays their standings", async ({
  page,
}) => {
  await playingField(page);
  await page
    .getByLabel("Competition format", { exact: true })
    .selectOption("groups");
  const count = page.getByLabel("Participant count", { exact: true });
  await count.fill("3");
  const groups = page.getByLabel("Number of groups", { exact: true });
  await groups.click();
  await groups.press("ControlOrMeta+A");
  await groups.pressSequentially("2");
  await expect(groups).toHaveValue("2");
  await count.focus();
  const doc = await finish(page);
  expect(doc.participants).toHaveLength(3);
  expect(doc.stages[0].config.groupCount).toBe(2);
  expect(doc.stages[0].metadata.groups).toEqual(
    expect.arrayContaining([
      expect.arrayContaining([expect.any(String), expect.any(String)]),
      [expect.any(String)],
    ]),
  );
  expect(doc.matches.filter((match) => match.status === "bye")).toHaveLength(1);
  await page
    .locator(".workspace-tabs")
    .getByRole("button", { name: "Standings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Group A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Group B", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".standings-table tbody tr")).toHaveCount(3);
});

test("does not change group settings while typing a larger count", async ({
  page,
}) => {
  await playingField(page);
  await page
    .getByLabel("Competition format", { exact: true })
    .selectOption("groups");
  const count = page.getByLabel("Participant count", { exact: true });
  await count.fill("");
  await count.pressSequentially("30");
  await count.press("Tab");
  await expect(
    page.getByLabel("Number of groups", { exact: true }),
  ).toHaveValue("4");
});

test("updates Swiss defaults and validates format-specific participant limits", async ({
  page,
}) => {
  await playingField(page);
  const count = page.getByLabel("Participant count", { exact: true });
  const format = page.getByLabel("Competition format", { exact: true });
  await count.fill("129");
  await format.selectOption("round-robin");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at most 128");
  await expect(count).toHaveValue("129");
  await format.selectOption("gsl");
  await expect(page.getByRole("alert")).toContainText("divisible by four");
  await count.fill("8");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByLabel("Number of groups", { exact: true }),
  ).toHaveCount(0);
  await format.selectOption("swiss");
  await count.fill("2");
  await count.press("Tab");
  await expect(
    page.getByLabel("Number of rounds", { exact: true }),
  ).toHaveValue("1");
  const doc = await finish(page);
  expect(doc.participants).toHaveLength(2);
  expect(doc.stages[0].format).toBe("swiss");
  expect(doc.stages[0].config.rounds).toBe(1);
  expect(doc.matches).toHaveLength(1);
});

test("validates counts from pasted names and preserves them for correction", async ({
  page,
}) => {
  await playingField(page);
  const names = page.getByLabel("Or paste names, one per line", {
    exact: true,
  });
  for (const count of [1, 513]) {
    const input = Array.from(
      { length: count },
      (_, index) => `Entrant ${index + 1}`,
    ).join("\n");
    await names.fill(input);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("whole number");
    await expect(names).toHaveValue(input);
    await expect(names).toBeFocused();
  }
  await names.fill("Comet\nMoon\nSun");
  const doc = await finish(page);
  expect(doc.participants.map((participant) => participant.name)).toEqual([
    "Comet",
    "Moon",
    "Sun",
  ]);
});

test("advisor keeps large fields without offering unsupported standalone round robin", async ({
  page,
}) => {
  await page.goto("/#/advisor");
  const count = page.getByLabel("Participants", { exact: true });
  await count.fill("128");
  await expect(
    page
      .locator(".advisor-card")
      .getByRole("heading", { name: "Round robin", exact: true }),
  ).toBeVisible();
  await count.fill("129");
  await expect(count).toHaveValue("129");
  await expect(
    page
      .locator(".advisor-card")
      .getByRole("heading", { name: "Round robin", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".advisor-card")
      .getByRole("heading", { name: "Groups & pools + playoffs", exact: true }),
  ).toBeVisible();
});

for (const groupedFormat of ["groups", "gsl"] as const) {
  test(`discards hidden round drafts when switching to ${groupedFormat}`, async ({
    page,
  }) => {
    await playingField(page);
    const format = page.getByLabel("Competition format", { exact: true });
    await format.selectOption("swiss");
    await page.getByLabel("Number of rounds", { exact: true }).fill("0");
    await format.selectOption(groupedFormat);
    await expect(
      page.getByLabel("Number of rounds", { exact: true }),
    ).toHaveCount(0);
    const doc = await finish(page);
    expect(doc.stages[0].format).toBe(groupedFormat);
    expect(doc.stages[0].config.rounds).toBe(DEFAULT_CONFIG.rounds);
    expect(doc.participants).toHaveLength(8);
    expect(doc.matches.length).toBeGreaterThan(0);
  });
}
