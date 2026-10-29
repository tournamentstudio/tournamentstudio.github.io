import { expect, it } from "vitest";
import { createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { sponsorPages } from "../presentation/sponsors";
import { sponsorVisualPages } from "./sponsors";
import { presentationSlideFiles } from "./slides";
import { recipePresentation } from "../sharing/recipe-presentation";

it("paginates local sponsor artwork and escapes long bilingual names", async () => {
  const doc = createTournament("Sponsor cup", []);
  doc.presentation.sponsorCards = Array.from({ length: 24 }, (_, index) => ({
    id: `s-${index}`,
    name: `${index} <script>حامی آفتاب & Partners`,
    tier: index === 0 ? "main" : "partner",
    logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=",
  }));
  doc.presentation.sponsorLayout = "spotlight";
  doc.presentation.scenes = [
    {
      id: "sponsors",
      type: "sponsors",
      title: "Partners",
      text: "",
      duration: 15,
    },
  ];
  expect(sponsorPages(doc.presentation)).toHaveLength(3);
  const pages = sponsorVisualPages(doc, "Partners", "fa");
  expect(pages).toHaveLength(3);
  expect(pages[0].svg).toContain("&lt;script&gt;");
  expect(pages[0].svg).toContain('href="data:image/png;');
  expect(pages[0].svg).not.toContain("<script>");
  expect((await presentationSlideFiles(doc, "fa")).length).toBe(3);
  expect(
    recipePresentation(doc.presentation, new Map()).sponsorCards,
  ).toBeUndefined();
});
it("rejects remote and executable sponsor art and duplicate identifiers", () => {
  const doc = createTournament("Sponsor cup", []);
  doc.presentation.sponsorCards = [
    {
      id: "s",
      name: "Name",
      tier: "main",
      logo: "https://example.com/logo.png",
    },
  ];
  expect(() => validateTournament(doc)).toThrow("embedded PNG");
  doc.presentation.sponsorCards[0].logo =
    "data:image/svg+xml,<svg onload='run()'/>";
  expect(() => validateTournament(doc)).toThrow("embedded PNG");
  delete doc.presentation.sponsorCards[0].logo;
  doc.presentation.sponsorCards.push({ ...doc.presentation.sponsorCards[0] });
  expect(() => validateTournament(doc)).toThrow("Duplicate sponsor");
});
