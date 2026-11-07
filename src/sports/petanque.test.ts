import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  createParticipant,
  createTournament,
  type FormatId,
} from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { db } from "../persistence";
import { exportArchive, importArchive } from "../sharing";
import { getStandings } from "../standings";
import { applySport, sports } from "./index";
import {
  applySavedSportPreset,
  importSportPreset,
  loadSportPresets,
  saveSportPreset,
} from "./library";

afterEach(async () => {
  await db.preferences.clear();
});

function fixture(format: FormatId = "round-robin") {
  const doc = createTournament(
    "Club afternoon",
    ["Elm", "Willow"].map((name, index) => ({
      ...createParticipant(name, index + 1),
      id: name,
    })),
    format,
  );
  doc.stages[0].config.groupCount = 1;
  return doc;
}

describe("Pétanque sport preset", () => {
  it("sets the club ranking order and no-draw policy without replacing a selected format", () => {
    const source = fixture("groups");
    const before = structuredClone(source);
    const doc = applySport(source, "petanque");
    expect(sports.find((preset) => preset.id === "petanque")).toMatchObject({
      name: "Pétanque",
      fa: "پتانک",
      defaultFormat: "round-robin",
    });
    expect(doc.sport).toBe("petanque");
    expect(doc.rules).toMatchObject({
      scoring: "high",
      allowDraws: false,
      pointsWin: 1,
      pointsDraw: 0,
      pointsLoss: 0,
      tieBreakers: ["wins", "differential", "scored"],
      targetScore: 13,
    });
    expect(
      doc.participants.every(
        (participant) => participant.kind === "individual",
      ),
    ).toBe(true);
    expect(doc.stages).toEqual(source.stages);
    expect(source).toEqual(before);
  });

  it("isolates edited club rules from defaults, other sports and the next tournament", () => {
    const source = fixture();
    const defaults = structuredClone(DEFAULT_RULES);
    const presets = structuredClone(sports);
    const otherSports = sports.filter((preset) => preset.id !== "petanque");
    const before = otherSports.map((preset) => applySport(source, preset.id));
    const doc = applySport(source, "petanque");
    doc.rules.tieBreakers.reverse();
    doc.rules.tieBreakers.push("seed");
    doc.rules.targetScore = 9;
    doc.rules.allowDraws = true;
    doc.rules.placementPoints[0] = 999;
    doc.rules.gol.playersPerTeam = 7;
    expect(DEFAULT_RULES).toEqual(defaults);
    expect(sports).toEqual(presets);
    expect(otherSports.map((preset) => applySport(source, preset.id))).toEqual(
      before,
    );
    const next = applySport(source, "petanque");
    expect(next.rules.tieBreakers).toEqual(["wins", "differential", "scored"]);
    expect(next.rules.allowDraws).toBe(false);
    expect(next.rules.targetScore).toBe(13);
    expect(next.rules.gol.playersPerTeam).toBe(defaults.gol.playersPerTeam);
  });

  it.each(["round-robin", "groups"] as const)(
    "rejects tied played scores and accepts agreed timed scores in %s",
    (format) => {
      const source = applySport(fixture(format), "petanque");
      const doc = generateStage(source, source.stages[0].id);
      const match = doc.matches[0];
      expect(() =>
        recordResult(doc, match.id, {
          scores: [7, 7],
          winnerIds: [],
          outcome: "played",
          recordedAt: doc.updatedAt,
        }),
      ).toThrow("This match needs a winner");
      const completed = recordResult(doc, match.id, {
        scores: [7, 3],
        winnerIds: [],
        outcome: "played",
        recordedAt: doc.updatedAt,
      });
      expect(getStandings(completed)[0]).toMatchObject({
        participantId: match.slots[0].participantId,
        wins: 1,
        differential: 4,
        scored: 7,
      });
      expect(completed.rules.targetScore).toBe(13);
      expect(doc.matches[0].result).toBeUndefined();
    },
  );

  it("preserves a custom target and club rules through saved presets and tournament backups", async () => {
    const source = applySport(fixture(), "petanque");
    source.rules.targetScore = 9;
    source.schedule.matchMinutes = 35;
    const saved = await saveSportPreset("Nine-point afternoon", source);
    const importedPreset = await importSportPreset(JSON.stringify(saved));
    expect(importedPreset.id).not.toBe(saved.id);
    expect(importedPreset.sport).toBe("petanque");
    expect(importedPreset.rules).toEqual(source.rules);
    expect(await loadSportPresets()).toHaveLength(2);
    let doc = applySavedSportPreset(fixture("groups"), importedPreset);
    expect(doc.stages[0].format).toBe("groups");
    expect(doc.schedule.matchMinutes).toBe(35);
    doc = generateStage(doc, doc.stages[0].id);
    doc = recordResult(doc, doc.matches[0].id, {
      scores: [9, 4],
      winnerIds: [],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
    const recovered = await importArchive(await exportArchive(doc));
    expect(recovered.sport).toBe("petanque");
    expect(recovered.rules).toEqual(source.rules);
    expect(recovered.matches).toEqual(doc.matches);
    expect(getStandings(recovered)).toEqual(getStandings(doc));
    expect(() => applySavedSportPreset(recovered, saved)).toThrow(
      "after play begins",
    );
    expect(recovered.rules.targetScore).toBe(9);
  });
});
