import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { presentationSlideFiles } from "./slides";

it("exports separate aggregate leg bookings with original entrants and translated labels", async () => {
  let doc = createTournament("Legs cup", [
    createParticipant("North", 1),
    createParticipant("South", 2),
  ]);
  doc.stages[0].config.aggregate = { version: 1, legs: 2, tieBreak: "manual" };
  doc = generateStage(doc, doc.stages[0].id);
  doc.matches[0].legSchedule = [
    { leg: 1, scheduledAt: "2026-01-01T10:00:00Z" },
    { leg: 2, scheduledAt: "2026-01-02T11:00:00Z" },
  ];
  doc.matches[0].private = { concealedPosition: "NEVER-EXPORT" };
  doc.presentation.scenes = [
    { id: "schedule", type: "schedule", title: "", text: "", duration: 15 },
  ];
  const en = (await presentationSlideFiles(doc, "en"))[0].svg;
  expect(en).toContain("Leg 1");
  expect(en).toContain("Leg 2");
  expect(en).toContain("North / South");
  expect(en).not.toContain("NEVER-EXPORT");
  expect(en).not.toContain("TBD");
  const fa = (await presentationSlideFiles(doc, "fa"))[0].svg;
  const faText = Array.from(
    fa.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g),
    (match) => match[1],
  ).join(" ");
  expect(faText).toContain("بازی رفت‌وبرگشت");
  expect(fa).not.toContain("Leg 2");
});
