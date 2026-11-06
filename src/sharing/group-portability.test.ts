import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Tournament,
} from "../domain/types";
import { generatedGroupLabel } from "../domain/group-labels";
import { getStandings, simulate } from "../engine";
import { applySport, sports } from "../sports";
import { decodeCode, encodeCode, exportArchive, importArchive } from "./index";

function fixture(count: number, format: FormatId = "groups") {
  return createTournament(
    "Group review بازبینی گروه‌ها",
    Array.from({ length: count }, (_, index) => ({
      ...createParticipant(`Team ${index + 1} تیم`, index + 1),
      id: `entrant-${index + 1}`,
    })),
    format,
  );
}

describe("group competition across sport presets", () => {
  it.each(sports.map((sport) => sport.id))(
    "completes uneven repeated groups with %s scoring",
    (sport) => {
      const source = applySport(fixture(18), sport);
      source.stages[0].config.groupCount = 4;
      source.stages[0].config.meetings = 2;
      const before = structuredClone(source);
      const completed = simulate(source);
      expect(source).toEqual(before);
      const stage = completed.stages[0];
      expect(stage.status).toBe("completed");
      expect(
        completed.matches.every((match) => match.status === "completed"),
      ).toBe(true);
      const groups = stage.metadata.groups as string[][];
      expect(groups.map((ids) => ids.length).sort()).toEqual([4, 4, 5, 5]);
      expect(groups.flat().sort()).toEqual([...stage.participantIds].sort());
      for (const [index, ids] of groups.entries()) {
        const label = generatedGroupLabel(stage, index);
        const matches = completed.matches.filter(
          (match) => match.group === label,
        );
        expect(matches).toHaveLength(ids.length * (ids.length - 1));
        const rows = getStandings(completed, stage.id, label);
        expect(rows.map((row) => row.participantId).sort()).toEqual(
          [...ids].sort(),
        );
        for (const row of rows) {
          expect(row.played).toBe(2 * (ids.length - 1));
          expect(row.wins + row.losses).toBe(row.played);
          expect(row.draws).toBe(0);
          expect(Number.isFinite(row.points)).toBe(true);
        }
        if (source.rules.scoring === "sets")
          expect(matches.every((match) => match.result!.sets!.length > 0)).toBe(
            true,
          );
      }
    },
  );
});

function competitionState(doc: Tournament) {
  const stage = doc.stages[0];
  const labels = [...new Set(doc.matches.map((match) => match.group))];
  return {
    labelVersion: stage.config.groupLabelVersion,
    participantIds: stage.participantIds,
    groups: stage.metadata.groups,
    matches: doc.matches.map((match) => ({
      id: match.id,
      group: match.group,
      round: match.round,
      slots: match.slots,
      status: match.status,
      result: match.result,
      qualifier: match.metadata.qualifier,
    })),
    tables: labels.map((label) => getStandings(doc, stage.id, label)),
  };
}

const transports = [
  {
    name: "public code",
    roundtrip: async (doc: Tournament) => decodeCode(await encodeCode(doc)),
  },
  {
    name: "private code",
    roundtrip: async (doc: Tournament) =>
      decodeCode(await encodeCode(doc, undefined, true)),
  },
  {
    name: "archive",
    roundtrip: async (doc: Tournament) =>
      importArchive(await exportArchive(doc)),
  },
];

describe.each(transports)("group identities through $name", ({ roundtrip }) => {
  it.each(["current groups", "legacy groups", "round robin", "GSL"])(
    "retains results, ranks and qualifying paths for %s",
    async (kind) => {
      const format =
        kind === "GSL"
          ? "gsl"
          : kind === "round robin"
            ? "round-robin"
            : "groups";
      const source = fixture(
        format === "groups" ? 54 : format === "gsl" ? 8 : 7,
        format,
      );
      source.stages[0].config.groupCount = format === "groups" ? 27 : 2;
      if (kind === "legacy groups")
        delete source.stages[0].config.groupLabelVersion;
      const completed = simulate(source);
      expect(completed.stages[0].status).toBe("completed");
      const before = competitionState(completed);
      const imported = await roundtrip(completed);
      expect(competitionState(imported)).toEqual(before);
      expect(imported.title).toBe(completed.title);
      expect(
        imported.participants.map((participant) => participant.name),
      ).toEqual(completed.participants.map((participant) => participant.name));
      if (format === "groups")
        expect(imported.matches.at(-1)!.group).toBe(
          kind === "legacy groups" ? "[" : "AA",
        );
      expect(competitionState(completed)).toEqual(before);
    },
  );
});
