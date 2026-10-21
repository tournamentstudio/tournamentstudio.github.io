import { expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
} from "../domain/types";
import { DEFAULT_SWISS_POLICY } from "../domain/swiss";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult } from "./index";

it("retains the old accelerated Swiss policy when upstream correction removes its qualifiers", () => {
  let doc = createTournament(
    "Qualifiers",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Entrant ${index + 1}`, index + 1),
    ),
    "round-robin",
  );
  const sourceId = doc.stages[0].id;
  doc.rules.tieBreakers = ["points", "seed"];
  doc = generateStage(doc, sourceId);
  for (const match of doc.matches.filter((match) => match.status === "ready"))
    doc = recordResult(doc, match.id, {
      scores: [1, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
  doc.stages.push({
    id: "swiss-final",
    name: "Swiss final",
    format: "swiss",
    formatVersion: 1,
    order: 1,
    status: "draft",
    participantIds: doc.participants.map((participant) => participant.id),
    sources: [{ stageId: sourceId, count: 4, perGroup: false }],
    config: {
      ...DEFAULT_CONFIG,
      rounds: 3,
      swiss: {
        ...DEFAULT_SWISS_POLICY,
        acceleration: {
          policy: "fixed-group-v1",
          points: 1,
          rounds: 1,
          participantIds: [doc.participants[0].id, doc.participants[1].id],
        },
      },
    },
    metadata: {},
  });
  const before = structuredClone(doc.stages[1].config.swiss!);
  doc = generateStage(doc, "swiss-final");
  const original = doc.matches.find((match) => match.stageId === sourceId)!;
  doc = recordResult(
    doc,
    original.id,
    {
      scores: [0, 1],
      winnerIds: [original.slots[1].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    },
    true,
  );
  expect(doc.stages[1].participantIds).toEqual([]);
  expect(doc.stages[1].config.swiss!.acceleration).toBeUndefined();
  expect(doc.stages[1].config.swiss!.lateEntries).toEqual([]);
  expect(doc.metadata.correctionRecovery).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        swissPolicies: [{ stageId: "swiss-final", policy: before }],
      }),
    ]),
  );
  expect(validateTournament(doc)).toBeDefined();
  expect(
    generateStage(doc, "swiss-final").matches.some(
      (match) => match.stageId === "swiss-final",
    ),
  ).toBe(true);
});
