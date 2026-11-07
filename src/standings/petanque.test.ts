import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Match,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { changeMatchState, generateStage, recordResult } from "../engine";
import { db, repository } from "../persistence";
import {
  decodeCode,
  encodeCode,
  exportArchive,
  importArchive,
} from "../sharing";
import { getStandings } from "./index";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});

type Score = readonly [string, string, number, number];
const clubScores: Score[] = [
  ["A", "B", 13, 5],
  ["A", "C", 13, 8],
  ["D", "A", 13, 6],
  ["B", "C", 13, 7],
  ["B", "D", 13, 5],
  ["C", "D", 13, 9],
];

function fixture(
  names = ["A", "B", "C", "D"],
  format: FormatId = "round-robin",
) {
  const doc = createTournament(
    "Club standings review",
    names.map((name, index) => ({
      ...createParticipant(name, index + 1, "individual"),
      id: name,
    })),
    format,
  );
  doc.rules.scoring = "high";
  doc.rules.allowDraws = false;
  doc.rules.tieBreakers = ["wins", "differential", "scored"];
  doc.stages[0].config.groupCount = 1;
  return doc;
}

function matchBetween(doc: Tournament, first: string, second: string): Match {
  const match = doc.matches.find(
    (item) =>
      item.slots.some((slot) => slot.participantId === first) &&
      item.slots.some((slot) => slot.participantId === second),
  );
  if (!match) throw new Error(`Missing match for ${first} and ${second}`);
  return match;
}

function enter(doc: Tournament, scores: Score[]): Tournament {
  return scores.reduce((current, [first, second, firstScore, secondScore]) => {
    const match = matchBetween(current, first, second);
    return recordResult(current, match.id, {
      scores: match.slots.map((slot) =>
        slot.participantId === first ? firstScore : secondScore,
      ),
      winnerIds: [],
      outcome: "played",
      recordedAt: current.updatedAt,
    });
  }, doc);
}

function completed(format: FormatId = "round-robin") {
  const doc = fixture(undefined, format);
  return enter(generateStage(doc, doc.stages[0].id), clubScores);
}

function summary(doc: Tournament, group?: string) {
  return getStandings(doc, doc.stages[0].id, group).map((row) => ({
    id: row.participantId,
    rank: row.rank,
    tied: row.tied,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    scored: row.scored,
    conceded: row.conceded,
    differential: row.differential,
  }));
}

