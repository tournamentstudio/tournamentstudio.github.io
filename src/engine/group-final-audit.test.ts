import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Match,
} from "../domain/types";
import { generatedGroupLabel } from "../domain/group-labels";
import { roundRobin } from "./formats";
import { generateStage, getStandings, recordResult } from "./index";

function fixture(count: number, format: FormatId = "groups") {
  const doc = createTournament(
    "Grouping audit",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    format,
  );
  doc.stages[0].id = "groups";
  doc.stages[0].config.groupCount = Math.ceil(count / 4);
  return doc;
}

function expectSchedule(matches: Match[], ids: string[], meetings: number) {
  const pairs = new Map<string, Match[]>();
  const occupied = new Set<string>();
  const home = new Map(ids.map((id) => [id, 0]));
  const away = new Map(ids.map((id) => [id, 0]));
  for (const match of matches) {
    const entrants = match.slots.map((slot) => slot.participantId!);
    expect(entrants).toHaveLength(2);
    expect(new Set(entrants).size).toBe(2);
    for (const id of entrants) {
      expect(ids).toContain(id);
      const key = `${match.round}:${id}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
    const pair = [...entrants].sort().join(":");
    pairs.set(pair, [...(pairs.get(pair) ?? []), match]);
    home.set(entrants[0], home.get(entrants[0])! + 1);
    away.set(entrants[1], away.get(entrants[1])! + 1);
  }
  expect(pairs.size).toBe((ids.length * (ids.length - 1)) / 2);
  for (const encounters of pairs.values()) {
    expect(encounters).toHaveLength(meetings);
    for (let index = 1; index < encounters.length; index++)
      expect(encounters[index].slots.map((slot) => slot.participantId)).toEqual(
        encounters[index - 1].slots.map((slot) => slot.participantId).reverse(),
      );
  }
  for (const id of ids) {
    expect(home.get(id)! + away.get(id)!).toBe((ids.length - 1) * meetings);
    expect(Math.abs(home.get(id)! - away.get(id)!)).toBeLessThanOrEqual(1);
  }
}

describe("round robin fixture fairness", () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 13, 17, 31, 64, 127, 128])(
    "balances home and away games for %i entrants in each supported repeat pattern",
    (count) => {
      const doc = fixture(count, "round-robin");
      const stage = doc.stages[0];
      for (const meetings of [1, 2, 3, 12]) {
        stage.config.meetings = meetings;
        const matches = roundRobin(stage, stage.participantIds);
        expect(matches).toHaveLength(((count * (count - 1)) / 2) * meetings);
        expect(new Set(matches.map((match) => match.id)).size).toBe(
          matches.length,
        );
        expectSchedule(matches, stage.participantIds, meetings);
      }
    },
  );
});

describe("generated group schedules", () => {
  it.each([3, 7, 13, 16, 18, 24, 31, 64, 127, 128, 256, 512])(
    "preserves group membership and standings for %i entrants",
    (count) => {
      for (const meetings of [1, 2, 3]) {
        const draft = fixture(count);
        draft.stages[0].config.meetings = meetings;
        const before = structuredClone(draft);
        const doc = generateStage(draft, "groups");
        expect(draft).toEqual(before);
        const stage = doc.stages[0];
        const groups = stage.metadata.groups as string[][];
        expect(groups).toHaveLength(stage.config.groupCount);
        expect(groups.flat().sort()).toEqual([...stage.participantIds].sort());
        expect(new Set(doc.matches.map((match) => match.id)).size).toBe(
          doc.matches.length,
        );
        for (const [index, ids] of groups.entries()) {
          const label = generatedGroupLabel(stage, index);
          const matches = doc.matches.filter((match) => match.group === label);
          expectSchedule(matches, ids, meetings);
          const standings = getStandings(doc, stage.id, label);
          expect(standings.map((row) => row.participantId).sort()).toEqual(
            [...ids].sort(),
          );
          expect(
            standings.every((row) => row.played === 0 && row.points === 0),
          ).toBe(true);
        }
      }
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 129])(
    "rejects invalid group count %s without changing the document",
    (count) => {
      const draft = fixture(16);
      draft.stages[0].config.groupCount = count;
      const before = structuredClone(draft);
      expect(() => generateStage(draft, "groups")).toThrow();
      expect(draft).toEqual(before);
    },
  );

  it.each([4, 8, 12, 20])(
    "completes GSL groups for %i entrants with two qualifiers per group",
    (count) => {
      let doc = generateStage(fixture(count, "gsl"), "groups");
      let ready = doc.matches.find((match) => match.status === "ready");
      while (ready) {
        const winningSlot = ready.round % 2;
        doc = recordResult(doc, ready.id, {
          scores: [winningSlot === 0 ? 2 : 0, winningSlot === 1 ? 2 : 0],
          winnerIds: [ready.slots[winningSlot].participantId!],
          outcome: "played",
          recordedAt: doc.updatedAt,
        });
        ready = doc.matches.find((match) => match.status === "ready");
      }
      expect(doc.stages[0].status).toBe("completed");
      expect(doc.matches).toHaveLength((count / 4) * 5);
      const groups = doc.stages[0].metadata.groups as string[][];
      for (const [index, ids] of groups.entries()) {
        const label = generatedGroupLabel(doc.stages[0], index);
        const matches = doc.matches.filter((match) => match.group === label);
        expect(matches.every((match) => match.status === "completed")).toBe(
          true,
        );
        expect(
          matches
            .flatMap((match) => match.slots)
            .every((slot) => ids.includes(slot.participantId!)),
        ).toBe(true);
        const qualifiers = matches
          .filter((match) => match.metadata.qualifier)
          .map((match) => match.result!.winnerIds[0]);
        expect(new Set(qualifiers).size).toBe(2);
        const standings = getStandings(doc, "groups", label);
        expect(standings.slice(0, 2).map((row) => row.participantId)).toEqual(
          qualifiers,
        );
        expect(standings.slice(2).every((row) => row.losses === 2)).toBe(true);
      }
    },
  );
});
