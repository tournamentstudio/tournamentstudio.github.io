import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { DEFAULT_SWISS_POLICY, swissPairingBonus } from "../domain/swiss";
import { validateTournament } from "../domain/validate";
import { getStandings } from "../standings";
import { decodeCode, encodeCode } from "../sharing";
import { decodeStageRecipe, encodeStageRecipe } from "../sharing/recipes";
import { advanceStage, generateStage, recordResult } from "./index";
import { setSwissPolicy } from "./swiss-controls";

function fixture(count = 8) {
  const doc = createTournament(
    "Accelerated Swiss",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`Player ${i + 1}`, i + 1),
    ),
    "swiss",
  );
  const stage = doc.stages[0];
  stage.config.rounds = 4;
  stage.config.swiss = {
    ...DEFAULT_SWISS_POLICY,
    allowLateEntrants: true,
    acceleration: {
      policy: "fixed-group-v1",
      points: 3,
      rounds: 2,
      participantIds: stage.participantIds.filter((_, i) => i % 2 === 0),
    },
  };
  return doc;
}
function finish(input: Tournament) {
  let doc = input;
  for (const match of doc.matches.filter((m) => m.status === "ready"))
    doc = recordResult(doc, match.id, {
      scores: [1, 0],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
  return doc;
}
describe("fixed-group Swiss acceleration", () => {
  it("pairs with virtual points while official standings and bye priority stay real", () => {
    const source = fixture(9),
      stage = source.stages[0],
      group = stage.config.swiss!.acceleration!.participantIds;
    const ordinary = structuredClone(source);
    delete ordinary.stages[0].config.swiss!.acceleration;
    const accelerated = generateStage(source, stage.id),
      plain = generateStage(ordinary, stage.id);
    const pairs = accelerated.matches.filter((m) => m.status !== "bye");
    expect(
      pairs.every(
        (m) =>
          m.slots.every((s) => group.includes(s.participantId!)) ||
          m.slots.every((s) => !group.includes(s.participantId!)),
      ),
    ).toBe(true);
    expect(accelerated.matches).not.toEqual(plain.matches);
    expect(
      accelerated.matches.find((m) => m.status === "bye")!.result?.winnerIds,
    ).toEqual(plain.matches.find((m) => m.status === "bye")!.result?.winnerIds);
    expect(getStandings(accelerated, stage.id)).toEqual(
      getStandings(plain, stage.id),
    );
    const completed = finish(accelerated),
      withoutBonus = structuredClone(completed);
    delete withoutBonus.stages[0].config.swiss!.acceleration;
    expect(getStandings(completed, stage.id)).toEqual(
      getStandings(withoutBonus, stage.id),
    );
    expect(swissPairingBonus(stage, group[0], 2)).toBe(3);
    expect(swissPairingBonus(stage, group[0], 3)).toBe(0);
  });
  it("locks the starting group after drawing, including completed rounds", () => {
    const initial = fixture(),
      drawn = generateStage(initial, initial.stages[0].id),
      doc = finish(drawn);
    const policy = structuredClone(doc.stages[0].config.swiss!);
    policy.acceleration!.points = 5;
    expect(() => setSwissPolicy(doc, doc.stages[0].id, policy)).toThrow(
      "fixed after the first draw",
    );
    policy.acceleration!.points = 3;
    policy.colorPolicy = "balanced";
    expect(
      setSwissPolicy(doc, doc.stages[0].id, policy).stages[0].config.swiss!
        .colorPolicy,
    ).toBe("balanced");
  });
  it("rejects duplicate, unknown, late and full-field members or acceleration through the final round", () => {
    const source = fixture(),
      ids = source.stages[0].participantIds;
    for (const members of [[ids[0], ids[0]], ["unknown"], ids]) {
      const doc = structuredClone(source);
      doc.stages[0].config.swiss!.acceleration!.participantIds = members;
      expect(() => validateTournament(doc)).toThrow("fixed proper subset");
    }
    source.stages[0].config.swiss!.lateEntries = [
      { participantId: ids[0], joinedRound: 2, points: 0 },
    ];
    expect(() => validateTournament(source)).toThrow("fixed proper subset");
    source.stages[0].config.swiss!.lateEntries = [];
    source.stages[0].config.swiss!.acceleration!.rounds = 4;
    expect(() => validateTournament(source)).toThrow("before the final round");
  });
  it("runs a deterministic odd-field competition without repeated opponents or byes", () => {
    const source = fixture(17);
    expect(generateStage(source, source.stages[0].id)).toEqual(
      generateStage(source, source.stages[0].id),
    );
    let doc = generateStage(source, source.stages[0].id);
    for (let round = 1; round <= 4; round++) {
      doc = finish(doc);
      if (round < 4) doc = advanceStage(doc, doc.stages[0].id);
    }
    expect(validateTournament(doc)).toEqual(doc);
    const pairs = doc.matches
      .filter((m) => m.status !== "bye")
      .map((m) =>
        m.slots
          .map((s) => s.participantId)
          .sort()
          .join("/"),
      );
    expect(new Set(pairs).size).toBe(pairs.length);
    const byes = doc.matches
      .filter((m) => m.status === "bye")
      .flatMap((m) => m.result!.winnerIds);
    expect(new Set(byes).size).toBe(4);
  });
  it("preserves snapshot groups and remaps recipe references without original names", async () => {
    const doc = fixture();
    expect(
      (await decodeCode(await encodeCode(doc))).stages[0].config.swiss,
    ).toEqual(doc.stages[0].config.swiss);
    const recipe = await decodeStageRecipe(await encodeStageRecipe(doc));
    expect(recipe.stages[0].config.swiss!.acceleration!.participantIds).toEqual(
      recipe.participants.filter((_, i) => i % 2 === 0).map((p) => p.id),
    );
    expect(validateTournament(recipe)).toEqual(recipe);
  });
});
