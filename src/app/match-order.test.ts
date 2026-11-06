import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { orderFixtures } from "./match-order";

function groupedFixture() {
  const doc = createTournament(
    "Fixture order",
    Array.from({ length: 40 }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "groups",
  );
  doc.stages[0].config.groupCount = 10;
  return generateStage(doc, doc.stages[0].id);
}

describe("match desk fixture order", () => {
  it("orders all groups before slicing pages and preserves stored matches", () => {
    const doc = groupedFixture();
    const original = structuredClone(doc.matches);
    const matches = doc.matches.slice(2);
    const ordered = orderFixtures(matches, doc.stages);
    expect(ordered).toHaveLength(58);
    expect(ordered.map((match) => match.round)).toEqual(
      ordered.map((match) => match.round).sort((a, b) => a - b),
    );
    expect(ordered.slice(0, 10).every((match) => match.round === 1)).toBe(true);
    expect(ordered.slice(50).every((match) => match.round === 3)).toBe(true);
    expect(doc.matches).toEqual(original);
    expect(matches).toEqual(original.slice(2));
  });

  it("uses declared stage order before numeric round and keeps equal-round draw order", () => {
    const doc = groupedFixture();
    const firstStage = { ...doc.stages[0], id: "first", order: 0 };
    const secondStage = { ...doc.stages[0], id: "second", order: 1 };
    const matches = [
      { ...doc.matches[0], id: "later-stage", stageId: "second", round: 1 },
      { ...doc.matches[0], id: "round-ten", stageId: "first", round: 10 },
      {
        ...doc.matches[0],
        id: "group-b",
        stageId: "first",
        round: 2,
        group: "B",
      },
      {
        ...doc.matches[0],
        id: "group-a",
        stageId: "first",
        round: 2,
        group: "A",
      },
    ];
    expect(
      orderFixtures(matches, [secondStage, firstStage]).map(
        (match) => match.id,
      ),
    ).toEqual(["group-b", "group-a", "round-ten", "later-stage"]);
  });
});
