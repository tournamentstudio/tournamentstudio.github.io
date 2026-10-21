import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../../src/domain/types";
import { generateStage } from "../../src/engine";

async function importTournament(page: Page, doc: Tournament) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "custom-fields.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
function fixture() {
  const doc = createTournament("Custom field cup", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
  return generateStage(doc, doc.stages[0].id);
}
async function fields(page: Page, persian = false) {
  await page
    .getByRole("navigation", {
      name: persian ? "بخش‌های مسابقات" : "Tournament sections",
    })
    .getByRole("button", { name: persian ? "قوانین" : "Rules", exact: true })
    .click();
  const studio = page.locator(".custom-fields-studio");
  await studio.locator("summary").click();
  return studio;
}
async function numericField(page: Page) {
  const studio = await fields(page);
  await studio
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await studio
    .getByLabel("Field label", { exact: true })
    .fill("Private budget");
  await studio
    .getByLabel("Field scope", { exact: true })
    .selectOption("tournament");
  await studio.getByLabel("Field type", { exact: true }).selectOption("number");
  await studio.getByLabel("Minimum value", { exact: true }).fill("10");
  await studio.getByLabel("Maximum value", { exact: true }).fill("20");
  await studio
    .getByLabel("Required when saving values", { exact: true })
    .check();
  await expect(
    studio.getByLabel("Include this field in public snapshots", {
      exact: true,
    }),
  ).not.toBeChecked();
  await studio
    .getByRole("button", { name: "Save field definition", exact: true })
    .click();
  await expect(
    studio.getByRole("button", {
      name: "Edit field Private budget",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  return studio;
}

test("creates a private numeric field, rejects invalid ranges, and saves decimal values across reload", async ({
  page,
}) => {
  await importTournament(page, fixture());
  let studio = await numericField(page);
  await studio.getByLabel("Private budget *", { exact: true }).fill("25");
  await studio
    .getByRole("button", { name: "Save record values", exact: true })
    .click();
  await expect(studio.getByRole("alert")).toContainText(
    "Invalid value for Private budget.",
  );
  await studio.getByLabel("Private budget *", { exact: true }).fill("15.5");
  await studio
    .getByRole("button", { name: "Save record values", exact: true })
    .click();
  await expect(studio.getByRole("alert")).toHaveCount(0);
  await expect(
    studio.getByLabel("Private budget *", { exact: true }),
  ).toHaveValue("15.5");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.reload();
  studio = await fields(page);
  await expect(
    studio.getByLabel("Private budget *", { exact: true }),
  ).toHaveValue("15.5");
  await studio
    .getByRole("button", { name: "Edit field Private budget", exact: true })
    .click();
  await studio.getByLabel("Maximum value", { exact: true }).fill("12");
  await studio
    .getByRole("button", { name: "Save field definition", exact: true })
    .click();
  await expect(studio.getByRole("alert")).toContainText(
    "Invalid value for Private budget.",
  );
  await expect(studio.getByLabel("Field label", { exact: true })).toHaveValue(
    "Private budget",
  );
});

test("exports only explicitly public fields and reconstructs them in an independent browser", async ({
  page,
  browser,
}) => {
  await importTournament(page, fixture());
  const studio = await numericField(page);
  await studio.getByLabel("Private budget *", { exact: true }).fill("15.5");
  await studio
    .getByRole("button", { name: "Save record values", exact: true })
    .click();
  await expect(
    studio.getByLabel("Private budget *", { exact: true }),
  ).toHaveValue("15.5");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await studio
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await studio.getByLabel("Field label", { exact: true }).fill("Public motto");
  await studio
    .getByLabel("Field scope", { exact: true })
    .selectOption("tournament");
  await studio
    .getByLabel("Include this field in public snapshots", { exact: true })
    .check();
  await studio
    .getByRole("button", { name: "Save field definition", exact: true })
    .click();
  await expect(
    studio.getByRole("button", {
      name: "Edit field Public motto",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await studio
    .getByLabel("Public motto", { exact: true })
    .fill("رقابت برای همه <script>text only</script>");
  await studio
    .getByRole("button", { name: "Save record values", exact: true })
    .click();
  await expect(studio.getByLabel("Public motto", { exact: true })).toHaveValue(
    "رقابت برای همه <script>text only</script>",
  );
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Share Center", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const downloaded = await downloading,
    data = await readFile((await downloaded.path())!),
    json = JSON.parse(data.toString());
  expect(data.toString()).not.toContain("Private budget");
  expect(data.toString()).not.toContain("15.5");
  expect(json.metadata.fieldDefinitions.fields).toHaveLength(1);
  expect(json.metadata.fieldDefinitions.fields[0]).toMatchObject({
    label: "Public motto",
    public: true,
  });
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await importTournament(recipient, json);
    const copied = await fields(recipient);
    await expect(
      copied.getByLabel("Public motto", { exact: true }),
    ).toHaveValue("رقابت برای همه <script>text only</script>");
    await expect(
      copied.getByText("Private budget", { exact: true }),
    ).toHaveCount(0);
    await expect(recipient.locator('script:has-text("text only")')).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});

test("Persian custom field controls fit 320 pixels and pass automated AA checks", async ({
  page,
}) => {
  await importTournament(page, fixture());
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  const studio = await fields(page, true);
  await studio
    .getByRole("button", { name: "افزودن فیلد سفارشی", exact: true })
    .click();
  const label =
    "مقدار خصوصی مورد نیاز برگزارکننده برای بررسی وضعیت شرکت‌کننده پیش از آغاز مسابقات";
  await studio.getByLabel("عنوان فیلد", { exact: true }).fill(label);
  await studio
    .getByLabel("دامنه فیلد", { exact: true })
    .selectOption("tournament");
  await studio.getByLabel("نوع فیلد", { exact: true }).selectOption("number");
  await studio.getByLabel("کمترین مقدار", { exact: true }).fill("10");
  await studio.getByLabel("بیشترین مقدار", { exact: true }).fill("20");
  await studio
    .getByRole("button", { name: "ذخیره تعریف فیلد", exact: true })
    .click();
  await expect(
    studio.getByRole("button", { name: `ویرایش فیلد ${label}`, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await studio.getByLabel(label, { exact: true }).fill("50");
  await studio
    .getByRole("button", { name: "ذخیره مقادیر رکورد", exact: true })
    .click();
  await expect(studio.getByRole("alert")).toBeVisible();
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((node) => {
        if (node.closest(".workspace-nav")) return false;
        for (
          let parent = node.parentElement;
          parent && parent.tagName !== "MAIN";
          parent = parent.parentElement
        ) {
          if (
            ["auto", "scroll", "hidden"].includes(
              getComputedStyle(parent).overflowX,
            )
          )
            return false;
        }
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
        );
      })
      .slice(0, 15)
      .map(
        (node) =>
          `${node.tagName}.${node.className}: ${node.getBoundingClientRect().width} ${node.textContent?.slice(0, 70)}`,
      ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    overflow.join("\n"),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".custom-fields-studio")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await studio.locator("summary").focus();
  await studio.screenshot({ path: ".local/custom-fields-persian-mobile.png" });
});
