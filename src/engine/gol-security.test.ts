import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult } from "./index";
import { recordGolHand, setGolClock } from "./gol";
import { publicProjection, encodeCode, decodeCode } from "../sharing";
function fixture() {
  const doc = createTournament(
    "Referee privacy",
    Array.from({ length: 4 }, (_, i) => createParticipant(`Team ${i}`, i + 1)),
    "single-elimination",
    "gol-ya-pooch",
  );
  return generateStage(doc, doc.stages[0].id);
}
it("keeps persisted referee clock and possession private in every public snapshot", async () => {
  let doc = fixture();
  const match = doc.matches[0];
  doc = setGolClock(doc, match.id, "start", Date.parse("2026-01-01T00:00:00Z"));
  doc = recordGolHand(
    doc,
    match.id,
    {
      concealingTeamId: match.slots[0].participantId!,
      awardedToId: match.slots[0].participantId!,
      points: 1,
      secret: "private-left-hand",
    },
    Date.parse("2026-01-01T00:00:04Z"),
  );
  doc = validateTournament(JSON.parse(JSON.stringify(doc)));
  expect(doc.matches[0].golState?.runningSince).toBeDefined();
  expect(doc.matches[0].hands?.[0].gol?.elapsedMs).toBe(4000);
  const projected = publicProjection(doc);
  expect(projected.matches[0].golState).toBeUndefined();
  expect(projected.matches[0].hands).toBeUndefined();
  expect(JSON.stringify(projected)).not.toContain("private-left-hand");
  const reopened = await decodeCode(await encodeCode(doc));
  expect(reopened.matches[0].golState).toBeUndefined();
});
it("stops the persisted timer on a quick result and clears downstream referee state on correction", () => {
  let doc = fixture();
  const first = doc.matches[0];
  doc = setGolClock(doc, first.id, "start", Date.parse("2026-01-01T00:00:00Z"));
  const score = (match: typeof first, swap = false) => ({
    scores: swap ? [0, 1] : [1, 0],
    winnerIds: [match.slots[swap ? 1 : 0].participantId!],
    outcome: "played" as const,
    recordedAt: "2026-01-01T00:00:10Z",
  });
  doc = recordResult(doc, first.id, score(first));
  expect(doc.matches[0].golState).toMatchObject({ elapsedMs: 10000 });
  expect(doc.matches[0].golState?.runningSince).toBeUndefined();
  doc = recordResult(doc, doc.matches[1].id, score(doc.matches[1]));
  const final = doc.matches.at(-1)!;
  doc = setGolClock(doc, final.id, "start");
  expect(() => recordResult(doc, first.id, score(first, true))).toThrow();
  const corrected = recordResult(doc, first.id, score(first, true), true);
  expect(
    corrected.matches.find((m) => m.id === final.id)?.golState,
  ).toBeUndefined();
  expect(corrected.metadata.correctionRecovery).toBeDefined();
});
