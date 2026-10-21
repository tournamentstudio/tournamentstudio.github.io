import { expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type JsonValue,
} from "../domain/types";
import { changeMatchState, generateStage, recordResult } from "./index";
import { tournamentMatchEvidence } from "./match-evidence";
import { freezePrediction, predictionRows } from "../records/predictions";
function generated() {
  const doc = createTournament(
    "Reopened",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Team ${index}`, index + 1),
    ),
  );
  return generateStage(doc, doc.stages[0].id);
}
it("blocks predictions after reopening a recorded match without marking unplayed descendants", async () => {
  let doc = generated();
  const first = doc.matches[0];
  doc = recordResult(doc, first.id, {
    scores: [3, 1],
    winnerIds: [first.slots[0].participantId!],
    outcome: "played",
    recordedAt: new Date().toISOString(),
  });
  doc = changeMatchState(doc, first.id, "ready", true);
  expect(doc.matches[0].result).toBeUndefined();
  const evidence = tournamentMatchEvidence(doc);
  expect(evidence(doc.matches[0])).toBe(true);
  const final = doc.matches.find((match) => match.round === 2)!;
  expect(evidence(final)).toBe(false);
  const choices: Record<string, string> = {};
  for (let index = 0; index < 4; index++)
    for (const row of predictionRows(doc, doc.stages[0].id, choices))
      if (!row.automatic && row.entrants.length === 2)
        choices[row.match.id] = row.entrants[0];
  await expect(
    freezePrediction(doc, doc.stages[0].id, "Late prediction", choices),
  ).rejects.toThrow("recorded play");
});
it("validates bounded historical match snapshots before reading their evidence", () => {
  const doc = generated();
  doc.metadata.correctionRecovery = [
    {
      at: new Date().toISOString(),
      revision: 1,
      matchId: doc.matches[0].id,
      matches: [{ ...doc.matches[0], liveScores: "invalid" }],
    },
  ] as unknown as JsonValue;
  expect(() => tournamentMatchEvidence(doc)).toThrow(
    "recovery data is invalid",
  );
  doc.metadata.correctionRecovery = Array.from({ length: 6 }, () => ({
    at: new Date().toISOString(),
    revision: 1,
    matchId: doc.matches[0].id,
    matches: [],
  }));
  expect(() => tournamentMatchEvidence(doc)).toThrow(
    "recovery data is invalid",
  );
});
