import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { encodeCode } from "../../src/sharing";

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
async function open(page: Page, correctPoints = true) {
  const doc = createTournament(
    "Dutch chess جام شطرنج",
    Array.from({ length: 5 }, (_, i) =>
      createParticipant(
        `باشگاه دانشگاه تهران Player ${i + 1}`,
        i + 1,
        "individual",
      ),
    ),
    "swiss",
    "chess",
  );
  doc.rules.allowDraws = true;
  doc.rules.pointsWin = correctPoints ? 1 : 3;
  doc.rules.pointsDraw = 0.5;
  doc.stages[0].config.rounds = 3;
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await saved(page);
  await section(page, "Structure");
  const panel = page.locator(".swiss-policy-editor");
  await panel.locator(":scope > summary").click();
  return { doc, panel };
}
async function exported(page: Page): Promise<Tournament> {
  await section(page, "Share Center");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("Dutch controls lock pairing numbers and preserve colors in a fresh browser copy", async ({
  page,
  browser,
}) => {
  const { doc, panel } = await open(page);
  await panel
    .getByLabel("Swiss pairing system", { exact: true })
    .selectOption("fide-dutch-2026");
  await panel
    .getByLabel("Initial color from the draw", { exact: true })
    .selectOption("black");
  await panel
    .getByRole("button", { name: "Apply Swiss policy", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await saved(page);
  await expect(
    panel.getByLabel("Swiss pairing system", { exact: true }),
  ).toBeDisabled();
  await panel
    .getByText("Fixed tournament pairing numbers", { exact: true })
    .click();
  await expect(panel.locator("ol > li")).toHaveCount(5);
  const snapshot = await exported(page);
  expect(snapshot.stages[0].config.swiss?.federation).toEqual({
    system: "fide-dutch-2026",
    engine: "bbp-6.0.0-ts1",
    initialColor: "black",
    pairingOrder: doc.participants.map((participant) => participant.id),
  });
  expect(snapshot.matches).toHaveLength(3);
  const pairs = snapshot.matches.map((match) =>
    match.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    ),
  );
  expect(pairs.flat().sort()).toEqual(
    doc.participants.map((participant) => participant.id).sort(),
  );
  // Dutch first round splits the ranked even field; the last player has the bye.
  expect(pairs).toContainEqual([
    doc.participants[2].id,
    doc.participants[0].id,
  ]);
  expect(pairs).toContainEqual([
    doc.participants[1].id,
    doc.participants[3].id,
  ]);
  expect(pairs).toContainEqual([doc.participants[4].id]);
  const copyContext = await browser.newContext();
  try {
    const copy = await copyContext.newPage();
    await copy.goto(
      `${new URL(page.url()).origin}/#/open/${encodeURIComponent(await encodeCode(snapshot))}`,
    );
    await copy
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await saved(copy);
    const restored = await exported(copy);
    expect(restored.matches).toEqual(snapshot.matches);
    expect(restored.stages[0].config.swiss).toEqual(
      snapshot.stages[0].config.swiss,
    );
    await copy.reload();
    await saved(copy);
    await section(copy, "Structure");
    await copy.locator(".swiss-pairing-editor > summary").click();
    await expect(copy.locator(".swiss-pairing-editor")).toContainText("White:");
    await expect(copy.locator(".swiss-pairing-editor select")).toHaveCount(0);
  } finally {
    await copyContext.close();
  }
});

test("Dutch pairing generates the next round offline under the production CSP", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { panel } = await open(page);
  await panel
    .getByLabel("Swiss pairing system", { exact: true })
    .selectOption("fide-dutch-2026");
  await panel
    .getByRole("button", { name: "Apply Swiss policy", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Generate draw", exact: true })
    .click();
  await expect(
    panel.getByLabel("Swiss pairing system", { exact: true }),
  ).toBeDisabled();
  await expect(panel.getByText("Fixed tournament pairing numbers", { exact: true })).toBeVisible();
  await saved(page);
  await section(page, "Matches");
  for (let index = 0; index < 2; index++) {
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", { name: "Match control" });
    await dialog.locator('.score-entry input[type="number"]').nth(0).fill("1");
    await dialog.locator('.score-entry input[type="number"]').nth(1).fill("0");
    await dialog
      .getByRole("button", { name: "Confirm result", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saved(page);
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await saved(page);
  await section(page, "Matches");
  await page.getByRole("button", { name: "Next round", exact: true }).click();
  await expect(page.locator("button.match-tile.ready")).toHaveCount(2);
  await saved(page);
  const snapshot = await exported(page);
  expect(snapshot.matches.filter((match) => match.round === 2)).toHaveLength(3);
  const firstBye = snapshot.matches.find(
    (match) => match.round === 1 && match.status === "bye",
  );
  const secondBye = snapshot.matches.find(
    (match) => match.round === 2 && match.status === "bye",
  );
  expect(firstBye).toBeDefined();
  expect(secondBye?.slots[0].participantId).not.toBe(
    firstBye?.slots[0].participantId,
  );
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test("Persian Dutch settings explain incompatible scoring and reflow at 320 pixels", async ({
  page,
}) => {
  await open(page, false);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 900 });
  const panel = page.locator(".swiss-policy-editor");
  await panel
    .getByLabel("سامانه زوج‌بندی سوئیسی", { exact: true })
    .selectOption("fide-dutch-2026");
  await panel
    .getByRole("button", { name: "اعمال سیاست سوئیسی", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("هلندی");
  await expect(panel.getByRole("alert")).not.toContainText(
    "FIDE Dutch requires",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const findings = await new AxeBuilder({ page })
    .include(".swiss-policy-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(findings.violations).toEqual([]);
});
