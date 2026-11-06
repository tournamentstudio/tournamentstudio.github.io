import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, getChampion, recordResult } from "../../src/engine";
import { applySport } from "../../src/sports";

async function open(page: Page, tournament: Tournament, persian: boolean) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import tournament", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "scorecard-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tournament)),
  });
  await dialog.getByRole("button", { name: "Preview import" }).click();
  await dialog.getByRole("button", { name: "Save local copy" }).click();
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
  if (persian)
    await page.getByRole("button", { name: "Switch to Persian" }).click();
}

function fixture(groups: boolean) {
  let tournament = applySport(
    createTournament(
      "Gol Ya Pooch / مسابقات دوستان و همراهان باشگاه گل یا پوچ",
      Array.from({ length: 8 }, (_, index) =>
        createParticipant(
          `تیم دوستان و همراهان ${index + 1} / Club ${index + 1}`,
          index + 1,
        ),
      ),
      groups ? "groups" : "single-elimination",
    ),
    "gol-ya-pooch",
  );
  tournament.stages[0].config.groupCount = 2;
  tournament = generateStage(tournament, tournament.stages[0].id);
  if (!groups) {
    for (
      let match = tournament.matches.find((item) => item.status === "ready");
      match;
      match = tournament.matches.find((item) => item.status === "ready")
    ) {
      tournament = recordResult(tournament, match.id, {
        scores: [6, 0],
        winnerIds: [match.slots[0].participantId!],
        outcome: "played",
        recordedAt: "2026-11-06T12:00:00Z",
      });
    }
  }
  return tournament;
}

for (const persian of [false, true]) {
  const locale = persian ? "Persian" : "English";
  test(`${locale} fixture board groups existing matches without losing scorecards`, async ({
    page,
  }) => {
    const tournament = fixture(true);
    await open(page, tournament, persian);
    await page
      .getByRole("combobox", {
        name: persian ? "بخش مسابقات" : "Tournament section",
        exact: true,
      })
      .selectOption("matches");
    await expect(page.locator(".fixture-round")).toHaveCount(3);
    await expect(page.locator("button.match-tile")).toHaveCount(12);
    for (const round of await page.locator(".fixture-round").all()) {
      await expect(round.locator("button.match-tile")).toHaveCount(4);
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => ({
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        namesFit: [
          ...document.querySelectorAll<HTMLElement>(".match-entrant > bdi"),
        ].every((name) => name.scrollWidth <= name.clientWidth + 1),
      }));
      expect(layout).toEqual({ pageFits: true, namesFit: true });
      const statusLines = await page
        .locator(".workspace-title > .badge")
        .evaluate((badge) => {
          const range = document.createRange();
          range.selectNodeContents(badge);
          return range.getClientRects().length;
        });
      expect(
        statusLines,
        "The status must not split a word beside a long title",
      ).toBe(1);
    }
    const search = page.getByRole("searchbox", {
      name: persian ? "جستجوی دیدارها" : "Search matches",
    });
    await search.fill("Club 1");
    await expect(page.locator("button.match-tile")).toHaveCount(3);
    await page.locator("button.match-tile").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test(`${locale} champion overview leads to recorded results`, async ({
    page,
  }) => {
    const tournament = fixture(false);
    await open(page, tournament, persian);
    const report = page.locator(".champion-report");
    await expect(report.getByRole("heading")).toHaveText(
      getChampion(tournament)!.name,
    );
    await expect(
      page.getByRole("heading", {
        name: persian ? "نتایج نهایی" : "Final results",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("button.match-tile.completed")).toHaveCount(3);
    await expect(
      page.getByText(
        persian ? "اکنون دیداری آماده نیست" : "No matches ready right now",
        { exact: true },
      ),
    ).toHaveCount(0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(report.locator(".game-scene")).toBeVisible();
      if (width < 600) {
        const artwork = await report.locator(".overview-emblem").boundingBox();
        const content = await report.locator(".overview-welcome").boundingBox();
        expect(artwork!.y + artwork!.height).toBeLessThanOrEqual(content!.y);
      }
    }
    await page
      .getByRole("button", {
        name: persian ? "همه دیدارها" : "All matches",
        exact: true,
      })
      .click();
    await expect(page.locator("button.match-tile.completed")).toHaveCount(7);
    await expect(
      page.getByRole("button", {
        name: persian ? "همه دیدارها" : "All matches",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });
}
