import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createParticipant, createTournament, type Tournament } from "../domain/types";
import { DEFAULT_SWISS_POLICY, swissPolicy } from "../domain/swiss";
import { validateTournament } from "../domain/validate";
import { getStandings } from "../standings";
import { advanceStage, generateStage, recordResult } from "./index";
import { admitSwissEntrant, setManualSwissPairings, setSwissPolicy, swissRoundEditable } from "./swiss-controls";
import { orientSwissPair } from "./swiss-colors";
import { decodeCode, encodeCode } from "../sharing";
import { decodeStageRecipe, encodeStageRecipe } from "../sharing/recipes";

function setup(count = 6) {
  const doc = createTournament("Swiss control", Array.from({ length: count }, (_, i) => createParticipant(`Player ${i + 1}`, i + 1)), "swiss");
  doc.stages[0].config.rounds = 3;
  doc.stages[0].config.swiss = { ...DEFAULT_SWISS_POLICY, allowLateEntrants: true };
  return generateStage(doc, doc.stages[0].id);
}
function finishRound(input: Tournament) {
  let doc = input;
  for (const match of doc.matches.filter((match) => match.status === "ready"))
    doc = recordResult(doc, match.id, { scores: [2, 0], winnerIds: [match.slots[0].participantId!], outcome: "played", recordedAt: doc.updatedAt });
  return doc;
}
describe("Swiss organizer controls", () => {
  it("changes only an unplayed latest round and keeps earlier results", () => {
    let doc = setup();
    const id = doc.stages[0].id, entrants = doc.stages[0].participantIds;
    doc.matches[0].scheduledAt = doc.schedule.startAt;
    doc = setManualSwissPairings(doc, id, [[entrants[0], entrants[5]], [entrants[1], entrants[4]], [entrants[2], entrants[3]]]);
    expect(doc.matches.every((match) => match.metadata.manualPairing && !match.scheduledAt)).toBe(true);
    expect(validateTournament(doc)).toEqual(doc);
    doc = finishRound(doc);
    const earlier = structuredClone(doc.matches);
    expect(() => setManualSwissPairings(doc, id, [])).toThrow("latest unplayed");
    doc = advanceStage(doc, id);
    const pairs = doc.matches.filter((match) => match.round === 2).map((match) => match.slots.flatMap((slot) => slot.participantId ? [slot.participantId] : []).reverse());
    const updated = setManualSwissPairings(doc, id, pairs);
    expect(updated.matches.filter((match) => match.round === 1)).toEqual(earlier);
    expect(() => setManualSwissPairings(doc, id, earlier.map((match) => match.slots.map((slot) => slot.participantId!)))).toThrow("repeat opponents");
  });

  it("enforces complete active fields, forbidden pairs, one bye and nonrepeated byes", () => {
    const doc = setup(5), stage = doc.stages[0], ids = stage.participantIds;
    expect(() => setManualSwissPairings(doc, stage.id, [[ids[0], ids[0]], [ids[1], ids[2]], [ids[3]]])).toThrow("exactly once");
    doc.stages[0].config.forbiddenPairs = [[ids[0], ids[1]]];
    expect(() => setManualSwissPairings(doc, stage.id, [[ids[0], ids[1]], [ids[2], ids[3]], [ids[4]]])).toThrow("forbidden-pair");
    expect(() => setManualSwissPairings(doc, stage.id, [[ids[0]], [ids[1]], [ids[2]], [ids[3], ids[4]]])).toThrow("exactly one");
    const legal = setManualSwissPairings(doc, stage.id, [[ids[0], ids[2]], [ids[1], ids[3]], [ids[4]]]);
    const next = advanceStage(finishRound(legal), stage.id);
    expect(() => setManualSwissPairings(next, stage.id, [[ids[0], ids[3]], [ids[1], ids[2]], [ids[4]]])).toThrow("has not received");
  });

  it("never silently edits live scores or outcome-referenced pairings", () => {
    const doc = setup(), stage = doc.stages[0];
    doc.matches[0].liveScores = [1, 0];
    expect(swissRoundEditable(doc, stage)).toBe(false);
    delete doc.matches[0].liveScores;
    doc.stages.push({ ...structuredClone(stage), id: "destination", sources: [{ stageId: stage.id, count: 1, perGroup: false, selection: { kind: "match-results", picks: [{ matchId: doc.matches[0].id, outcome: "winners" }] } }] });
    expect(swissRoundEditable(doc, stage)).toBe(false);
  });

  it("admits a late entrant between rounds with explicit credits and no invented games", () => {
    const before = finishRound(setup(4)), id = before.stages[0].id;
    const doc = admitSwissEntrant(before, id, "بازیکن تازه", 1);
    const added = doc.participants.at(-1)!;
    expect(doc.matches).toEqual(before.matches);
    expect(swissPolicy(doc.stages[0]).lateEntries).toEqual([{ participantId: added.id, joinedRound: 2, points: 1 }]);
    expect(getStandings(doc, id).find((row) => row.participantId === added.id)).toMatchObject({ points: 1, played: 0, wins: 0, buchholz: 0 });
    const next = advanceStage(doc, id);
    expect(next.matches.filter((match) => match.round === 2).flatMap((match) => match.slots.map((slot) => slot.participantId))).toContain(added.id);
    expect(validateTournament(next)).toEqual(next);
    expect(() => admitSwissEntrant(next, id, "Another", 0)).toThrow("between completed");
    expect(() => admitSwissEntrant(before, id, "Overcredit", before.rules.pointsWin + 1)).toThrow("win per missed");
    expect(() => admitSwissEntrant(before, id, "Player 1", 0)).toThrow("distinct");
  });

  it("protects stored credits and validates color policies", () => {
    const doc = finishRound(setup()), id = doc.stages[0].id;
    const policy = { ...swissPolicy(doc.stages[0]), colorPolicy: "balanced" as const };
    expect(setSwissPolicy(doc, id, policy).stages[0].config.swiss?.colorPolicy).toBe("balanced");
    policy.lateEntries = [{ participantId: doc.participants[0].id, joinedRound: 2, points: 1 }];
    expect(() => setSwissPolicy(doc, id, policy)).toThrow("credits cannot be changed");
    const playing = setup();
    expect(() => setSwissPolicy(playing, playing.stages[0].id, DEFAULT_SWISS_POLICY)).toThrow("completed round");
  });

  it("shares entry credits while recipes reset history and remap side preferences", async () => {
    const before = finishRound(setup(4)), id = before.stages[0].id;
    before.stages[0].config.swiss!.preferences = { [before.participants[0].id]: "second" };
    const doc = admitSwissEntrant(before, id, "Newcomer", 1);
    const shared = await decodeCode(await encodeCode(doc));
    expect(shared.stages[0].config.swiss).toEqual(doc.stages[0].config.swiss);
    expect(getStandings(shared, id).map((row) => row.points)).toEqual(getStandings(doc, id).map((row) => row.points));
    const recipe = await decodeStageRecipe(await encodeStageRecipe(doc));
    expect(recipe.stages[0].config.swiss!.lateEntries).toEqual([]);
    expect(recipe.stages[0].config.swiss!.preferences).toEqual({ [recipe.participants[0].id]: "second" });
  });

  it("balances side history and treats first-round color preferences as soft choices", () => {
    const doc = setup(), stage = doc.stages[0], pair = doc.matches[0].slots.map((slot) => slot.participantId!) as [string, string];
    stage.config.swiss = { ...DEFAULT_SWISS_POLICY, colorPolicy: "balanced", preferences: { [pair[0]]: "second", [pair[1]]: "first" } };
    expect(orientSwissPair(pair, [], stage, 1)).toEqual([...pair].reverse());
    expect(orientSwissPair(pair, [doc.matches[0]], stage, 3)).toEqual([...pair].reverse());
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (round) => {
      const oriented = orientSwissPair(pair, doc.matches, stage, round);
      expect(new Set(oriented)).toEqual(new Set(pair));
      expect(oriented).toEqual(orientSwissPair(pair, doc.matches, stage, round));
    }));
  });
});
