import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage, recordResult } from "../../src/engine";

const names = ["Cedar سرو", "Laleh لاله", "Sepehr سپهر", "Saffron زعفران"];

function makeTournament(
  format: Tournament["stages"][number]["format"] = "single-elimination",
) {
  const doc = createTournament(
    "Community Cup / جام دوستان",
    names.map((name, index) => createParticipant(name, index + 1)),
    format,
  );
  if (format === "swiss") doc.stages[0].config.rounds = 3;
  return generateStage(doc, doc.stages[0].id);
}

function finish(
  doc: Tournament,
  matchId: string,
  outcome: "played" | "forfeit" = "played",
) {
  const match = doc.matches.find((item) => item.id === matchId)!;
  return recordResult(doc, matchId, {
    scores: outcome === "forfeit" ? [0, 0] : [2, 0],
    winnerIds: [match.slots[0].participantId!],
    outcome,
    recordedAt: "2026-11-06T16:00:00Z",
  });
}

async function open(page: Page, doc: Tournament, fa: boolean) {
  await page.goto("/");
  await expect(page.locator(".welcome-page")).toBeVisible();
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "match-workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await dialog.getByRole("button", { name: "Preview import" }).click();
  await dialog.getByRole("button", { name: "Save local copy" }).click();
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
  if (fa) await page.getByTestId("language-select").selectOption("fa");
  await page
    .getByRole("combobox", {
      name: fa ? "بخش مسابقات" : "Tournament section",
      exact: true,
    })
    .selectOption("matches");
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-${width}.png`),
      fullPage: true,
    });
  }
}

for (const fa of [false, true]) {
  const language = fa ? "Persian" : "English";
  const label = (en: string, persian: string) => (fa ? persian : en);

  test(`${language} stage selection filters matches and overview shows all matches`, async ({
    page,
  }, testInfo) => {
    let doc = makeTournament("round-robin");
    const firstId = doc.stages[0].id;
    doc.stages[0].name = "Morning / صبح";
    doc.stages.push({
      ...structuredClone(doc.stages[0]),
      id: "afternoon-stage",
      name: "Afternoon / عصر",
      order: 1,
      status: "draft",
    });
    doc = generateStage(doc, "afternoon-stage");
    await open(page, doc, fa);
    const cards = page.locator("button.match-tile");
    await expect(cards).toHaveCount(12);
    const stage = page.getByRole("combobox", {
      name: label("Filter by stage", "فیلتر بر اساس مرحله"),
    });
    await stage.selectOption(firstId);
    await expect(cards).toHaveCount(6);
    await expect(
      page.getByRole("button", {
        name: label("Generate next round", "ساخت دور بعد"),
      }),
    ).toHaveCount(0);
    await capture(page, testInfo, "stage-filter");
    await page
      .getByRole("searchbox", {
        name: label("Search matches", "جستجوی دیدارها"),
      })
      .fill("No matching participant");
    await page
      .getByRole("button", {
        name: label("Show all matches", "نمایش همه دیدارها"),
        exact: true,
      })
      .click();
    await expect(cards).toHaveCount(12);
    await stage.selectOption(firstId);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", {
        name: label("Tournament section", "بخش مسابقات"),
        exact: true,
      })
      .selectOption("overview");
    await page
      .getByRole("button", {
        name: label("All matches", "همه دیدارها"),
        exact: true,
      })
      .click();
    await expect(cards).toHaveCount(12);
    await expect(stage).toHaveValue("");
  });

  test(`${language} next round waits for current Swiss results`, async ({
    page,
  }) => {
    await open(page, makeTournament("swiss"), fa);
    const next = page.getByRole("button", {
      name: label("Generate next round", "ساخت دور بعد"),
      exact: true,
    });
    await expect(next).toBeDisabled();
    await expect(page.locator("#next-round-help")).toBeVisible();
    for (let index = 0; index < 2; index++) {
      await page.locator("button.match-tile").first().click();
      await page
        .getByRole("dialog")
        .locator(".score-entry input")
        .nth(0)
        .fill("2");
      await page
        .getByRole("button", {
          name: label("Save result", "ذخیره نتیجه"),
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".workspace-fieldset")).toBeEnabled();
    }
    await expect(next).toBeEnabled();
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await next.click();
    await expect(page.locator("button.match-tile")).toHaveCount(2);
    await expect(next).toBeDisabled();
    await expect(page.locator(".fixture-round-heading h3")).toHaveText(
      label("Round 2", "دور ۲"),
    );
  });

  test(`${language} editing ordinary scores recalculates the winner`, async ({
    page,
  }, testInfo) => {
    let doc = makeTournament();
    const match = doc.matches.find((item) => item.status === "ready")!;
    doc = finish(doc, match.id);
    await open(page, doc, fa);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await page.locator("button.match-tile").first().click();
    const dialog = page.getByRole("dialog", {
      name: label("Edit result", "ویرایش نتیجه"),
    });
    const scores = dialog.locator(".score-entry input");
    await expect(
      dialog.getByLabel(label("Winner", "برنده"), { exact: true }),
    ).toHaveValue("");
    await scores.nth(0).fill("0");
    await scores.nth(1).fill("2");
    await dialog
      .getByRole("button", { name: label("Discard edits", "لغو ویرایش‌ها") })
      .click();
    await expect(scores.nth(0)).toHaveValue("2");
    await expect(scores.nth(1)).toHaveValue("0");
    await scores.nth(0).fill("0");
    await scores.nth(1).fill("2");
    await capture(page, testInfo, "edit-result");
    await dialog
      .getByRole("button", { name: label("Save changes", "ذخیره تغییرات") })
      .click();
    await expect(dialog).toHaveCount(0);
    const winningName = doc.participants.find(
      (participant) => participant.id === match.slots[1].participantId,
    )!.name;
    await expect(page.locator("button.match-tile .winner bdi")).toHaveText(
      winningName,
    );
  });

  test(`${language} editing a forfeit keeps the declared winner`, async ({
    page,
  }) => {
    let doc = makeTournament();
    const match = doc.matches.find((item) => item.status === "ready")!;
    doc = finish(doc, match.id, "forfeit");
    await open(page, doc, fa);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await page.locator("button.match-tile").first().click();
    const dialog = page.getByRole("dialog");
    const winner = dialog.getByLabel(label("Winner", "برنده"), { exact: true });
    const selectedName = await winner.locator("option:checked").textContent();
    expect(selectedName).toBe(
      doc.participants.find(
        (participant) => participant.id === match.slots[0].participantId,
      )!.name,
    );
    await dialog.locator(".score-entry input").nth(0).fill("1");
    await expect(winner.locator("option:checked")).toHaveText(selectedName!);
    await dialog
      .getByRole("button", { name: label("Save changes", "ذخیره تغییرات") })
      .click();
    await expect(dialog).toHaveCount(0);
  });

  test(`${language} set scoring is visible and calculates sets won`, async ({
    page,
  }, testInfo) => {
    const doc = makeTournament();
    doc.rules.scoring = "sets";
    doc.rules.bestOf = 3;
    await open(page, doc, fa);
    await page.locator("button.match-tile").first().click();
    const dialog = page.getByRole("dialog", {
      name: label("Enter result", "ثبت نتیجه"),
    });
    const sets = dialog.getByLabel(
      label("Set scores (one set per line)", "امتیاز ست‌ها (هر ست در یک خط)"),
    );
    await expect(sets).toBeVisible();
    await sets.fill("21:18\n21:16");
    const scores = dialog.locator(".score-entry input");
    await expect(scores.nth(0)).toHaveValue("2");
    await expect(scores.nth(1)).toHaveValue("0");
    await expect(scores.nth(0)).toHaveAttribute("readonly", "");
    await capture(page, testInfo, "set-scoring");
    await dialog
      .getByRole("button", { name: label("Save result", "ذخیره نتیجه") })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await expect(page.locator("button.match-tile")).toHaveCount(1);
    await expect(
      page.locator("button.match-tile .match-entrant strong"),
    ).toHaveText(["2", "0"]);
  });

  test(`${language} notes edits preserve an explicit manual-scoring winner`, async ({
    page,
  }) => {
    let doc = makeTournament();
    doc.rules.scoring = "manual";
    const match = doc.matches.find((item) => item.status === "ready")!;
    doc = recordResult(doc, match.id, {
      scores: [0, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-11-06T16:00:00Z",
    });
    await open(page, doc, fa);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await page.locator("button.match-tile").first().click();
    const dialog = page.getByRole("dialog");
    const winnerName = doc.participants.find(
      (participant) => participant.id === match.slots[0].participantId,
    )!.name;
    await expect(
      dialog
        .getByLabel(label("Winner", "برنده"), { exact: true })
        .locator("option:checked"),
    ).toHaveText(winnerName);
    await dialog
      .getByText(
        label(
          "Sets, referee, and private notes",
          "ست‌ها، داور و یادداشت خصوصی",
        ),
        { exact: true },
      )
      .click();
    await dialog
      .getByLabel(
        label("Private organizer notes", "یادداشت خصوصی برگزارکننده"),
        { exact: true },
      )
      .fill("Referee decision reviewed");
    await dialog
      .getByRole("button", {
        name: label("Save changes", "ذخیره تغییرات"),
        exact: true,
      })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("button.match-tile .winner bdi")).toHaveText(
      winnerName,
    );
  });

  test(`${language} result correction names the later matches it will clear`, async ({
    page,
  }) => {
    let doc = makeTournament();
    const firstMatchId = doc.matches.find(
      (item) => item.status === "ready",
    )!.id;
    for (
      let match = doc.matches.find((item) => item.status === "ready");
      match;
      match = doc.matches.find((item) => item.status === "ready")
    )
      doc = finish(doc, match.id);
    await open(page, doc, fa);
    await page
      .getByRole("button", {
        name: label("Completed", "پایان‌یافته"),
        exact: true,
      })
      .click();
    await page
      .locator("button.match-tile")
      .nth(doc.matches.findIndex((match) => match.id === firstMatchId))
      .click();
    const dialog = page.getByRole("dialog");
    const scores = dialog.locator(".score-entry input");
    await scores.nth(0).fill("0");
    await scores.nth(1).fill("2");
    await dialog
      .getByRole("button", { name: label("Save changes", "ذخیره تغییرات") })
      .click();
    await expect(dialog.locator(".correction-warning li")).toHaveCount(1);
    const confirm = dialog.getByRole("button", {
      name: label(
        "Save correction and clear later matches",
        "ذخیره اصلاح و پاک کردن دیدارهای بعدی",
      ),
    });
    await expect(confirm).toBeVisible();
    await dialog
      .getByRole("button", {
        name: label("Keep current result", "حفظ نتیجه فعلی"),
      })
      .click();
    await expect(confirm).toHaveCount(0);
    await dialog
      .getByRole("button", { name: label("Save changes", "ذخیره تغییرات") })
      .click();
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("button.match-tile")).toHaveCount(2);
    await page
      .getByRole("button", {
        name: label("Ready to play", "آماده بازی"),
        exact: true,
      })
      .click();
    await expect(page.locator("button.match-tile")).toHaveCount(1);
  });
}
