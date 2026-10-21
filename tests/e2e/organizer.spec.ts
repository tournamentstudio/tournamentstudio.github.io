import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import { readWorkbookEntries, writeWorkbook } from "../../src/tabular/xlsx";

async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function create(
  page: Page,
  title = "Organizer cup",
  sport = "generic",
  format = "single-elimination",
) {
  await page.goto("/#/create");
  await page.getByLabel("Tournament title", { exact: true }).fill(title);
  await page.getByLabel("Sport or activity").selectOption(sport);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Competition format").selectOption(format);
  await page.getByLabel("Participant count", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await saved(page);
}
async function participants(page: Page) {
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Participants", exact: true })
    .click();
}
const listInput = (page: Page) =>
  page.locator('input[type="file"][accept=".csv,.txt,.json,.xlsx"]');

test("participant organizer records, availability and logos survive reload", async ({
  page,
}) => {
  await create(page);
  await participants(page);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Edit participant" });
  await dialog.getByLabel("Registration decision").selectOption("waiting");
  await dialog.getByLabel("Eligibility decision").selectOption("eligible");
  await dialog
    .getByRole("combobox", { name: "Payment status", exact: true })
    .selectOption("paid");
  await dialog.getByLabel("Private organizer note").fill("Private review note");
  await dialog.getByLabel("Available from").fill("2026-10-21T09:00");
  await dialog.getByLabel("Available until").fill("2026-10-21T08:00");
  await dialog.getByRole("button", { name: "Save participant" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Availability must end after it starts",
  );
  await dialog.getByLabel("Available until").fill("2026-10-21T18:00");
  const logo = await readFile("public/icon-192.png");
  await dialog
    .getByLabel(/^Participant logo/)
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(dialog.getByAltText("Participant logo preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Save participant" }).click();
  await saved(page);
  await page.reload();
  await participants(page);
  await page.getByLabel("Filter organizer records").selectOption("waiting");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table tbody")).toContainText("Paid");
  await expect(page.locator(".data-table tbody img")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Private organizer note")).toHaveValue(
    "Private review note",
  );
  await expect(dialog.getByLabel("Available until")).toHaveValue(
    "2026-10-21T18:00",
  );
  await dialog.getByRole("button", { name: "Save participant" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Approve registration" }).click();
  await saved(page);
  await expect(page.locator(".data-table tbody tr")).toHaveCount(0);
});

test("rich CSV previews duplicates and preserves imported fields", async ({
  page,
}) => {
  await create(page);
  await participants(page);
  const csv =
    'name,seed,region,organization,checkedIn,roster,payment\r\n"تیم, آفتاب",3,تهران,Club,true,"[{""name"":""Captain"",""role"":""captain""}]",unpaid\r\n"تیم, آفتاب",4,تهران,Club,false,[],paid';
  await listInput(page).setInputFiles({
    name: "participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const preview = page.getByRole("dialog", {
    name: "Preview participant import",
  });
  await expect(
    preview.getByRole("button", { name: "Import reviewed participants" }),
  ).toBeDisabled();
  await preview.getByLabel("Imported name 2", { exact: true }).fill("Team Two");
  await preview
    .getByRole("button", { name: "Import reviewed participants" })
    .click();
  await saved(page);
  await page.getByLabel("Filter organizer records").selectOption("unpaid");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table tbody")).toContainText("تیم, آفتاب");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit participant" });
  await expect(dialog.getByLabel("Player name")).toHaveValue("Captain");
  await expect(dialog.getByLabel("Role", { exact: true })).toHaveValue(
    "captain",
  );
});

test("XLSX values import and private workbook exports roundtrip", async ({
  page,
}) => {
  await create(page);
  await participants(page);
  const workbook = writeWorkbook([
    {
      name: "Players",
      rows: [
        ["name", "seed", "region", "payment"],
        ["تهران", 3, "North", "unpaid"],
        ["=not a formula", 4, "South", "paid"],
      ],
    },
    { name: "Ignored", rows: [["Another sheet"]] },
  ]);
  await listInput(page).setInputFiles({
    name: "participants.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbook),
  });
  const preview = page.getByRole("dialog", {
    name: "Preview participant import",
  });
  await expect(preview).toContainText("Players (2 sheets in file)");
  await expect(preview.getByLabel("Imported name 2")).toHaveValue(
    "=not a formula",
  );
  await preview
    .getByRole("button", { name: "Import reviewed participants" })
    .click();
  await saved(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Private XLSX", exact: true }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(Object.keys(readWorkbookEntries(bytes))).toHaveLength(5);
  await listInput(page).setInputFiles({
    name: "restored.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await expect(preview.getByLabel("Imported name 3")).toHaveValue("تهران");
  await expect(preview.getByLabel("Imported name 4")).toHaveValue(
    "=not a formula",
  );
  await expect(
    preview.getByRole("button", { name: "Import reviewed participants" }),
  ).toBeDisabled();
});

test("XLSX formulas and external relationships are refused", async ({
  page,
}) => {
  await create(page);
  await participants(page);
  const entries = readWorkbookEntries(
    writeWorkbook([{ name: "A", rows: [["name"], ["Player"]] }]),
  );
  const sheet = new TextDecoder().decode(entries["xl/worksheets/sheet1.xml"]);
  entries["xl/worksheets/sheet1.xml"] = strToU8(
    sheet.replace(
      '<is><t xml:space="preserve">Player</t></is>',
      "<f>1+1</f><v>2</v>",
    ),
  );
  await listInput(page).setInputFiles({
    name: "formula.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(zipSync(entries)),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Replace formulas with values",
  );
  entries["xl/worksheets/sheet1.xml"] = strToU8(sheet);
  entries["xl/_rels/workbook.xml.rels"] = strToU8(
    '<Relationships><Relationship Id="rId1" Target="https://example.com" TargetMode="External"/></Relationships>',
  );
  await listInput(page).setInputFiles({
    name: "external.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(zipSync(entries)),
  });
  await expect(page.getByRole("alert")).toContainText(
    "External workbook relationships",
  );
});

test("library sport and format filters select the matching tournaments", async ({
  page,
}) => {
  await create(page, "Chess league", "chess", "round-robin");
  await create(page, "Football cup", "football");
  await page.goto("/#/");
  await page.getByLabel("Filter by sport").selectOption("chess");
  await expect(page.locator(".tournament-card")).toHaveCount(1);
  await expect(page.locator(".tournament-card")).toContainText("Chess league");
  await page.getByLabel("Filter by sport").selectOption("");
  await page.getByLabel("Filter by format").selectOption("single-elimination");
  await expect(page.locator(".tournament-card")).toHaveCount(1);
  await expect(page.locator(".tournament-card")).toContainText("Football cup");
});
