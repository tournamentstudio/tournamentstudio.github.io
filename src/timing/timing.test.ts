import { expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, recordResult, getStandings } from "../engine";
import { validateTournament } from "../domain/validate";
import { publicProjection, encodeCode, decodeCode } from "../sharing";
import { newRun, updateRun, elapsedTime } from "./model";
it("retains elapsed time and splits across pause, serialization and resume", () => {
  let run = updateRun(newRun(), "start", 1000);
  run = updateRun(run, "split", 2500, "First");
  run = updateRun(run, "pause", 4000);
  expect(run.splits[0].elapsedMs).toBe(1500);
  expect(run.elapsedMs).toBe(3000);
  run = JSON.parse(JSON.stringify(run));
  run = updateRun(run, "start", 7000);
  expect(elapsedTime(run, 10000)).toBe(6000);
  expect(elapsedTime(run, 5000)).toBe(3000);
  expect(() => updateRun(newRun(), "split")).toThrow(/Start/);
});
function fixture() {
  const t = createTournament(
    "Runs",
    [
      createParticipant("A", 1),
      createParticipant("B", 2),
      createParticipant("C", 3),
    ],
    "time-trial",
  );
  t.stages[0].config.rounds = 2;
  t.stages[0].config.timeRanking = "cumulative";
  t.rules.scoring = "time";
  return generateStage(t, t.stages[0].id);
}
it("ranks complete total times and preserves unresolved exact ties", () => {
  let t = fixture();
  for (const [i, scores] of [
    [0, [10, 8, 12]],
    [1, [10, 15, 8]],
  ] as const) {
    const m = t.matches[i];
    const low = Math.min(...scores);
    t = recordResult(t, m.id, {
      scores: [...scores],
      winnerIds: m.slots
        .filter((_, j) => scores[j] === low)
        .map((s) => s.participantId!),
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
  }
  const rows = getStandings(t, t.stages[0].id);
  expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  expect(rows[0].tied).toBe(true);
  expect(rows[2].participantId).toBe(t.participants[1].id);
});
it("never rewards entrants for missing a scheduled run", () => {
  let t = fixture();
  const m = t.matches[0];
  t = recordResult(t, m.id, {
    scores: [10, 8, 12],
    winnerIds: [m.slots[1].participantId!],
    outcome: "played",
    recordedAt: new Date().toISOString(),
  });
  expect(
    getStandings(t, t.stages[0].id).every((r) => r.tied && r.rank === 1),
  ).toBe(true);
});
it("validates timer identity and excludes private run evidence from public transport", async () => {
  const t = fixture();
  const id = t.matches[0].slots[0].participantId!;
  t.matches[0].metadata.timing = {
    [id]: {
      ...newRun(),
      evidence: "https://example.com/private-run",
      review: "accepted",
    },
  };
  const p = publicProjection(t);
  expect(JSON.stringify(p)).not.toContain("private-run");
  expect(p.stages[0].config.timeRanking).toBe("cumulative");
  const restored = await decodeCode(await encodeCode(t));
  expect(restored.stages[0].config.timeRanking).toBe("cumulative");
  t.matches[0].metadata.timing = { missing: newRun() };
  expect(() => validateTournament(t)).toThrow(/entrant/);
});
it("saves a running clock using bounded document metadata", async () => {
  const t = fixture();
  const id = t.matches[0].slots[0].participantId!;
  t.matches[0].metadata.timing = {
    [id]: updateRun(newRun(), "start", Date.parse("2026-10-21T12:00:00Z")),
  };
  expect(validateTournament(t).matches[0].metadata.timing).toEqual(
    t.matches[0].metadata.timing,
  );
  const restored = await decodeCode(await encodeCode(t, undefined, true));
  expect(restored.matches[0].metadata.timing).toEqual(
    t.matches[0].metadata.timing,
  );
});
