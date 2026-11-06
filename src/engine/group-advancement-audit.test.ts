import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type Advancement,
  type Stage,
  type Tournament,
} from "../domain/types";
import { createCollection, linkCompetition } from "../collections/model";
import { aggregateRankings } from "../collections/rankings";
import {
  changeMatchState,
  CorrectionRequiredError,
  generateStage,
  getChampion,
  getStandings,
  previewAdvancement,
  recordResult,
  simulate,
  validateGraph,
} from "./index";

function grouped(
  sizes: number[],
  meetings = 1,
  format: Stage["format"] = "groups",
) {
  const count = sizes.reduce((sum, size) => sum + size, 0);
  const doc = createTournament(
    "Group qualification audit",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant("Team " + (index + 1), index + 1),
      id: "p" + (index + 1),
    })),
    format,
  );
  const stage = doc.stages[0];
  stage.id = "groups";
  stage.config.groupCount = sizes.length;
  stage.config.meetings = meetings;
  let offset = 0;
  stage.config.groups = sizes.map((size) => {
    const ids = stage.participantIds.slice(offset, offset + size);
    offset += size;
    return ids;
  });
  return generateStage(doc, stage.id);
}

function connect(doc: Tournament, sources: Advancement[]) {
  const next = structuredClone(doc);
  next.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    sources,
    status: "draft",
    metadata: {},
  });
  return next;
}

