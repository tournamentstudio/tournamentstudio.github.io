import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult } from "../engine";
import { decodeCode, encodeCode, publicProjection } from "../sharing";
import {
  countedPlayerEvents,
  deletePlayerEvent,
  playerEventMatchIds,
  playerTotals,
  readPlayerStatistics,
  reconcilePlayerStatistics,
  rosterPlayers,
  savePlayerEvent,
  savePlayerMetric,
  validatePlayerStatistics,
  type PlayerEventInput,
} from "./model";
import { playerMetricTemplates } from "./templates";
import { playerStatisticsCSV } from "./export";

function fixture(count = 4) {
  const doc = createTournament(
    "Player cup",
    Array.from({ length: count }, (_, index) => {
      const p = createParticipant(`Team ${index + 1}`, index + 1);
      p.roster = [
        { id: `player-${index}`, name: `بازیکن ${index + 1}`, role: "player" },
        { id: `coach-${index}`, name: "Coach", role: "coach" },
      ];
      return p;
    }),
    "single-elimination",
    "football",
  );
  return savePlayerMetric(
    generateStage(doc, doc.stages[0].id),
    playerMetricTemplates("football")[0],
  );
}
function input(doc: Tournament, value = 1): PlayerEventInput {
  const m = doc.matches.find((match) => match.status === "ready")!;
  const teamId = m.slots[0].participantId!;
  return {
    matchId: m.id,
    teamId,
    playerId: rosterPlayers(doc, teamId)[0].id,
    metricId: "goals",
    value,
    elapsedSeconds: 15.5,
    period: "First half",
    notes: "Private observation",
  };
}
describe("player observations", () => {
  it("keeps valid 240-character Persian and mixed-script identity snapshots", () => {
    const doc = fixture();
    const name = "بازیکن شمال North ".repeat(20).slice(0, 240);
    doc.participants[0].name = name;
    doc.participants[0].roster[0].name = name;
    const next = savePlayerEvent(doc, input(doc));
    expect(readPlayerStatistics(next).events[0]).toMatchObject({
      playerName: name,
      teamName: name,
    });
    expect(() => validateTournament(next)).not.toThrow();
    expect(playerMetricTemplates("constructor").map((m) => m.id)).toEqual([
      "points",
      "appearances",
    ]);
  });
  it("counts recorded roster-player values without changing official results", () => {
    const before = fixture(),
      first = savePlayerEvent(before, input(before));
    const after = savePlayerEvent(first, input(first, 2));
    expect(after.matches).toEqual(before.matches);
    expect(playerTotals(after)).toMatchObject([
      { value: 3, eventCount: 2, matchCount: 1 },
    ]);
    expect(playerTotals(after, { teamId: "unknown" })).toEqual([]);
    expect(countedPlayerEvents(after)[0].playerName).toMatch(/بازیکن/);
    expect(validateTournament(after)).toBeTruthy();
  });
  it("supports one-person entries and multi-entrant matches without fictional records", () => {
    let doc = createTournament(
      "Individual race",
      [
        createParticipant("Runner", 1, "individual"),
        createParticipant("Runner B", 2, "individual"),
        createParticipant("Runner C", 3, "individual"),
      ],
      "time-trial",
      "racing",
    );
    doc = generateStage(doc, doc.stages[0].id);
    doc = savePlayerMetric(doc, playerMetricTemplates("racing")[0]);
    const match = doc.matches[0];
    doc = savePlayerEvent(doc, {
      matchId: match.id,
      teamId: doc.participants[0].id,
      playerId: doc.participants[0].id,
      metricId: "lap-seconds",
      value: 31.25,
      notes: "",
      period: "1",
    });
    expect(playerTotals(doc)[0].value).toBe(31.25);
  });
  it.each(["sum", "average", "min", "max"] as const)(
    "uses the explicit %s policy only on entered values",
    (aggregation) => {
      let doc = fixture();
      doc = savePlayerMetric(doc, {
        ...playerMetricTemplates("football")[0],
        aggregation,
        type: "decimal",
      });
      for (const value of [1.25, 3.75])
        doc = savePlayerEvent(doc, input(doc, value));
      expect(playerTotals(doc)[0].value).toBe(
        { sum: 5, average: 2.5, min: 1.25, max: 3.75 }[aggregation],
      );
    },
  );
  it("retains corrected/deleted observations and restores only after review", () => {
    let doc = fixture();
    doc = savePlayerEvent(doc, input(doc));
    const id = readPlayerStatistics(doc).events[0].id;
    expect(() => savePlayerEvent(doc, input(doc, 2), id)).toThrow(/reason/);
    doc = savePlayerEvent(
      doc,
      input(doc, 2),
      id,
      "Corrected official observation",
    );
    expect(readPlayerStatistics(doc).events[0].history[0].before.value).toBe(1);
    doc = deletePlayerEvent(doc, id, "Duplicate observation");
    expect(playerTotals(doc)).toEqual([]);
    expect(playerEventMatchIds(doc)).toContain(input(doc).matchId);
    doc = savePlayerEvent(doc, input(doc, 2), id, "Checked match notes");
    expect(playerTotals(doc)[0].value).toBe(2);
    expect(
      readPlayerStatistics(doc).events[0].history.map((h) => h.action),
    ).toEqual(["corrected", "deleted", "restored"]);
  });
  it("preserves live events on first result, quarantines corrections, and retains captured identities", () => {
    const original = fixture();
    const eventInput = input(original);
    const before = savePlayerEvent(original, eventInput);
    const m = before.matches.find((match) => match.id === eventInput.matchId)!;
    const scored = recordResult(before, m.id, {
      scores: [2, 0],
      winnerIds: [m.slots[0].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    const first = reconcilePlayerStatistics(before, scored);
    expect(countedPlayerEvents(first)).toHaveLength(1);
    const next = structuredClone(first);
    next.matches.find((match) => match.id === m.id)!.result!.scores = [3, 0];
    const checked = reconcilePlayerStatistics(first, next);
    expect(playerTotals(checked)).toEqual([]);
    expect(readPlayerStatistics(checked).events[0]).toMatchObject({
      status: "quarantined",
      playerName: "بازیکن 1",
    });
  });
  it("quarantines changed downstream entrants and roster removals before validation", () => {
    let before = fixture();
    before = savePlayerEvent(before, input(before));
    const next = structuredClone(before),
      event = readPlayerStatistics(before).events[0];
    next.participants.find((p) => p.id === event.teamId)!.roster = [];
    expect(playerTotals(next)).toEqual([]);
    expect(() => validatePlayerStatistics(next)).toThrow(/roster/);
    const reconciled = reconcilePlayerStatistics(before, next);
    expect(readPlayerStatistics(reconciled).events[0].status).toBe(
      "quarantined",
    );
    expect(() => validateTournament(reconciled)).not.toThrow();
    const downstream = structuredClone(before);
    downstream.matches.find(
      (m) => m.id === event.matchId,
    )!.slots[0].participantId = before.participants[1].id;
    expect(
      readPlayerStatistics(reconcilePlayerStatistics(before, downstream))
        .events[0].status,
    ).toBe("quarantined");
  });
  it("rejects invalid values, coach events, duplicate IDs, unsupported schemas and orphan imports", () => {
    const doc = fixture(),
      valid = input(doc);
    for (const value of [-1, 1.5, Infinity, NaN])
      expect(() => savePlayerEvent(doc, { ...valid, value })).toThrow();
    expect(() =>
      savePlayerEvent(doc, { ...valid, playerId: "coach-0" }),
    ).toThrow(/roster/);
    let next = savePlayerEvent(doc, valid);
    const data = readPlayerStatistics(next);
    next = structuredClone(next);
    next.metadata.playerStatistics = JSON.parse(
      JSON.stringify({ ...data, events: [data.events[0], data.events[0]] }),
    );
    expect(() => validateTournament(next)).toThrow(/duplicate/);
    next.metadata.playerStatistics = { version: 999, metrics: [], events: [] };
    expect(() => validateTournament(next)).toThrow(/unsupported/);
    next = savePlayerEvent(doc, valid);
    next.matches = [];
    expect(() => validateTournament(next)).toThrow();
  });
  it("prevents changing historical metric meaning or invalidating prior values", () => {
    const before = fixture(),
      doc = savePlayerEvent(before, input(before, 3));
    const metric = readPlayerStatistics(doc).metrics[0];
    for (const override of [
      { type: "decimal" as const },
      { unit: "s" },
      { aggregation: "average" as const },
    ])
      expect(() => savePlayerMetric(doc, { ...metric, ...override })).toThrow(
        /cannot change/,
      );
    expect(() => savePlayerMetric(doc, { ...metric, max: 2 })).toThrow(
      /limits/,
    );
    const archived = savePlayerMetric(doc, { ...metric, archived: true });
    expect(playerTotals(archived)[0].value).toBe(3);
    expect(() => savePlayerEvent(archived, input(archived))).toThrow(
      /active player metric/,
    );
  });
  it("keeps private Unicode evidence in portable packages and strips all of it from public snapshots", async () => {
    const first = fixture();
    const doc = savePlayerEvent(first, input(first));
    const copy = await decodeCode(await encodeCode(doc, undefined, true));
    expect(readPlayerStatistics(copy)).toEqual(readPlayerStatistics(doc));
    const publicDoc = publicProjection(doc);
    expect(publicDoc.metadata.playerStatistics).toBeUndefined();
    expect(JSON.stringify(publicDoc)).not.toContain("Private observation");
    expect(JSON.stringify(publicDoc)).not.toContain("بازیکن");
    expect(
      (await decodeCode(await encodeCode(doc))).metadata.playerStatistics,
    ).toBeUndefined();
  });
  it("exports private CSV with status and prevents spreadsheet formula execution", () => {
    const original = fixture();
    original.participants[0].roster[0].name = "=SUM(1,2)";
    const doc = savePlayerEvent(original, {
      ...input(original),
      notes: "@private",
    });
    const csv = playerStatisticsCSV(doc);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"\'@private"');
    expect(csv).toContain('"active"');
    expect(playerStatisticsCSV(doc, "fa")).toContain("بازیکن");
  });
});
