import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage, simulate } from "../../src/engine";

async function openStudio(page: Page, section: string) {
  let t = createTournament(
    "جام آفتاب",
    Array.from({ length: 8 }, (_, i) =>
      createParticipant(`شاهین ${i + 1} Team`, i + 1),
    ),
    "single-elimination",
  );
  t = simulate(generateStage(t, t.stages[0].id));
  t.theme.preset = "minimal-light";
  t.presentation.autoRotate = false;
  t.presentation.scenes = [
    {
      id: "intro",
      type: "introduction",
      title: "Welcome",
      text: "",
      duration: 16,
      participantIds: [t.participants[0].id, t.participants[2].id],
    },
    {
      id: "trophy",
      type: "trophy",
      title: "The cup is yours",
      text: "",
      duration: 10,
    },
  ];
  t.matches[0].private = { concealedPosition: "HIDDEN-REFEREE-ONLY" };
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "display.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(t)),
  });
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: section, exact: true })
    .click();
  return t;
}

test("collapses selected rounds and pans by pointer or keyboard without opening matches", async ({
  page,
}) => {
  await openStudio(page, "Brackets");
  const svg = page.getByTestId("bracket-svg");
  await expect(svg.locator("g.bracket-node")).toHaveCount(7);
  await page.getByText("Expand or collapse rounds", { exact: true }).click();
  await page
    .getByRole("button", { name: "Collapse round 1 (4)", exact: true })
    .click();
  await expect(svg.locator("g.bracket-node")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Expand all rounds", exact: true })
    .click();
  await expect(svg.locator("g.bracket-node")).toHaveCount(7);
  for (let index = 0; index < 5; index++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Drag to pan", exact: true }).click();
  const canvas = page.locator(".bracket-scroll");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 280, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 40, { steps: 10 });
  await page.mouse.up();
  expect(
    await canvas.evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(100);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await canvas.focus();
  const before = await canvas.evaluate((element) => element.scrollLeft);
  await canvas.press("ArrowRight");
  expect(
    await canvas.evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(before);
});

test("uploads public sponsor raster art and presents the selected layout", async ({
  page,
  browserName,
}) => {
  await openStudio(page, "Presentation");
  await page
    .getByRole("button", { name: "Add sponsor card", exact: true })
    .click();
  await page
    .getByLabel("Sponsor name", { exact: true })
    .fill("حامی آفتاب / Sun Partners");
  await page.getByLabel("Sponsor tier", { exact: true }).selectOption("main");
  await page
    .getByLabel("Sponsor layout", { exact: true })
    .selectOption("spotlight");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#195d42";
    ctx.fillRect(0, 0, 300, 100);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("SUN", 100, 65);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Sponsor logo", { exact: true }).setInputFiles({
    name: "sponsor.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.locator(".sponsor-editor-logo")).toBeVisible();
  await page
    .getByRole("button", { name: "Save sponsor cards", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page.getByLabel("Scene type", { exact: true }).selectOption("sponsors");
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview presentation", exact: true })
    .click();
  await page.getByRole("button", { name: "Next scene", exact: true }).click();
  await page.getByRole("button", { name: "Next scene", exact: true }).click();
  await expect(
    page.locator(".sponsor-wall.sponsor-spotlight img"),
  ).toBeVisible();
  await expect(page.locator(".sponsor-wall figcaption")).toHaveText(
    "حامی آفتاب / Sun Partners",
  );
  expect(await page.locator(".presentation-shell").textContent()).not.toContain(
    "HIDDEN-REFEREE-ONLY",
  );
  if (browserName === "chromium")
    await page.screenshot({
      path: ".local/sponsor-display.png",
      fullPage: true,
      animations: "disabled",
    });
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Presentation", exact: true })
    .click();
  await expect(page.locator(".sponsor-editor-logo")).toBeVisible();
});

test("saves and restores a reusable custom theme without changing results", async ({
  page,
}) => {
  await openStudio(page, "Theme Studio");
  await page
    .getByRole("combobox", { name: "Card surface", exact: true })
    .selectOption("outline");
  await expect(page.locator(".theme-preview-card")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page
    .getByRole("combobox", { name: "Table surface", exact: true })
    .selectOption("striped");
  await page
    .getByRole("combobox", { name: "Default bracket layout", exact: true })
    .selectOption("centered");
  await page
    .getByRole("textbox", { name: "Saved theme name", exact: true })
    .fill("Persian tournament night");
  await page
    .getByRole("button", { name: "Save current design", exact: true })
    .click();
  const saved = page
    .locator(".personal-theme-list article")
    .filter({ hasText: "Persian tournament night" });
  await expect(saved).toBeVisible();
  const pending = page.waitForEvent("download");
  await saved.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending;
  const text = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(text).version).toBe(2);
  expect(JSON.parse(text).theme.design.bracketLayout).toBe("centered");
  expect(text).not.toContain("HIDDEN-REFEREE-ONLY");
  await page
    .getByRole("button", { name: "Reset customizations", exact: true })
    .click();
  await saved.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Card surface", exact: true }),
  ).toHaveValue("outline");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Theme Studio", exact: true })
    .click();
  await expect(page.locator(".personal-theme-list article")).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "Default bracket layout", exact: true }),
  ).toHaveValue("centered");
});

test("changes actual bracket geometry and preserves accessible match controls", async ({
  page,
}) => {
  await openStudio(page, "Brackets");
  const svg = page.getByTestId("bracket-svg");
  const horizontal = await svg.getAttribute("viewBox");
  for (const layout of ["vertical", "centered", "compact"]) {
    await page
      .getByRole("combobox", { name: "Bracket layout", exact: true })
      .selectOption(layout);
    await expect(svg).toHaveAttribute("data-layout", layout);
    expect(await svg.getAttribute("viewBox")).not.toBe(horizontal);
    await expect(svg.locator("g.bracket-node")).toHaveCount(7);
  }
  await page
    .getByRole("button", { name: "Right to left", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Left to right", exact: true }),
  ).toBeVisible();
  const first = svg.locator("g.bracket-node").first();
  await first.focus();
  await first.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("previews selected introductions and the decided trophy scene", async ({
  page,
  browserName,
}) => {
  await openStudio(page, "Presentation");
  await expect(
    page.getByRole("checkbox", { name: "شاهین 1 Team", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "شاهین 2 Team", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Preview presentation", exact: true })
    .click();
  await expect(page.locator(".participant-introduction h1")).toHaveText(
    "شاهین 1 Team",
  );
  await page.getByRole("button", { name: "Next scene", exact: true }).click();
  await expect(
    page.locator(".celebration-scene .trophy-artwork"),
  ).toBeVisible();
  await expect(page.locator(".celebration-scene h1")).not.toHaveText(
    "The champion is not decided yet",
  );
  expect(await page.locator(".presentation-shell").textContent()).not.toContain(
    "HIDDEN-REFEREE-ONLY",
  );
  if (browserName === "chromium")
    await page.screenshot({
      path: ".local/trophy-display.png",
      fullPage: true,
      animations: "disabled",
    });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Preview presentation", exact: true }),
  ).toBeVisible();
});

test("exports real alpha in PNG overlays and keeps Persian controls inside mobile viewport", async ({
  page,
  browserName,
}) => {
  await openStudio(page, "Presentation");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download overlay PNG", exact: true })
    .click();
  const downloaded = await pending;
  const bytes = await readFile((await downloaded.path())!);
  const corner = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, bytes.toString("base64"));
  expect(corner[3]).toBe(0);
  await page
    .getByRole("combobox", { name: "Overlay background", exact: true })
    .selectOption("chroma");
  await page
    .getByRole("checkbox", { name: "Use overlay display mode", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Use overlay display mode",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Preview presentation", exact: true })
    .click();
  await expect(
    page.locator(".broadcast-shell .broadcast-overlay"),
  ).toHaveAttribute("data-background", "chroma");
  await expect(
    page.getByRole("button", { name: "Next scene", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const report = await new AxeBuilder({ page })
    .include(".overlay-editor")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
  if (browserName === "chromium")
    await page.screenshot({
      path: ".local/overlay-mobile.png",
      fullPage: true,
    });
});
