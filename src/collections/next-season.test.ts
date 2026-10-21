import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { simulate } from "../engine";
import { createCollection, linkCompetition } from "./model";
import { aggregateRankings } from "./rankings";
import { createMovedSeason, planNextSeason } from "./next-season";

function fixture() {
  const documents = ["Premier", "Second"].map((title) =>
    simulate(
      createTournament(
        title,
        Array.from({ length: 4 }, (_, i) =>
          createParticipant(`${title} ${i + 1}`, i + 1),
        ),
        "round-robin",
      ),
    ),
  );
  let event = createCollection("League");
  event.divisions = [
    { id: "a", name: "Premier", promote: 0, relegate: 1 },
    { id: "b", name: "Second", promote: 1, relegate: 0 },
  ];
  documents.forEach((doc, i) => {
    event = linkCompetition(event, doc, doc.stages[0].id, i === 0 ? "a" : "b");
  });
  // Explicit season adjustments supply a strict order independent of simulated draws.
  event.adjustments = event.directory.map((p, i) => ({
    id: `adj-${i}`,
    directoryId: p.id,
    points: 1000 * (8 - i),
    reason: "Published season carry-over",
  }));
  return {
    event,
    documents,
    routes: [
      { divisionId: "a", promoteTo: "", relegateTo: "b" },
      { divisionId: "b", promoteTo: "a", relegateTo: "" },
    ],
  };
}
describe("next league season", () => {
  it("moves completed division rosters simultaneously without mutating the source", async () => {
    const { event, documents, routes } = fixture();
    const before = JSON.stringify({ event, documents });
    const promoted = aggregateRankings(event, documents, "b").rows[0]
      .directoryId;
    const relegated = aggregateRankings(event, documents, "a").rows.at(
      -1,
    )!.directoryId;
    const plan = planNextSeason(event, documents, routes);
    expect(plan.movements).toHaveLength(2);
    const result = await createMovedSeason(
      event,
      documents,
      routes,
      "Next league",
      "2027",
    );
    expect(
      result.collection.directory.find((p) => p.id === promoted)?.divisionId,
    ).toBe("a");
    expect(
      result.collection.directory.find((p) => p.id === relegated)?.divisionId,
    ).toBe("b");
    expect(result.collection.adjustments).toEqual([]);
    expect(
      result.tournaments.every(
        (t) =>
          t.matches.length === 0 &&
          t.participants.length === 4 &&
          t.status === "draft",
      ),
    ).toBe(true);
    expect(result.tournaments.map((t) => t.id)).not.toEqual(
      documents.map((t) => t.id),
    );
    expect(JSON.stringify({ event, documents })).toBe(before);
  });
  it("blocks unresolved cutoffs, incomplete source seasons and invalid routes", () => {
    const { event, documents, routes } = fixture();
    expect(() => planNextSeason(event, documents, [])).toThrow(
      /every division/,
    );
    routes[0].relegateTo = "a";
    expect(() => planNextSeason(event, documents, routes)).toThrow(
      /different destination/,
    );
    routes[0].relegateTo = "b";
    documents[0].stages[0].status = "active";
    expect(() => planNextSeason(event, documents, routes)).toThrow(
      /Complete every/,
    );
    documents[0].stages[0].status = "completed";
    const rows = aggregateRankings(event, documents, "a").rows;
    const last = rows.at(-1)!;
    event.adjustments.find((a) => a.directoryId === last.directoryId)!.points +=
      rows.at(-2)!.points - last.points;
    expect(() => planNextSeason(event, documents, routes)).toThrow(
      /tied ranking/,
    );
  });
});
