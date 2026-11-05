import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, getStandings, recordResult } from "./index";

function tournament(count: number, groups: number, meetings: number) {
  const doc = createTournament(
    "Round robin groups",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1}`, index + 1),
      id: `p${index + 1}`,
    })),
    "groups",
  );
  doc.stages[0].config.groupCount = groups;
  doc.stages[0].config.meetings = meetings;
  return generateStage(doc, doc.stages[0].id);
}

describe("round robin group membership and standings", () => {
  it.each([
    [3, 2, 1],
    [7, 3, 1],
    [18, 4, 2],
    [16, 4, 3],
    [3, 3, 1],
    [128, 128, 1],
    [512, 128, 1],
  ])(
    "keeps %i entrants in %i groups for %i meetings",
    (count, groupCount, meetings) => {
      const doc = tournament(count, groupCount, meetings);
      const stage = doc.stages[0];
      const groups = stage.metadata.groups as string[][];
      expect(groups).toHaveLength(groupCount);
      expect(new Set(groups.flat()).size).toBe(count);
      expect(
        Math.max(...groups.map((ids) => ids.length)) -
          Math.min(...groups.map((ids) => ids.length)),
      ).toBeLessThanOrEqual(1);
      const names = [...new Set(doc.matches.map((match) => match.group!))];
      expect(names).toHaveLength(groupCount);
      const standingIds: string[] = [];
      for (const name of names) {
        const matches = doc.matches.filter((match) => match.group === name);
        const ids = [
          ...new Set(
            matches.flatMap((match) =>
              match.slots.flatMap((slot) =>
                slot.participantId ? [slot.participantId] : [],
              ),
            ),
          ),
        ];
        expect(
          groups.some(
            (group) => [...group].sort().join() === [...ids].sort().join(),
          ),
        ).toBe(true);
        const standings = getStandings(doc, stage.id, name);
        expect(standings.map((row) => row.participantId).sort()).toEqual(
          [...ids].sort(),
        );
        expect(
          standings.every((row) => row.played === 0 && row.points === 0),
        ).toBe(true);
        standingIds.push(...standings.map((row) => row.participantId));
        if (ids.length === 1) {
          expect(matches).toHaveLength(1);
          expect(matches[0].status).toBe("bye");
          continue;
        }
        expect(matches).toHaveLength(
          ((ids.length * (ids.length - 1)) / 2) * meetings,
        );
        const pairs = new Map<string, number>();
        const occupied = new Set<string>();
        for (const match of matches) {
          const entrants = match.slots.map((slot) => slot.participantId!);
          expect(new Set(entrants).size).toBe(2);
          const pair = [...entrants].sort().join(":");
          pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
          for (const id of entrants) {
            const key = `${match.round}:${id}`;
            expect(occupied.has(key)).toBe(false);
            occupied.add(key);
          }
        }
        expect(pairs.size).toBe((ids.length * (ids.length - 1)) / 2);
        expect([...pairs.values()].every((value) => value === meetings)).toBe(
          true,
        );
      }
      expect(standingIds.sort()).toEqual(
        doc.participants.map((participant) => participant.id).sort(),
      );
    },
  );

  it("applies a result only inside its group and keeps singleton standings", () => {
    const original = tournament(3, 2, 1);
    const match = original.matches.find((item) => item.status === "ready")!;
    const winner = match.slots[0].participantId!;
    const updated = recordResult(original, match.id, {
      scores: [4, 1],
      winnerIds: [winner],
      outcome: "played",
      recordedAt: original.updatedAt,
    });
    const played = getStandings(updated, match.stageId, match.group);
    expect(played.find((row) => row.participantId === winner)).toMatchObject({
      played: 1,
      wins: 1,
      scored: 4,
      conceded: 1,
      differential: 3,
      points: 3,
    });
    const singleton = updated.matches.find((item) => item.status === "bye")!;
    expect(
      getStandings(updated, singleton.stageId, singleton.group),
    ).toMatchObject([
      { participantId: singleton.slots[0].participantId, played: 0, points: 0 },
    ]);
    expect(
      original.matches.find((item) => item.id === match.id)!.result,
    ).toBeUndefined();
  });
});