describe("group qualification audit", () => {
  it.each([1, 2, 3, 12])(
    "preserves independent tables through %i meetings in uneven groups",
    (meetings) => {
      let doc = grouped([1, 2, 3, 4, 5], meetings);
      doc.rules.allowDraws = true;
      doc.rules.pointsWin = 5;
      doc.rules.pointsDraw = 2;
      doc.rules.pointsLoss = -1;
      const expected = new Map(
        doc.participants.map((participant) => [
          participant.id,
          {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            scored: 0,
            conceded: 0,
            points: 0,
          },
        ]),
      );
      for (const match of doc.matches.filter(
        (item) => item.status === "ready",
      )) {
        const ids = match.slots.map((slot) => slot.participantId!);
        const seeds = ids.map((id) => Number(id.slice(1)));
        const drawn = (seeds[0] + seeds[1] + match.round) % 3 === 0;
        const scores = drawn ? [2, 2] : seeds.map((seed) => 16 - seed);
        const winner = drawn ? undefined : ids[scores[0] > scores[1] ? 0 : 1];
        doc = recordResult(doc, match.id, {
          scores,
          winnerIds: winner ? [winner] : [],
          outcome: drawn ? "draw" : "played",
          recordedAt: doc.updatedAt,
        });
        ids.forEach((id, index) => {
          const row = expected.get(id)!;
          row.played++;
          row.scored += scores[index];
          row.conceded += scores[1 - index];
          if (drawn) {
            row.draws++;
            row.points += 2;
          } else if (id === winner) {
            row.wins++;
            row.points += 5;
          } else {
            row.losses++;
            row.points--;
          }
        });
      }
      expect(doc.stages[0].status).toBe("completed");
      const memberships = doc.stages[0].metadata.groups as string[][];
      for (const [index, members] of memberships.entries()) {
        const rows = getStandings(
          doc,
          "groups",
          String.fromCharCode(65 + index),
        );
        expect(rows.map((row) => row.participantId).sort()).toEqual(
          [...members].sort(),
        );
        rows.forEach((row) =>
          expect(row).toMatchObject({
            ...expected.get(row.participantId),
            differential: row.scored - row.conceded,
          }),
        );
      }
      expect(getChampion(doc)).toBeUndefined();
      expect(validateGraph(doc)).toEqual([]);
    },
  );

  it("advances singleton group winners without inventing played matches or points", () => {
    const doc = connect(simulate(grouped([1, 2, 3])), [
      { stageId: "groups", count: 1, perGroup: true },
    ]);
    expect(getStandings(doc, "groups", "A")[0]).toMatchObject({
      participantId: "p1",
      played: 0,
      points: 0,
      wins: 0,
    });
    expect(previewAdvancement(doc, "finals")).toMatchObject({
      ready: true,
      participantIds: ["p1", "p2", "p4"],
    });
    expect(generateStage(doc, "finals").stages[1].participantIds).toEqual([
      "p1",
      "p2",
      "p4",
    ]);
  });

  it("keeps a canceled fixture out of per-match wildcard statistics", () => {
    let doc = grouped([3, 3]);
    const canceled = doc.matches.find((match) => match.group === "A")!;
    doc = changeMatchState(doc, canceled.id, "canceled");
    doc = simulate(doc);
    doc = connect(doc, [
      {
        stageId: "groups",
        count: 1,
        perGroup: false,
        selection: {
          kind: "wildcard",
          rank: 1,
          comparison: "per-match",
          tieBreakers: ["points", "seed"],
        },
      },
    ]);
    const preview = previewAdvancement(doc, "finals");
    expect(preview.ready).toBe(true);
    expect(preview.sources[0].candidates).toHaveLength(2);
    for (const candidate of preview.sources[0].candidates) {
      const table = getStandings(doc, "groups", candidate.group);
      const row = table.find(
        (item) => item.participantId === candidate.participantId,
      )!;
      expect(candidate.comparisonPlayed).toBe(row.played);
      expect(candidate.compared.points).toBe(row.points / row.played);
    }
    expect(
      doc.matches.find((match) => match.id === canceled.id)?.result,
    ).toBeUndefined();
  });

  it("requires each tied group cutoff to be resolved by eligible manual qualifiers", () => {
    let doc = grouped([3, 3]);
    doc.rules.allowDraws = true;
    doc.rules.tieBreakers = ["points"];
    for (const match of doc.matches)
      doc = recordResult(doc, match.id, {
        scores: [0, 0],
        winnerIds: [],
        outcome: "draw",
        recordedAt: doc.updatedAt,
      });
    doc = connect(doc, [{ stageId: "groups", count: 2, perGroup: true }]);
    expect(previewAdvancement(doc, "finals").ready).toBe(false);
    doc.stages[1].config.manualQualifiers = ["p1", "p2", "p4", "p6"];
    expect(previewAdvancement(doc, "finals")).toMatchObject({
      ready: true,
      participantIds: ["p1", "p2", "p4", "p6"],
    });
    doc.stages[1].config.manualQualifiers = ["p1", "p2", "p3", "p4"];
    expect(previewAdvancement(doc, "finals").ready).toBe(false);
  });

  it("preserves other group results and recovers downstream play after a correction", () => {
    const doc = simulate(
      connect(grouped([4, 4]), [
        { stageId: "groups", count: 2, perGroup: true },
      ]),
    );
    const source = doc.matches.find(
      (match) => match.stageId === "groups" && match.group === "A",
    )!;
    const otherGroup = doc.matches.filter(
      (match) => match.stageId === "groups" && match.group === "B",
    );
    const prior = structuredClone(doc);
    const result = {
      scores: [0, 3],
      winnerIds: [source.slots[1].participantId!],
      outcome: "played" as const,
      recordedAt: doc.updatedAt,
    };
    expect(() => recordResult(doc, source.id, result)).toThrow(
      CorrectionRequiredError,
    );
    expect(doc).toEqual(prior);
    const corrected = recordResult(doc, source.id, result, true);
    expect(corrected.matches.filter((match) => match.group === "B")).toEqual(
      otherGroup,
    );
    expect(corrected.matches.some((match) => match.stageId === "finals")).toBe(
      false,
    );
    expect(corrected.stages[1].status).toBe("draft");
    expect(JSON.stringify(corrected.metadata.correctionRecovery)).toContain(
      '"stageId":"finals"',
    );
    expect(previewAdvancement(corrected, "finals").ready).toBe(true);
    expect(simulate(corrected).status).toBe("completed");
  });

  it.each(Array.from({ length: 32 }, (_, path) => path))(
    "qualifies the correct GSL entrants for result path %i",
    (path) => {
      let doc = grouped([4, 4], 1, "gsl");
      const original = structuredClone(doc);
      for (let index = 0; ; index++) {
        const match = doc.matches.find((item) => item.status === "ready");
        if (!match) break;
        const groupIndex = doc.matches.filter(
          (item) => item.group === match.group && item.status === "completed",
        ).length;
        const winnerIndex = (path >> groupIndex) & 1;
        doc = recordResult(doc, match.id, {
          scores: winnerIndex ? [0, 2] : [2, 0],
          winnerIds: [match.slots[winnerIndex].participantId!],
          outcome: "played",
          recordedAt: doc.updatedAt,
        });
        expect(index).toBeLessThan(10);
      }
      expect(doc.stages[0].status).toBe("completed");
      const expected: string[] = [];
      for (const group of ["A", "B"]) {
        const matches = doc.matches.filter((match) => match.group === group);
        const first = matches.find((match) => match.metadata.qualifier === 1)!
          .result!.winnerIds[0];
        const second = matches.find((match) => match.metadata.qualifier === 2)!
          .result!.winnerIds[0];
        expected.push(first, second);
        const rows = getStandings(doc, "groups", group);
        expect(rows.slice(0, 2).map((row) => row.participantId)).toEqual([
          first,
          second,
        ]);
        expect(rows).toHaveLength(4);
        expect(rows[0]).toMatchObject({
          rank: 1,
          wins: 2,
          losses: 0,
          tied: false,
        });
        expect(rows[1]).toMatchObject({
          rank: 2,
          wins: 2,
          losses: 1,
          tied: false,
        });
        expect(rows.slice(2).every((row) => row.losses === 2)).toBe(true);
      }
      const connected = connect(doc, [
        { stageId: "groups", count: 2, perGroup: true },
      ]);
      expect(previewAdvancement(connected, "finals")).toMatchObject({
        ready: true,
        participantIds: expected,
      });
      expect(
        generateStage(connected, "finals").stages[1].participantIds,
      ).toEqual(expected);
      expect(original.matches.every((match) => !match.result)).toBe(true);
      expect(getChampion(doc)).toBeUndefined();
      expect(validateGraph(doc)).toEqual([]);
    },
  );

  it("keeps league division standings and event rankings separate", () => {
    const documents = ["Premier", "Second"].map((name) =>
      simulate(
        createTournament(
          name,
          Array.from({ length: 4 }, (_, index) =>
            createParticipant(name + " " + (index + 1), index + 1),
          ),
          "round-robin",
        ),
      ),
    );
    let event = createCollection("League audit");
    event.divisions = [
      { id: "premier", name: "Premier", promote: 0, relegate: 1 },
      { id: "second", name: "Second", promote: 1, relegate: 0 },
    ];
    documents.forEach((doc, index) => {
      event = linkCompetition(
        event,
        doc,
        doc.stages[0].id,
        event.divisions[index].id,
      );
    });
    event.divisions.forEach((division, index) => {
      const ranking = aggregateRankings(event, documents, division.id);
      expect(ranking.pending).toEqual([]);
      expect(ranking.rows).toHaveLength(4);
      expect(
        ranking.rows.every(
          (row) =>
            row.contributions.length === 1 &&
            row.contributions[0].tournamentId === documents[index].id,
        ),
      ).toBe(true);
      expect(
        getStandings(documents[index], documents[index].stages[0].id).map(
          (row) => row.played,
        ),
      ).toEqual([3, 3, 3, 3]);
    });
  });
});
