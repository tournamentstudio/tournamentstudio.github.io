import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";
import { recordGolHand } from "../../src/engine/gol";
import { applySport } from "../../src/sports";

function fixture(variant: "standard" | "aggregate" | "gol") {
  let doc = createTournament(
    "Score draft review",
    ["Tehran شاهین", "Shiraz ستاره", "Tabriz تیم", "Yazd باشگاه"].map(
      (name, index) => createParticipant(name, index + 1),
    ),
  );
  if (variant === "aggregate")
    doc.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
    };
  if (variant === "gol") doc = applySport(doc, "gol-ya-pooch");
  return generateStage(doc, doc.stages[0].id);
}

function complete(doc: Tournament) {
  while (doc.matches.some((match) => match.status === "ready")) {
    const match = doc.matches.find((item) => item.status === "ready")!;
    doc = recordResult(doc, match.id, {
      scores: [3, 1],
      ...(doc.stages[0].config.aggregate
        ? {
            legs: [
              [2, 0],
              [1, 1],
            ],
          }
        : {}),
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
  }
  return doc;
}

async function saved(page: Page, id: string): Promise<Tournament> {
  return page.evaluate(
    (key) =>
      new Promise<Tournament>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("documents")
            .objectStore("documents")
            .get(key);
          read.onsuccess = () => {
            resolve(read.result.payload);
            database.close();
          };
          read.onerror = () => {
            reject(read.error);
            database.close();
          };
        };
      }),
    id,
  );
}

async function openMatch(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const importer = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await importer.locator('input[type="file"]').setInputFiles({
    name: "draft-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await importer
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await importer
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.locator(`.match-tile.${doc.matches[0].status}`).first().click();
  return page.getByRole("dialog", {
    name: doc.stages[0].config.aggregate
      ? "Aggregate match control"
      : "Match control",
    exact: true,
  });
}

test("reset restores all saved fields and preserves live Gol scores", async ({
  page,
}) => {
  let doc = fixture("gol");
  const first = doc.matches[0];
  doc = recordGolHand(doc, first.id, {
    concealingTeamId: first.slots[0].participantId!,
    awardedToId: first.slots[0].participantId!,
    points: 3,
  });
  doc.matches[0].notes = "Saved private note";
  doc.matches[0].referee = "داور باشگاه";
  const dialog = await openMatch(page, doc);
  const scores = dialog.locator(".score-entry input");
  await expect(scores.first()).toHaveValue("3");
  await scores.first().fill("9");
  await dialog
    .getByLabel("Result type", { exact: true })
    .selectOption("forfeit");
  await dialog
    .getByLabel("Winner decision", { exact: true })
    .selectOption(first.slots[1].participantId!);
  await dialog
    .getByText("Sets, referee, and private notes", { exact: true })
    .click();
  await dialog
    .getByLabel("Set scores (one set per line)", { exact: true })
    .fill("bad set");
  await dialog.getByLabel("Referee", { exact: true }).fill("Changed referee");
  await dialog
    .getByLabel("Private organizer notes", { exact: true })
    .fill("Changed note");
  await dialog
    .getByLabel("Record fair-play penalties", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Enter each set");
  await dialog.getByRole("button", { name: "Reset form", exact: true }).click();
  await expect(scores.first()).toHaveValue("3");
  await expect(scores.nth(1)).toHaveValue("0");
  await expect(dialog.getByLabel("Result type", { exact: true })).toHaveValue(
    "played",
  );
  await expect(
    dialog.getByLabel("Winner decision", { exact: true }),
  ).toHaveValue("");
  await expect(
    dialog.getByLabel("Set scores (one set per line)", { exact: true }),
  ).toHaveValue("");
  await expect(dialog.getByLabel("Referee", { exact: true })).toHaveValue(
    "داور باشگاه",
  );
  await expect(
    dialog.getByLabel("Private organizer notes", { exact: true }),
  ).toHaveValue("Saved private note");
  await expect(
    dialog.getByLabel("Record fair-play penalties", { exact: true }),
  ).not.toBeChecked();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect((await saved(page, doc.id)).matches[0]).toEqual(doc.matches[0]);
});

test("edited scores require a new correction preview before reopening dependents", async ({
  page,
}) => {
  const doc = complete(fixture("standard"));
  const dialog = await openMatch(page, doc);
  const score = dialog.locator(".score-entry input").first();
  await score.fill("4");
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  const confirm = dialog.getByRole("button", {
    name: "Confirm correction and reset dependents",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await score.fill("5");
  await expect(confirm).toHaveCount(0);
  expect((await saved(page, doc.id)).matches[0].result?.scores).toEqual([3, 1]);
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const restored = await saved(page, doc.id);
  expect(restored.matches[0].result?.scores).toEqual([5, 1]);
  expect(restored.matches.at(-1)?.result).toBeUndefined();
});

test("removing aggregate legs invalidates a pending correction", async ({
  page,
}) => {
  const doc = complete(fixture("aggregate"));
  const dialog = await openMatch(page, doc);
  await dialog.getByRole("spinbutton").first().fill("4");
  const submit = dialog.getByRole("button", {
    name: "Confirm aggregate result",
    exact: true,
  });
  const confirm = dialog.getByRole("button", {
    name: "Confirm correction and reset dependents",
    exact: true,
  });
  await submit.click();
  await expect(confirm).toBeVisible();
  await dialog
    .getByRole("button", { name: "Remove last leg", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  await expect(submit).toBeVisible();
  expect((await saved(page, doc.id)).matches[0].result?.scores).toEqual([3, 1]);
  await dialog
    .getByRole("button", { name: "Add next leg", exact: true })
    .click();
  await dialog.getByRole("spinbutton").nth(2).fill("1");
  await dialog.getByRole("spinbutton").nth(3).fill("1");
  await submit.click();
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  expect((await saved(page, doc.id)).matches[0].result?.legs).toEqual([
    [4, 0],
    [1, 1],
  ]);
});

test("undoing a Gol hand clears its concealed position draft without changing possession", async ({
  page,
}) => {
  const doc = fixture("gol");
  const dialog = await openMatch(page, doc);
  await dialog
    .getByRole("button", { name: "Referee mode", exact: true })
    .click();
  const secret = dialog.getByLabel("Concealed position (private)", {
    exact: true,
  });
  const record = dialog.getByRole("button", {
    name: "Record hand",
    exact: true,
  });
  await secret.fill("Test hand position");
  await record.click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  expect(
    (await saved(page, doc.id)).matches[0].private?.concealedPosition,
  ).toBe("Test hand position");
  await dialog
    .getByRole("button", { name: "Undo hand 1", exact: true })
    .click();
  await expect(secret).toHaveValue("");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await record.click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const updated = (await saved(page, doc.id)).matches[0];
  expect(updated.hands).toHaveLength(1);
  expect(updated.private?.concealedPosition).toBeFalsy();
  expect(updated.liveScores).toEqual([doc.rules.gol.handPoints, 0]);
});
