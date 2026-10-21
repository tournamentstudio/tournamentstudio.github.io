import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import { encodeCode } from "../../src/sharing";

async function tabTo(page: Page, target: Locator, limit = 120) {
  const visited = new Set<string>();
  for (let index = 0; index < limit; index++) {
    if (await target.evaluate((node) => node === document.activeElement))
      return;
    await page.keyboard.press("Tab");
    visited.add(
      await page.evaluate(
        () => document.activeElement?.outerHTML.slice(0, 180) ?? "none",
      ),
    );
  }
  await expect(target, `Tab stops: ${[...visited].join("\n")}`).toBeFocused();
}
async function section(page: Page, name: string) {
  const target = page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name, exact: true });
  await target.focus();
  await target.press("Enter");
  await expect(page.locator(".loading-state")).toHaveCount(0);
}
test("keyboard creates, scores, saves a theme and controls presentation focus", async ({
  page,
}) => {
  await page.goto("/#/create");
  const title = page.getByLabel("Tournament title", { exact: true });
  await tabTo(page, title);
  await title.pressSequentially("Keyboard cup");
  await tabTo(
    page,
    page.getByRole("button", { name: "Continue", exact: true }),
  );
  await page.keyboard.press("Enter");
  const count = page.getByLabel("Participant count", { exact: true });
  await tabTo(page, count);
  await count.press("ControlOrMeta+A");
  await count.press("4");
  await tabTo(
    page,
    page.getByRole("button", { name: "Continue", exact: true }),
  );
  await page.keyboard.press("Enter");
  await tabTo(
    page,
    page.getByRole("button", { name: "Create tournament", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace-title h1")).toHaveText("Keyboard cup");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
  await section(page, "Matches");
  const match = page.locator(".match-tile.ready").first();
  await tabTo(page, match);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Match control",
    exact: true,
  });
  const score = dialog.getByRole("spinbutton").first();
  await tabTo(page, score);
  await score.press("ControlOrMeta+A");
  await score.press("2");
  await tabTo(
    page,
    dialog.getByRole("button", { name: "Confirm result", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await section(page, "Theme Studio");
  const theme = page.getByRole("button", { name: "Minimal Dark", exact: true });
  await tabTo(page, theme);
  await theme.press("Space");
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  const name = page.getByLabel("Saved theme name", { exact: true });
  await tabTo(page, name);
  await name.pressSequentially("Keyboard design");
  await tabTo(
    page,
    page.getByRole("button", { name: "Save current design", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Keyboard design", { exact: true }),
  ).toBeVisible();
  await section(page, "Presentation");
  const opener = page.getByRole("button", {
    name: "Preview presentation",
    exact: true,
  });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  const display = page.getByRole("dialog", {
    name: "Tournament presentation",
    exact: true,
  });
  await expect(display).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(display.locator(".presentation-controls")).toContainText("2 /");
  await page.keyboard.press("ArrowLeft");
  await expect(display.locator(".presentation-controls")).toContainText("1 /");
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(
      await display.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  const violations = await new AxeBuilder({ page })
    .include(".presentation-shell")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(display).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("keyboard imports a portable code and can leave its preview without a focus trap", async ({
  page,
}) => {
  const draft = createTournament("Keyboard import", [
    createParticipant("One", 1),
    createParticipant("Two", 2),
  ]);
  const doc = generateStage(draft, draft.stages[0].id),
    code = await encodeCode(doc);
  await page.goto("/");
  const opener = page.getByRole("button", {
    name: "Import & restore",
    exact: true,
  });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
    exact: true,
  });
  const input = dialog.getByLabel("Import code", { exact: true });
  await tabTo(page, input);
  await page.keyboard.insertText(code);
  const preview = dialog.getByRole("button", {
    name: "Preview import",
    exact: true,
  });
  await tabTo(page, preview);
  await page.keyboard.press("Enter");
  await expect(dialog).toContainText("Keyboard import");
  await tabTo(
    page,
    dialog.getByRole("button", { name: "Save local copy", exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".workspace-title h1")).toHaveText(
    "Keyboard import",
  );
});
