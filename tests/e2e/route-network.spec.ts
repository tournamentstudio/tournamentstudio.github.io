import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createParticipant, createTournament } from "../../src/domain/types";
import { generateStage } from "../../src/engine";
import type { RouteNetwork } from "../../src/scheduling/route-network";
function fixture() {
  let doc = createTournament("Route cup", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  doc = generateStage(doc, doc.stages[0].id);
  doc.matches[0].legSchedule = [
    {
      leg: 1,
      scheduledAt: "2026-10-22T10:00:00Z",
      resourceId: doc.schedule.resources[0].id,
    },
    {
      leg: 2,
      scheduledAt: "2026-10-22T12:00:00Z",
      resourceId: doc.schedule.resources[0].id,
    },
  ];
  return doc;
}
async function saved(page: Page) {
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await expect(page.locator(".workspace-fieldset")).not.toBeDisabled();
}
async function open(page: Page, doc: ReturnType<typeof fixture>) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bring a tournament into your studio",
  });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "routes.json",
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
  await saved(page);
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  const studio = page.locator(".route-network-studio");
  await studio.locator("summary").click();
  return studio;
}

test("edits a local route network and exports a timed itinerary for aggregate legs", async ({
  page,
}) => {
  const studio = await open(page, fixture());
  for (const name of ["Home", "Court"]) {
    await studio.getByLabel("Route node name", { exact: true }).fill(name);
    await studio
      .getByRole("button", { name: "Save route node", exact: true })
      .click();
    await saved(page);
  }
  await studio
    .getByLabel("Route from", { exact: true })
    .selectOption({ label: "Home" });
  await studio
    .getByLabel("Route to", { exact: true })
    .selectOption({ label: "Court" });
  await studio.getByLabel("Route distance (km)", { exact: true }).fill("10");
  await studio.getByLabel("Route travel minutes", { exact: true }).fill("30");
  await studio
    .getByRole("button", { name: "Save route link", exact: true })
    .click();
  await saved(page);
  await studio
    .getByLabel("Entrant home node", { exact: true })
    .selectOption({ label: "Home" });
  await saved(page);
  await studio
    .getByLabel("Route node for Court 1", { exact: true })
    .selectOption({ label: "Court" });
  await saved(page);
  await studio
    .getByLabel("Leave home at", { exact: true })
    .fill("2026-10-21T08:00");
  await studio.getByLabel("Itinerary cost per km", { exact: true }).fill("2");
  await studio
    .getByRole("button", { name: "Calculate itinerary", exact: true })
    .click();
  await expect(studio.locator(".route-itinerary li")).toHaveCount(3);
  await expect(studio.getByRole("status")).toContainText("20 km");
  await expect(studio.locator(".route-itinerary li").first()).toContainText(
    "Leg 1",
  );
  const download = page.waitForEvent("download");
  await studio
    .getByRole("button", { name: "Export itinerary CSV", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/itinerary\.csv$/);
  await page.reload();
  await saved(page);
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await studio.locator("summary").click();
  await expect(
    studio
      .getByLabel("Entrant home node", { exact: true })
      .locator("option:checked"),
  ).toHaveText("Home");
  await studio
    .getByLabel("Edit route node", { exact: true })
    .selectOption({ label: "Home" });
  await studio
    .getByRole("button", { name: "Delete route node", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Delete route node" });
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await saved(page);
  await expect(
    studio.getByLabel("Edit route link", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(
    studio.getByLabel("Entrant home node", { exact: true }),
  ).toHaveValue("");
});

test("reviews imported route networks, rejects broken references and fits Persian mobile", async ({
  page,
}) => {
  const doc = fixture(),
    studio = await open(page, doc);
  const graph: RouteNetwork = {
    version: 1,
    nodes: [
      { id: "home", name: "خانه شرکت‌کنندگان دانشگاه با نام طولانی" },
      { id: "court", name: "زمین مسابقات دانشگاه با نام طولانی" },
    ],
    edges: [],
    homes: [{ participantId: doc.participants[0].id, nodeId: "home" }],
    venues: [{ resourceId: doc.schedule.resources[0].id, nodeId: "court" }],
  };
  await studio
    .getByLabel("Route network JSON", { exact: true })
    .fill(
      JSON.stringify({
        ...graph,
        homes: [{ participantId: "missing", nodeId: "home" }],
      }),
    );
  await studio
    .getByRole("button", { name: "Preview route import", exact: true })
    .click();
  await expect(
    studio.getByText(
      "The route network references an unknown entrant or venue.",
      { exact: true },
    ),
  ).toBeVisible();
  await studio
    .getByLabel("Route network JSON", { exact: true })
    .fill(JSON.stringify(graph));
  await studio
    .getByRole("button", { name: "Preview route import", exact: true })
    .click();
  await expect(
    studio.getByLabel("Edit route node", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await studio
    .getByRole("button", {
      name: "Replace with reviewed route network",
      exact: true,
    })
    .click();
  await saved(page);
  await studio
    .getByRole("button", { name: "Calculate itinerary", exact: true })
    .click();
  await expect(
    studio.getByText("This itinerary is incomplete.", { exact: false }),
  ).toBeVisible();
  await expect(
    studio.getByText("No connecting route", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include(".route-network-studio")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
