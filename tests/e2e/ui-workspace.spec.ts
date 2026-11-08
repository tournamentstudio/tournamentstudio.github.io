import { expect, test, type Page } from "@playwright/test";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

async function open(page: Page, tournament: Tournament, persian: boolean) {
  await page.goto("/");
  await expect(page.locator(".welcome-page")).toBeVisible();
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "workspace-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tournament)),
  });
  await dialog.getByRole("button", { name: "Preview import" }).click();
  await dialog.getByRole("button", { name: "Save local copy" }).click();
  await expect(page.locator(".workspace-fieldset")).toBeEnabled();
  if (persian) await page.getByTestId("language-select").selectOption("fa");
}

function fixture() {
  const tournament = createTournament(
    "Autumn cup جام پاییز",
    Array.from({ length: 8 }, (_, index) =>
      createParticipant(`Team ${index + 1} تیم`, index + 1),
    ),
    "groups",
  );
  tournament.stages[0].config.groupCount = 2;
  return tournament;
}

for (const persian of [false, true]) {
  const locale = persian ? "Persian" : "English";
  test(`${locale} section picker and navigation stay synchronized`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page, fixture(), persian);
    const picker = page.getByRole("combobox", {
      name: persian ? "بخش مسابقات" : "Tournament section",
      exact: true,
    });
    const desktopTabs = await page.locator(".workspace-tabs").boundingBox();
    const desktopPicker = await picker.boundingBox();
    expect(desktopTabs).not.toBeNull();
    expect(desktopPicker).not.toBeNull();
    expect(desktopPicker!.y).toBeLessThan(desktopTabs!.y + desktopTabs!.height);
    expect(desktopPicker!.y + desktopPicker!.height).toBeGreaterThan(
      desktopTabs!.y,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTabs = await page.locator(".workspace-tabs").boundingBox();
    const mobilePicker = await picker.boundingBox();
    expect(mobileTabs).not.toBeNull();
    expect(mobilePicker).not.toBeNull();
    expect(mobilePicker!.y).toBeGreaterThanOrEqual(
      mobileTabs!.y + mobileTabs!.height,
    );
    expect(mobilePicker!.x).toBeGreaterThanOrEqual(0);
    expect(mobilePicker!.x + mobilePicker!.width).toBeLessThanOrEqual(390);
    await expect(picker).toHaveValue("overview");
    await picker.selectOption("settings");
    await expect(page.locator("#workspace-tab-settings")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("#workspace-section")).toHaveAttribute(
      "aria-labelledby",
      "workspace-tab-settings",
    );
    await page.locator("#workspace-tab-matches").click();
    await expect(picker).toHaveValue("matches");
    await expect(page.locator("#workspace-tab-settings")).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    await picker.selectOption("overview");
    await page
      .locator(".workspace-heading")
      .getByRole("button", {
        name: persian ? "اشتراک" : "Share",
        exact: true,
      })
      .click();
    await expect(picker).toHaveValue("share");
  });

  test(`${locale} draft overview directs organizers to generate a draw`, async ({
    page,
  }) => {
    await open(page, fixture(), persian);
    const overview = page.locator(".overview-welcome");
    await expect(overview.getByRole("heading", { level: 2 })).toHaveText(
      persian ? "قرعه را آماده کنید" : "Set up the draw",
    );
    await overview
      .getByRole("button", {
        name: persian ? "باز کردن ساختار" : "Open structure",
        exact: true,
      })
      .click();
    await expect(page.locator("#workspace-tab-structure")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test(`${locale} group tables retain accessible names without duplicate headings`, async ({
    page,
  }) => {
    const initial = fixture();
    const tournament = generateStage(initial, initial.stages[0].id);
    await open(page, tournament, persian);
    await page
      .getByRole("combobox", {
        name: persian ? "بخش مسابقات" : "Tournament section",
        exact: true,
      })
      .selectOption("standings");
    for (const group of ["A", "B"]) {
      await expect(
        page.getByRole("heading", {
          name: `${persian ? "گروه" : "Group"} ${group}`,
          exact: true,
        }),
      ).toBeVisible();
      const table = page.getByRole("table", {
        name: `${persian ? "جدول رده‌بندی" : "Standings"} · ${group}`,
        exact: true,
      });
      await expect(table).toBeVisible();
      await expect(table.getByRole("rowheader")).toHaveCount(4);
      await expect(table.locator("caption")).toHaveClass("sr-only");
    }
  });
}
