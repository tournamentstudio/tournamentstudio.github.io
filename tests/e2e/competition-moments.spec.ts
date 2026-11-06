import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Locale,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

const words = (locale: Locale, en: string, fa: string) =>
  locale === "fa" ? fa : en;
const title = "جام آفتاب Open Hands Championship";
const longName = "شاهین‌های آفتاب باشگاه دوستان Sunshine Sporting Club";

function fixture(completed = true) {
  let tournament = createTournament(
    title,
    [longName, "باران Rain"].map((name, index) =>
      createParticipant(name, index + 1),
    ),
    "single-elimination",
    "gol-ya-pooch",
  );
  tournament = generateStage(tournament, tournament.stages[0].id);
  if (completed) tournament = simulate(tournament);
  tournament.matches[0].private = { concealedPosition: "REFEREE-ONLY-MOMENT" };
  tournament.theme.preset = "gol-traditional";
  tournament.theme.design = { textAlign: "center", fontWeight: 500 };
  tournament.theme.fontScale = 1.1;
  tournament.theme.reducedMotion = true;
  tournament.presentation.autoRotate = false;
  tournament.presentation.scenes = [
    "title",
    "current",
    "results",
    "champion",
  ].map((type) => ({
    id: type,
    type: type as "title",
    title: "",
    text: "",
    duration: 30,
  }));
  return tournament;
}

async function importTournament(
  page: Page,
  locale: Locale,
  tournament: Tournament,
) {
  await page.addInitScript(
    (value) => localStorage.setItem("tournastudio-locale", value),
    locale,
  );
  await page.goto(
    `/#/open/${encodeURIComponent(await encodeCode(tournament))}`,
  );
  await page
    .getByRole("button", {
      name: words(locale, "Save local copy", "ذخیره کپی محلی"),
      exact: true,
    })
    .click();
  await expect(page.locator(".save-status")).toHaveText(
    words(locale, "Saved locally", "محلی ذخیره شد"),
  );
  return page.url().replace("#/t/", "#/present/");
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page
      .locator(".presentation-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
}

for (const locale of ["en", "fa"] as const) {
  test(`${locale} draw tickets keep long names clear and show actual reveal progress`, async ({
    page,
  }) => {
    const tournament = createTournament(
      title,
      [longName, "باران Rain"].map((name, index) =>
        createParticipant(name, index + 1),
      ),
      "single-elimination",
      "gol-ya-pooch",
    );
    tournament.theme.preset = "gol-traditional";
    tournament.theme.reducedMotion = true;
    await importTournament(page, locale, tournament);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("combobox", {
        name: words(locale, "Tournament section", "بخش مسابقات"),
        exact: true,
      })
      .selectOption("structure");
    await page
      .getByRole("button", {
        name: words(locale, "Preview knockout draw", "پیش‌نمایش قرعه حذفی"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: words(locale, "Present this draw", "نمایش مراسم این قرعه"),
        exact: true,
      })
      .click();
    const ceremony = page.locator(".draw-ceremony");
    const progress = ceremony.getByRole("progressbar");
    await expect(progress).toHaveAttribute("value", "0");
    await ceremony
      .getByRole("button", {
        name: words(locale, "Reveal next", "آشکارسازی بعدی"),
        exact: true,
      })
      .click();
    await expect(progress).toHaveAttribute("value", "1");
    await expect(ceremony.locator(".draw-reveal-name")).toContainText(longName);
    await expect(ceremony.locator(".draw-reveal-card")).toHaveCSS(
      "animation-name",
      "none",
    );
    const art = (await ceremony.locator(".draw-ceremony-art").boundingBox())!;
    const name = (await ceremony.locator(".draw-reveal-name").boundingBox())!;
    expect(art.y + art.height).toBeLessThanOrEqual(name.y);
    expect(
      await ceremony.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await ceremony
      .getByRole("button", {
        name: words(locale, "Reveal all", "آشکارسازی همه"),
        exact: true,
      })
      .click();
    await expect(progress).toHaveAttribute("value", "2");
  });

  for (const aspect of ["16:9", "4:3", "9:16"] as const) {
    test(`${locale} competition moments preserve facts and separate artwork at ${aspect}`, async ({
      page,
    }) => {
      const tournament = fixture();
      tournament.presentation.aspect = aspect;
      const url = await importTournament(page, locale, tournament);
      await page.goto(url);
      const next = page.getByRole("button", {
        name: words(locale, "Next scene", "نمای بعدی"),
        exact: true,
      });
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.reload();
        await expect(page.locator(".presentation-program h1")).toHaveText(
          title,
        );
        await expect(page.locator(".presentation-program")).toHaveCSS(
          "text-align",
          "center",
        );
        await expect(page.locator(".presentation-scene")).toHaveCSS(
          "animation-name",
          "none",
        );
        const copy = (await page
          .locator(".presentation-program-copy")
          .boundingBox())!;
        const art = (await page
          .locator(".presentation-program-art")
          .boundingBox())!;
        expect(
          copy.x + copy.width <= art.x + 1 ||
            art.x + art.width <= copy.x + 1 ||
            copy.y + copy.height <= art.y + 1,
        ).toBe(true);
        await noHorizontalOverflow(page);
        await next.click();
        const board = page.getByTestId("presentation-scoreboard");
        await expect(board.locator("h2").first()).toContainText(longName);
        const scoreBoxes = await board
          .locator(".scorecard-value")
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().top),
          );
        expect(Math.abs(scoreBoxes[0] - scoreBoxes[1])).toBeLessThan(2);
        await noHorizontalOverflow(page);
        await next.click();
        await expect(page.locator(".competition-result")).toHaveCount(1);
        await expect(
          page.locator(".competition-result-entrants strong"),
        ).toHaveText(
          tournament.matches[0].result!.scores.map((score) =>
            score.toLocaleString(locale),
          ),
        );
        await noHorizontalOverflow(page);
        await next.click();
        const winner = tournament.participants.find(
          (participant) =>
            participant.id === tournament.matches[0].result?.winnerIds[0],
        )!;
        await expect(page.locator(".competition-champion h1")).toHaveText(
          winner.name,
        );
        await expect(page.locator(".competition-champion-place")).toHaveText(
          (1).toLocaleString(locale),
        );
        await noHorizontalOverflow(page);
        expect(
          await page.locator(".presentation-shell").textContent(),
        ).not.toContain("REFEREE-ONLY-MOMENT");
      }
    });
  }

  test(`${locale} hides scores in result sheets and keeps undecided winners honest`, async ({
    page,
  }) => {
    const completed = fixture();
    completed.presentation.showScores = false;
    await page.goto(await importTournament(page, locale, completed));
    const next = page.getByRole("button", {
      name: words(locale, "Next scene", "نمای بعدی"),
      exact: true,
    });
    await next.click();
    await expect(page.locator(".scorecard-value")).toHaveText(["·", "·"]);
    await next.click();
    await expect(
      page.locator(".competition-result-entrants strong"),
    ).toHaveCount(0);
    await expect(page.locator(".competition-result-entrants")).toContainText(
      longName,
    );
    const pending = fixture(false);
    pending.presentation.scenes = [
      { id: "champion", type: "champion", title: "", text: "", duration: 30 },
    ];
    await page.goto(await importTournament(page, locale, pending));
    await expect(page.locator(".competition-champion h1")).toHaveText(
      words(
        locale,
        "A champion is yet to be crowned",
        "قهرمان هنوز مشخص نشده است",
      ),
    );
    await expect(page.locator(".competition-champion-place")).toHaveCount(0);
  });
}
