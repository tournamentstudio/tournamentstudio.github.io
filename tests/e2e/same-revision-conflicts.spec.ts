import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";
import { encodeCode, sealDocument } from "../../src/sharing";
import { applySport } from "../../src/sports";

async function openTournament(
  page: Page,
  variant: "standard" | "aggregate" | "gol" = "standard",
) {
  let draft = createTournament("Original local cup", [
    createParticipant("Tehran شاهین", 1),
    createParticipant("Isfahan ستاره", 2),
  ]);
  if (variant === "aggregate")
    draft.stages[0].config.aggregate = {
      version: 1,
      legs: 2,
      tieBreak: "manual",
    };
  if (variant === "gol") draft = applySport(draft, "gol-ya-pooch");
  const doc = generateStage(draft, draft.stages[0].id);
  await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
  await page
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  return readSaved(page, doc.id);
}

async function readSaved(page: Page, id: string): Promise<Tournament> {
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

// Model a same-ID reimport from another tab at the IndexedDB boundary.
async function replaceSaved(page: Page, doc: Tournament, notify: boolean) {
  await page.evaluate(
    ({ serialized, sendNotice }) => {
      const document = JSON.parse(serialized) as Tournament;
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("TournaStudio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("documents", "readwrite");
          const table = transaction.objectStore("documents");
          const read = table.get(document.id);
          read.onsuccess = () =>
            table.put({
              ...read.result,
              title: document.title,
              payload: document,
              revisionHash: document.revisionHash,
            });
          transaction.oncomplete = () => {
            database.close();
            if (sendNotice) {
              const channel = new BroadcastChannel("tournastudio-revisions");
              channel.postMessage({
                id: document.id,
                revision: document.revision,
              });
              channel.close();
            }
            resolve();
          };
          transaction.onerror = () => {
            reject(transaction.error);
            database.close();
          };
        };
      });
    },
    { serialized: JSON.stringify(doc), sendNotice: notify },
  );
}

test("reloads a replacement with the same revision after a notice or missed-notice focus", async ({
  page,
}) => {
  const original = await openTournament(page);
  const replacement = await sealDocument({
    ...original,
    title: "Replacement from another tab",
  });
  expect(replacement.revision).toBe(original.revision);
  expect(replacement.revisionHash).not.toBe(original.revisionHash);
  await replaceSaved(page, replacement, true);
  await expect(page.locator(".workspace-title h1")).toHaveText(
    replacement.title,
  );
  const missed = await sealDocument({
    ...replacement,
    title: "Replacement while tab was hidden",
  });
  await replaceSaved(page, missed, false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".workspace-title h1")).toHaveText(missed.title);
  expect(await readSaved(page, original.id)).toEqual(missed);
});

test("a stale score editor cannot overwrite a same-revision replacement", async ({
  page,
}) => {
  const original = await openTournament(page);
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  await dialog.getByRole("spinbutton").first().fill("4");
  await dialog.getByRole("spinbutton").nth(1).fill("2");
  const replacement = await sealDocument({
    ...original,
    title: "Keep the replacement",
  });
  await replaceSaved(page, replacement, false);
  await dialog
    .getByRole("button", { name: "Confirm result", exact: true })
    .click();
  await expect(
    page.getByText(/Another tab changed this tournament/),
  ).toBeVisible();
  expect(await readSaved(page, original.id)).toEqual(replacement);
  await page.reload();
  await expect(page.locator(".workspace-title h1")).toHaveText(
    replacement.title,
  );
  expect(
    (await readSaved(page, original.id)).matches[0].result,
  ).toBeUndefined();
});

for (const variant of ["standard", "aggregate"] as const)
  test(`${variant} score drafts stay visible and cannot overwrite a notified replacement`, async ({
    page,
  }) => {
    const original = await openTournament(page, variant);
    await page
      .getByRole("navigation", { name: "Tournament sections" })
      .getByRole("button", { name: "Matches", exact: true })
      .click();
    await page.locator("button.match-tile.ready").first().click();
    const dialog = page.getByRole("dialog", {
      name:
        variant === "aggregate" ? "Aggregate match control" : "Match control",
      exact: true,
    });
    await dialog.getByRole("spinbutton").first().fill("4");
    await dialog.getByRole("spinbutton").nth(1).fill("2");
    const played = recordResult(original, original.matches[0].id, {
      scores: [0, 5],
      ...(variant === "aggregate"
        ? {
            legs: [
              [0, 3],
              [0, 2],
            ],
          }
        : {}),
      winnerIds: [original.matches[0].slots[1].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    const replacement = await sealDocument({
      ...played,
      title: "Official result from another tab",
    });
    await replaceSaved(page, replacement, true);
    await expect(page.locator(".workspace-title h1")).toHaveText(
      replacement.title,
    );
    await expect(dialog.getByRole("alert")).toContainText(
      "Your draft is shown below for reference",
    );
    await expect(dialog.getByRole("spinbutton").first()).toHaveValue("4");
    await expect(dialog.getByRole("spinbutton").nth(1)).toHaveValue("2");
    await expect(dialog.getByRole("spinbutton").first()).toBeDisabled();
    await expect(
      dialog.getByRole("button", {
        name:
          variant === "aggregate"
            ? "Confirm aggregate result"
            : "Confirm result",
        exact: true,
      }),
    ).toBeDisabled();
    expect(await readSaved(page, original.id)).toEqual(replacement);
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await page.locator("button.match-tile.completed").first().click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByRole("spinbutton").first()).toHaveValue("0");
    await expect(dialog.getByRole("spinbutton").nth(1)).toHaveValue(
      variant === "aggregate" ? "3" : "5",
    );
    await expect(dialog.getByRole("spinbutton").first()).toBeEnabled();
  });

test("local referee saves preserve the open hand-entry session", async ({
  page,
}) => {
  const original = await openTournament(page, "gol");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Matches", exact: true })
    .click();
  await page.locator("button.match-tile.ready").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  const referee = dialog.getByRole("button", {
    name: "Referee mode",
    exact: true,
  });
  await referee.click();
  const handPoints = dialog.getByRole("spinbutton", {
    name: "Hand points",
    exact: true,
  });
  await handPoints.fill("2");
  for (let count = 1; count <= 2; count++) {
    await dialog
      .getByRole("button", { name: "Record hand", exact: true })
      .click();
    await expect
      .poll(async () => (await readSaved(page, original.id)).revision)
      .toBe(original.revision + count);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    await expect(referee).toHaveAttribute("aria-pressed", "true");
    await expect(handPoints).toHaveValue("2");
    await expect(handPoints).toBeEnabled();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  }
  const saved = await readSaved(page, original.id);
  expect(saved.matches[0].hands).toHaveLength(2);
  expect(saved.matches[0].liveScores).toEqual([4, 0]);
});
