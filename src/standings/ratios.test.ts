import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { getStandings } from "./index";
import { ratio, standingEvidence } from "./ratios";

function cup() {
  const doc = createTournament(
    "Ratio cup",
    ["A", "B", "C"].map((name, i) => ({
      ...createParticipant(name, i + 1),
      id: name,
    })),
    "round-robin",
  );
  doc.rules.scoring = "sets";
  doc.rules.bestOf = 3;
  doc.rules.tieBreakers = ["points", "set-ratio"];
  return generateStage(doc, doc.stages[0].id);
}
function cycle(fairPlay = true) {
  let doc = cup();
  for (const [winner, loser, wins, losses] of [
    ["A", "B", 2, 0],
    ["B", "C", 2, 1],
    ["C", "A", 2, 1],
  ] as const) {
    const match = doc.matches.find(
      (m) =>
        m.slots.some((s) => s.participantId === winner) &&
        m.slots.some((s) => s.participantId === loser),
    )!;
    const winnerIndex = match.slots.findIndex(
      (s) => s.participantId === winner,
    );
    const sets = [
      ...Array.from({ length: losses }, () =>
        match.slots.map((_, index) => (index === winnerIndex ? 10 : 21)),
      ),
      ...Array.from({ length: wins }, () =>
        match.slots.map((_, index) => (index === winnerIndex ? 21 : 10)),
      ),
    ];
    doc = recordResult(doc, match.id, {
      scores: [0, 0],
      sets,
      winnerIds: [winner],
      outcome: "played",
      recordedAt: doc.updatedAt,
      ...(fairPlay
        ? {
            fairPlay: match.slots.map((slot) =>
              slot.participantId === "B"
                ? 0
                : slot.participantId === "C"
                  ? 1
                  : 2,
            ),
          }
        : {}),
    });
  }
  return doc;
}
describe("ratio and fair-play tiebreakers", () => {
  it("ranks a cyclic equal-points group from actual sets", () => {
    const doc = cycle();
    const rows = getStandings(doc, doc.stages[0].id);
    expect(rows.map((row) => row.participantId)).toEqual(["A", "C", "B"]);
    expect(rows[0]).toMatchObject({ setsWon: 3, setsLost: 2, setRatio: 1.5 });
    expect(rows[0].pointRatio).toBe((21 * 3 + 10 * 2) / (10 * 3 + 21 * 2));
  });
  it("orders explicit sanctions from fewest to most and skips missing evidence", () => {
    const doc = cycle();
    doc.rules.tieBreakers = ["points", "fair-play"];
    expect(getStandings(doc).map((row) => row.participantId)).toEqual([
      "B",
      "C",
      "A",
    ]);
    delete doc.matches[0].result!.fairPlay;
    expect(getStandings(doc).every((row) => row.rank === 1 && row.tied)).toBe(
      true,
    );
  });
  it("defines unbeaten and neutral ratios without NaN or invented set records", () => {
    expect(ratio(2, 0)).toBe(Infinity);
    expect(ratio(0, 0)).toBe(1);
    const doc = cycle(false);
    doc.matches[0].result!.sets = undefined;
    const evidence = standingEvidence(doc.matches, ["A", "B", "C"]);
    for (const slot of doc.matches[0].slots)
      expect(evidence.get(slot.participantId!)?.setRatio).toBeNull();
    expect([...evidence.values()].every((row) => row.fairPlay === null)).toBe(
      true,
    );
  });
  it("does not calculate a point ratio from negative scored values", () => {
    const doc = cycle(false);
    delete doc.matches[0].result!.sets;
    doc.matches[0].result!.scores = [-1, 0];
    doc.rules.tieBreakers = ["points", "point-ratio"];
    expect(getStandings(doc).every((row) => row.rank === 1)).toBe(true);
  });
  it("rejects invalid fair-play arrays at authoritative result entry", () => {
    const doc = cup(),
      match = doc.matches[0];
    expect(() =>
      recordResult(doc, match.id, {
        scores: [2, 0],
        sets: [
          [21, 10],
          [21, 10],
        ],
        winnerIds: [],
        fairPlay: [-1, 0],
        outcome: "played",
        recordedAt: doc.updatedAt,
      }),
    ).toThrow("between 0 and 1000000");
  });
});
