import { describe, expect, it } from "vitest";
import { generateStage, getChampion } from "../engine";
import { createLandingSample, playLandingSample } from "./landing-demo-model";

describe("landing page sample", () => {
  it("starts with the same match references and states as the tournament engine", () => {
    const sample = createLandingSample();
    const generated = generateStage(
      { ...sample, matches: [] },
      sample.stages[0].id,
    );
    expect(sample.matches).toEqual(generated.matches);
    expect(
      sample.matches.filter((match) => match.status === "ready"),
    ).toHaveLength(2);
    expect(sample.history).toEqual([]);
  });

  it("advances chosen winners and declares the real engine's champion without changing its input", async () => {
    const initial = createLandingSample();
    const semifinal = await playLandingSample(initial, "sample-ember");
    expect(initial.matches.every((match) => !match.result)).toBe(true);
    expect(semifinal.matches.at(-1)?.slots[0].participantId).toBe(
      "sample-ember",
    );
    const readyFinal = await playLandingSample(semifinal, "sample-sunrise");
    expect(readyFinal.matches.at(-1)?.status).toBe("ready");
    expect(
      readyFinal.matches.at(-1)?.slots.map((slot) => slot.participantId),
    ).toEqual(["sample-ember", "sample-sunrise"]);
    const finished = await playLandingSample(readyFinal, "sample-sunrise");
    expect(finished.status).toBe("completed");
    expect(getChampion(finished)?.id).toBe("sample-sunrise");
    expect(
      finished.matches.every((match) => match.status === "completed"),
    ).toBe(true);
  });

  it("rejects a participant outside the next match and resets without carrying previous results", async () => {
    const initial = createLandingSample();
    await expect(playLandingSample(initial, "sample-tide")).rejects.toThrow(
      "Choose a participant",
    );
    await playLandingSample(initial, "sample-cedar");
    const reset = createLandingSample();
    expect(reset.matches.every((match) => !match.result)).toBe(true);
    expect(
      reset.matches.filter((match) => match.status === "ready"),
    ).toHaveLength(2);
    expect(reset.history).toEqual([]);
  });
});
