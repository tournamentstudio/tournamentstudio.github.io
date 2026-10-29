import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../persistence";
import { createTournament, createParticipant } from "../domain/types";
import { generateStage, simulate } from "../engine";
import { applySport } from "./index";
import {
  applySavedSportPreset,
  deleteSportPreset,
  importSportPreset,
  loadSportPresets,
  saveSportPreset,
} from "./library";

beforeEach(async () => {
  await db.preferences.clear();
});
function fixture() {
  return applySport(
    createTournament(
      "Private event",
      Array.from({ length: 13 }, (_, i) =>
        createParticipant(`Person ${i}`, i + 1),
      ),
      "single-elimination",
    ),
    "gol-ya-pooch",
  );
}
describe("reusable sport presets", () => {
  it("stores rules and design while removing entrant, result and image data", async () => {
    const t = fixture();
    t.theme.logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=";
    t.rules.targetScore = 9;
    const preset = await saveSportPreset("Nine-point club", t);
    expect(preset.rules.targetScore).toBe(9);
    expect(preset.theme.logo).toBeUndefined();
    expect(JSON.stringify(preset)).not.toContain("Person 1");
    expect(JSON.stringify(preset)).not.toContain("Private event");
    expect(await loadSportPresets()).toHaveLength(1);
  });
  it("applies to a generated unplayed bracket with byes without changing match IDs", async () => {
    const t = fixture(),
      preset = await saveSportPreset("Club rules", t),
      generated = generateStage(t, t.stages[0].id);
    preset.rules.targetScore = 12;
    preset.duration = 35;
    preset.theme.preset = "gol-night";
    const next = applySavedSportPreset(generated, preset);
    expect(next.matches).toEqual(generated.matches);
    expect(next.rules.targetScore).toBe(12);
    expect(next.schedule.matchMinutes).toBe(35);
    expect(next.theme.preset).toBe("gol-night");
    expect(generated.rules.targetScore).toBe(6);
  });
  it("rejects replacement after play begins and rejects unsafe imports", async () => {
    const t = fixture(),
      preset = await saveSportPreset("Club", t),
      complete = simulate(generateStage(t, t.stages[0].id));
    expect(() => applySavedSportPreset(complete, preset)).toThrow(
      "after play begins",
    );
    await expect(
      importSportPreset(JSON.stringify({ ...preset, script: "alert(1)" })),
    ).rejects.toThrow();
    await expect(importSportPreset(" ".repeat(128 * 1024 + 1))).rejects.toThrow(
      "128 KiB",
    );
  });
  it("roundtrips independent files with fresh IDs and supports deletion", async () => {
    const t = fixture(),
      first = await saveSportPreset("Original", t),
      second = await importSportPreset(JSON.stringify(first));
    expect(second.id).not.toBe(first.id);
    expect(second.rules).toEqual(first.rules);
    expect(await loadSportPresets()).toHaveLength(2);
    await deleteSportPreset(first.id);
    expect((await loadSportPresets())[0].id).toBe(second.id);
  });
});