describe("club Pétanque ranking from recorded results", () => {
  it.each(["round-robin", "groups"] as const)(
    "uses wins, cumulative difference and cumulative scored in %s",
    (format) => {
      const doc = completed(format);
      expect(doc.stages[0].status).toBe("completed");
      expect(summary(validateTournament(doc))).toEqual([
        {
          id: "A",
          rank: 1,
          tied: false,
          played: 3,
          wins: 2,
          losses: 1,
          draws: 0,
          scored: 32,
          conceded: 26,
          differential: 6,
        },
        {
          id: "B",
          rank: 2,
          tied: false,
          played: 3,
          wins: 2,
          losses: 1,
          draws: 0,
          scored: 31,
          conceded: 25,
          differential: 6,
        },
        {
          id: "D",
          rank: 3,
          tied: false,
          played: 3,
          wins: 1,
          losses: 2,
          draws: 0,
          scored: 27,
          conceded: 32,
          differential: -5,
        },
        {
          id: "C",
          rank: 4,
          tied: false,
          played: 3,
          wins: 1,
          losses: 2,
          draws: 0,
          scored: 28,
          conceded: 35,
          differential: -7,
        },
      ]);
    },
  );

  it("keeps more wins above a stronger differential or scored total", () => {
    const source = fixture();
    const doc = enter(generateStage(source, source.stages[0].id), [
      ["A", "B", 13, 12],
      ["A", "C", 13, 12],
      ["D", "A", 13, 0],
      ["B", "C", 13, 0],
      ["B", "D", 13, 0],
      ["C", "D", 25, 0],
    ]);
    const rows = getStandings(doc);
    expect(rows.map((row) => row.participantId)).toEqual(["B", "A", "C", "D"]);
    expect(rows[1]).toMatchObject({ wins: 2, differential: -11, scored: 26 });
    expect(rows[2]).toMatchObject({ wins: 1, differential: 11, scored: 37 });
    const changed = structuredClone(doc);
    changed.participants.find(
      (participant) => participant.id === "C",
    )!.metadata.pointsAdjustment = 1000;
    expect(getStandings(changed).map((row) => row.participantId)).toEqual([
      "B",
      "A",
      "C",
      "D",
    ]);
  });

  it("uses positive and negative differences before scored totals", () => {
    const source = fixture(["A", "B", "C"]);
    const doc = enter(generateStage(source, source.stages[0].id), [
      ["A", "B", 13, 0],
      ["B", "C", 13, 5],
      ["C", "A", 13, 6],
    ]);
    expect(
      summary(doc).map(({ id, wins, differential, scored }) => ({
        id,
        wins,
        differential,
        scored,
      })),
    ).toEqual([
      { id: "A", wins: 1, differential: 6, scored: 19 },
      { id: "C", wins: 1, differential: -1, scored: 18 },
      { id: "B", wins: 1, differential: -5, scored: 13 },
    ]);
  });

  it("preserves shared ranks when every configured criterion is equal", () => {
    const source = fixture(["C", "A", "B"]);
    const doc = enter(generateStage(source, source.stages[0].id), [
      ["A", "B", 13, 5],
      ["B", "C", 13, 5],
      ["C", "A", 13, 5],
    ]);
    expect(getStandings(doc)).toHaveLength(3);
    for (const row of getStandings(doc))
      expect(row).toMatchObject({
        rank: 1,
        tied: true,
        wins: 1,
        losses: 1,
        differential: 0,
        scored: 18,
      });
    doc.participants.reverse();
    doc.participants.forEach((participant, index) => {
      participant.seed = index + 1;
    });
    expect(getStandings(doc).every((row) => row.rank === 1 && row.tied)).toBe(
      true,
    );
  });

  it("does not let standings points or deductions override the ordered criteria", () => {
    const doc = completed();
    doc.rules.pointsWin = 0;
    doc.rules.pointsLoss = 100;
    doc.participants.find(
      (participant) => participant.id === "A",
    )!.metadata.pointsAdjustment = -10000;
    doc.participants.find(
      (participant) => participant.id === "C",
    )!.metadata.pointsAdjustment = 10000;
    const rows = getStandings(doc);
    expect(
      rows.find((row) => row.participantId === "C")!.points,
    ).toBeGreaterThan(rows[0].points);
    expect(rows.map((row) => row.participantId)).toEqual(["A", "B", "D", "C"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it("recalculates a corrected result as shared first place and retains the old result", () => {
    const doc = completed();
    const match = matchBetween(doc, "B", "C");
    const corrected = enter(doc, [["B", "C", 14, 8]]);
    expect(
      getStandings(corrected).map(({ participantId, rank, tied }) => ({
        participantId,
        rank,
        tied,
      })),
    ).toEqual([
      { participantId: "A", rank: 1, tied: true },
      { participantId: "B", rank: 1, tied: true },
      { participantId: "D", rank: 3, tied: false },
      { participantId: "C", rank: 4, tied: false },
    ]);
    const recoveries = corrected.metadata.correctionRecovery as unknown as {
      matches: Match[];
    }[];
    expect(
      recoveries.at(-1)!.matches.find((item) => item.id === match.id)?.result,
    ).toEqual(match.result);
    expect(getStandings(doc).map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it.each(["ready", "live", "postponed", "contested", "canceled"] as const)(
    "excludes %s matches and their live scores from cumulative standings",
    (status) => {
      const source = fixture();
      let doc = enter(generateStage(source, source.stages[0].id), [
        clubScores[0],
      ]);
      const pending = matchBetween(doc, "A", "C");
      doc = changeMatchState(doc, pending.id, status);
      if (status === "live")
        doc.matches.find((match) => match.id === pending.id)!.liveScores = [
          13, 9,
        ];
      const rows = getStandings(validateTournament(doc));
      expect(rows.find((row) => row.participantId === "A")).toMatchObject({
        played: 1,
        wins: 1,
        differential: 8,
        scored: 13,
      });
      expect(rows.find((row) => row.participantId === "C")).toMatchObject({
        played: 0,
        wins: 0,
        differential: 0,
        scored: 0,
      });
    },
  );

  it("does not award wins or point totals to singleton group BYEs", () => {
    const source = fixture(undefined, "groups");
    source.stages[0].config.groupCount = 3;
    const doc = generateStage(source, source.stages[0].id);
    const byes = doc.matches.filter((match) => match.status === "bye");
    expect(byes).toHaveLength(2);
    for (const match of byes) {
      const rows = getStandings(doc, doc.stages[0].id, match.group);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        scored: 0,
        conceded: 0,
        differential: 0,
        points: 0,
      });
    }
    expect(getStandings(doc).every((row) => row.rank === 1 && row.tied)).toBe(
      true,
    );
  });

  it("isolates groups while retaining their actual results in the overall table", () => {
    const source = fixture(["A", "B", "C", "D", "E", "F", "G", "H"], "groups");
    source.stages[0].config.groupCount = 2;
    let doc = generateStage(source, source.stages[0].id);
    const groups = doc.stages[0].metadata.groups as string[][];
    const first = Object.fromEntries(
      ["A", "B", "C", "D"].map((id, index) => [id, groups[0][index]]),
    );
    doc = enter(
      doc,
      clubScores.map(([a, b, scored, conceded]) => [
        first[a],
        first[b],
        scored,
        conceded,
      ]),
    );
    const firstGroup = getStandings(doc, doc.stages[0].id, "A");
    const next = enter(doc, [[groups[1][0], groups[1][1], 21, 0]]);
    expect(getStandings(next, next.stages[0].id, "A")).toEqual(firstGroup);
    const secondGroup = getStandings(next, next.stages[0].id, "B");
    expect(secondGroup.map((row) => row.participantId).sort()).toEqual(
      [...groups[1]].sort(),
    );
    expect(secondGroup.reduce((sum, row) => sum + row.played, 0)).toBe(2);
    const all = getStandings(next);
    expect(all).toHaveLength(8);
    for (const row of [...firstGroup, ...secondGroup])
      expect(
        all.find((item) => item.participantId === row.participantId),
      ).toMatchObject({
        played: row.played,
        wins: row.wins,
        differential: row.differential,
        scored: row.scored,
      });
  });
});

describe("no-draw result entry", () => {
  it.each(["played", "draw"] as const)(
    "rejects equal numeric scores recorded as %s without changing results",
    (outcome) => {
      const source = fixture(["A", "B"]);
      const doc = generateStage(source, source.stages[0].id);
      const before = structuredClone(doc);
      expect(() =>
        recordResult(doc, doc.matches[0].id, {
          scores: [12, 12],
          winnerIds: ["A"],
          outcome,
          recordedAt: doc.updatedAt,
        }),
      ).toThrow("This match needs a winner");
      expect(doc).toEqual(before);
    },
  );

  it.each([
    [7, 3],
    [11, 4],
    [15, 8],
    [21, 20],
  ])(
    "accepts a decisive %i-%i score without imposing a target of 13",
    (winner, loser) => {
      const source = fixture(["A", "B"]);
      source.rules.targetScore = 13;
      const doc = enter(generateStage(source, source.stages[0].id), [
        ["A", "B", winner, loser],
      ]);
      expect(getStandings(doc)[0]).toMatchObject({
        participantId: "A",
        wins: 1,
        scored: winner,
        differential: winner - loser,
      });
    },
  );

  it("retains explicit forfeits as wins and losses without inventing scored points", () => {
    const source = fixture(["A", "B"]);
    const doc = generateStage(source, source.stages[0].id);
    const result = recordResult(doc, doc.matches[0].id, {
      scores: [0, 0],
      winnerIds: ["B"],
      outcome: "forfeit",
      recordedAt: doc.updatedAt,
    });
    expect(summary(result)).toMatchObject([
      { id: "B", wins: 1, scored: 0, conceded: 0 },
      { id: "A", losses: 1, scored: 0, conceded: 0 },
    ]);
  });
});

describe("saved Pétanque ranking rules and results", () => {
  it("saves ranking changes before play and recalculates after play without replacing results", async () => {
    const original = fixture();
    original.rules.tieBreakers = ["points", "scored"];
    let doc = await repository.create(original);
    doc.rules.tieBreakers = ["wins", "differential", "scored"];
    doc = await repository.save(doc, doc.revision, "Set club ranking order");
    expect((await repository.load(doc.id)).rules.tieBreakers).toEqual([
      "wins",
      "differential",
      "scored",
    ]);
    expect(getStandings(doc).every((row) => row.rank === 1 && row.tied)).toBe(
      true,
    );
    doc = enter(generateStage(doc, doc.stages[0].id), clubScores);
    doc = await repository.save(doc, doc.revision, "Record club results");
    const resultRevision = doc.revision;
    const savedResults = structuredClone(doc.matches);
    doc.rules.tieBreakers = ["wins", "scored", "differential"];
    doc = await repository.save(doc, doc.revision, "Review ranking order");
    expect(
      getStandings(await repository.load(doc.id)).map(
        (row) => row.participantId,
      ),
    ).toEqual(["A", "B", "C", "D"]);
    expect(doc.matches).toEqual(savedResults);
    const previous = await repository.loadRevision(doc.id, resultRevision);
    expect(summary(previous)).toEqual(summary(completed()));
    expect(previous.matches).toEqual(savedResults);
    doc.rules.tieBreakers = ["wins", "differential", "scored"];
    doc = await repository.save(
      doc,
      doc.revision,
      "Restore club ranking order",
    );
    expect(summary(await repository.load(doc.id))).toEqual(summary(previous));
    expect(doc.matches).toEqual(savedResults);
  });

  it.each(["public code", "private code", "archive"])(
    "preserves rules, scores and shared ranks through %s",
    async (transport) => {
      const docs = [completed(), completed("groups")];
      const tied = fixture(["A", "B", "C"]);
      docs.push(
        enter(generateStage(tied, tied.stages[0].id), [
          ["A", "B", 13, 5],
          ["B", "C", 13, 5],
          ["C", "A", 13, 5],
        ]),
      );
      for (const source of docs) {
        const imported =
          transport === "archive"
            ? await importArchive(await exportArchive(source))
            : await decodeCode(
                await encodeCode(
                  source,
                  undefined,
                  transport === "private code",
                ),
              );
        expect(imported.rules).toEqual(source.rules);
        expect(imported.matches.map((match) => match.result)).toEqual(
          source.matches.map((match) => match.result),
        );
        expect(summary(imported)).toEqual(summary(source));
      }
    },
  );
});
