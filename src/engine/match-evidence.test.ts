import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "./index";
import { stageProtection } from "../app/structure/helpers";
import { newRun } from "../timing/model";

it("protects a draw and its reset controls after a paused run has recorded evidence", () => {
  let doc = createTournament("Timed cup", [
    createParticipant("A", 1),
    createParticipant("B", 2),
  ]);
  const stage = doc.stages[0].id;
  doc = generateStage(doc, stage);
  expect(stageProtection(doc, stage).canReset).toBe(true);
  doc.matches[0].metadata.timing = {
    [doc.participants[0].id]: { ...newRun(), elapsedMs: 5000 },
  };
  expect(stageProtection(doc, stage).played).toBe(true);
  expect(stageProtection(doc, stage).canReset).toBe(false);
  expect(() => generateStage(doc, stage)).toThrow(/played or live/);
});
