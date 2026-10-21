import { test, expect, type Page } from "@playwright/test";
import { createParticipant, createTournament } from "../../src/domain/types";
import { DEFAULT_SWISS_POLICY } from "../../src/domain/swiss";
import { generateStage, recordResult } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true })
    .click();
}
for (const named of [false, true]) {
  test(`${named ? "Dutch" : "Accelerated general"} Swiss can reset qualified entrants and generate a fresh draw`, async ({
    page,
  }) => {
    let doc = createTournament(
      "Qualifier reset",
      Array.from({ length: 4 }, (_, i) =>
        createParticipant(`Player ${i + 1}`, i + 1),
      ),
      "round-robin",
      "chess",
    );
    Object.assign(doc.rules, {
      pointsWin: 1,
      pointsDraw: 0.5,
      pointsLoss: 0,
      allowDraws: true,
      tieBreakers: ["points", "seed"],
    });
    const source = doc.stages[0];
    doc = generateStage(doc, source.id);
    for (const match of doc.matches)
      doc = recordResult(doc, match.id, {
        scores: [1, 0],
        winnerIds: [match.slots[0].participantId!],
        outcome: "played",
        recordedAt: doc.updatedAt,
      });
    const target = structuredClone(doc.stages[0]);
    target.id = "swiss-final";
    target.name = "Swiss final";
    target.format = "swiss";
    target.order = 1;
    target.status = "draft";
    target.metadata = {};
    target.config.rounds = 3;
    target.config.swiss = {
      ...DEFAULT_SWISS_POLICY,
      ...(named
        ? {
            federation: {
              system: "fide-dutch-2026" as const,
              engine: "bbp-6.0.0-ts1" as const,
              initialColor: "white" as const,
            },
          }
        : {
            acceleration: {
              policy: "fixed-group-v1" as const,
              rounds: 1,
              points: 1,
              participantIds: target.participantIds.slice(0, 2),
            },
          }),
    };
    target.sources = [{ stageId: source.id, count: 4, perGroup: false }];
    doc.stages.push(target);
    doc = generateStage(doc, target.id);
    await page.goto(`/#/open/${encodeURIComponent(await encodeCode(doc))}`);
    await page
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await section(page, "Structure");
    await page
      .getByLabel("Selected stage", { exact: true })
      .selectOption(target.id);
    await page
      .getByRole("button", { name: "Reset unplayed draw", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Reset unplayed draw?",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset unplayed draw", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    await page.reload();
    await section(page, "Structure");
    await page
      .getByLabel("Selected stage", { exact: true })
      .selectOption(target.id);
    await page.locator(".swiss-policy-editor > summary").click();
    if (!named)
      await expect(
        page.getByLabel("Use temporary pairing points", { exact: true }),
      ).not.toBeChecked();
    await page
      .getByRole("button", { name: "Generate draw", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reset unplayed draw", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".save-status")).toHaveText("Saved locally");
    await section(page, "Matches");
    await page.getByLabel("Stage", { exact: true }).selectOption(target.id);
    await expect(page.locator("button.match-tile.ready")).toHaveCount(2);
  });
}
