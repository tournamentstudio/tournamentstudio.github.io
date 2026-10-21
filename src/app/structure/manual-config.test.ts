import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
} from "../../domain/types";
import { generateStage, recordResult } from "../../engine";
import {
  manualGroupConfig,
  manualQualifierConfig,
  swissRestrictionConfig,
} from "./manual-config";

function document(format: "groups" | "swiss" | "round-robin" = "groups") {
  const value = createTournament(
    "Assignments",
    Array.from({ length: 8 }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    format,
  );
  value.stages[0].config.groupCount = 2;
  return value;
}
describe("manual stage assignments", () => {
  it("accepts complete uneven groups and rejects duplicate/missing entrants", () => {
    const input = document();
    const groups = [
      ["p1", "p2", "p3"],
      ["p4", "p5", "p6", "p7", "p8"],
    ];
    expect(manualGroupConfig(input, input.stages[0].id, groups).groups).toEqual(
      groups,
    );
    expect(input.stages[0].config.groups).toBeUndefined();
    expect(() =>
      manualGroupConfig(input, input.stages[0].id, [["p1"], ["p1"]]),
    ).toThrow();
  });
  it("preserves saved pot restrictions and existing matches", () => {
    const input = document();
    input.stages[0].config.draw = { version: 1, pots: [], restrictions: [] };
    expect(() => manualGroupConfig(input, input.stages[0].id, [])).toThrow(
      "Saved pot restrictions",
    );
    delete input.stages[0].config.draw;
    const drawn = generateStage(input, input.stages[0].id);
    expect(() => manualGroupConfig(drawn, input.stages[0].id, [])).toThrow(
      "Reset an unplayed draw",
    );
  });
  it("validates Swiss pairs and checks first-round feasibility", () => {
    const input = document("swiss"),
      id = input.stages[0].id;
    expect(
      swissRestrictionConfig(input, id, [["p1", "p2"]]).forbiddenPairs,
    ).toEqual([["p1", "p2"]]);
    expect(() => swissRestrictionConfig(input, id, [["p1", "p1"]])).toThrow(
      "distinct entrants",
    );
    expect(() =>
      swissRestrictionConfig(input, id, [
        ["p1", "p2"],
        ["p2", "p1"],
      ]),
    ).toThrow("already listed");
    expect(() =>
      swissRestrictionConfig(
        input,
        id,
        Array.from({ length: 7 }, (_, index) => ["p1", `p${index + 2}`]),
      ),
    ).toThrow("No pairing avoids all rematches");
  });
  it("manual qualification resolves a tied cutoff without selecting an ineligible entrant", () => {
    let input = document("round-robin");
    input.participants = input.participants.slice(0, 3);
    input.stages[0].participantIds = ["p1", "p2", "p3"];
    input.rules.allowDraws = true;
    input.rules.tieBreakers = ["points"];
    input = generateStage(input, input.stages[0].id);
    for (const match of input.matches.filter(
      (match) => match.status === "ready",
    ))
      input = recordResult(input, match.id, {
        scores: [0, 0],
        winnerIds: [],
        outcome: "draw",
        recordedAt: new Date().toISOString(),
      });
    input.stages.push({
      id: "finals",
      name: "Finals",
      format: "single-elimination",
      formatVersion: 1,
      order: 1,
      config: { ...DEFAULT_CONFIG },
      participantIds: [],
      sources: [{ stageId: input.stages[0].id, count: 2, perGroup: false }],
      status: "draft",
      metadata: {},
    });
    expect(
      manualQualifierConfig(input, "finals", ["p1", "p2"]).manualQualifiers,
    ).toEqual(["p1", "p2"]);
    expect(() =>
      manualQualifierConfig(input, "finals", ["p1", "p4"]),
    ).toThrow();
  });
});
