import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, previewKnockoutDraw, recordResult } from "../engine";
import { bracketSVG, printableHTML, tournamentCSV } from "../export";
import {
  applyPatch,
  createPatch,
  decodeCode,
  decodePatch,
  decodeRecipe,
  encodeCode,
  encodePatch,
  encodeRecipe,
  exportArchive,
  importArchive,
  publicProjection,
  sealDocument,
} from "./index";

function fixture() {
  const tournament = createTournament(
    "جام فاصله",
    Array.from({ length: 4 }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      location: { latitude: 12.34567, longitude: index + 45.67891 },
    })),
    "single-elimination",
  );
  const stage = tournament.stages[0];
  stage.config.knockoutDraw = {
    version: 5,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    distance: {
      minKm: 0,
      maxKm: 1000,
      winnersThroughRound: 2,
      losersThroughRound: 0,
      finals: [],
    },
  };
  return generateStage(tournament, stage.id);
}

describe("distance rule privacy and portable data", () => {
  it("omits coordinates from public views while preserving the generated draw and rules", () => {
    const tournament = fixture();
    const visible = publicProjection(tournament);
    expect(
      visible.participants.every((entrant) => !("location" in entrant)),
    ).toBe(true);
    expect(visible.stages[0].config.knockoutDraw).toEqual(
      tournament.stages[0].config.knockoutDraw,
    );
    expect(visible.matches.map((match) => match.slots)).toEqual(
      tournament.matches.map((match) => match.slots),
    );
    for (const output of [
      JSON.stringify(visible),
      bracketSVG(tournament),
      printableHTML(tournament),
      tournamentCSV(tournament, "participants"),
    ]) {
      expect(output).not.toContain("12.34567");
      expect(output).not.toContain("45.67891");
      expect(output).not.toContain('"latitude"');
    }
    expect(previewKnockoutDraw(visible, visible.stages[0].id).ready).toBe(
      false,
    );
  });

  it("public codes reconstruct saved matches without exposing locations", async () => {
    const tournament = fixture();
    const restored = await decodeCode(await encodeCode(tournament));
    expect(restored.participants.every((entrant) => !entrant.location)).toBe(
      true,
    );
    expect(restored.stages[0].config.knockoutDraw).toEqual(
      tournament.stages[0].config.knockoutDraw,
    );
    expect(restored.matches).toEqual(publicProjection(tournament).matches);
    expect(restored.title).toBe("جام فاصله");
    const match = restored.matches.find((item) => item.status === "ready")!;
    const scored = recordResult(restored, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-10-20T12:00:00Z",
    });
    expect(
      scored.matches.find((item) => item.id === match.id)?.result?.scores,
    ).toEqual([2, 1]);
    expect(
      tournament.matches.find((item) => item.id === match.id)?.result,
    ).toBeUndefined();
  });

  it("private codes and encrypted backups retain locations and reproduce the draw", async () => {
    const tournament = fixture();
    const archive = await exportArchive(
      tournament,
      "test-only-distance-secret",
    );
    await expect(
      importArchive(archive, "test-only-wrong-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(tournament, undefined, true)),
      await importArchive(await exportArchive(tournament)),
      await importArchive(archive, "test-only-distance-secret"),
    ]) {
      expect(restored.participants).toEqual(tournament.participants);
      expect(
        previewKnockoutDraw(restored, restored.stages[0].id).slots,
      ).toEqual(previewKnockoutDraw(tournament, tournament.stages[0].id).slots);
      restored.participants[0].location!.latitude = 0;
      expect(tournament.participants[0].location!.latitude).toBe(12.34567);
    }
  });

  it("recipes retain a zero minimum but require new coordinates before drawing", async () => {
    const tournament = fixture();
    const recipe = await decodeRecipe(await encodeRecipe(tournament));
    expect(recipe.participants.every((entrant) => !entrant.location)).toBe(
      true,
    );
    expect(recipe.stages[0].config.knockoutDraw).toEqual(
      tournament.stages[0].config.knockoutDraw,
    );
    expect(previewKnockoutDraw(recipe, recipe.stages[0].id).ready).toBe(false);
    expect(recipe.matches).toHaveLength(0);
  });

  it("public updates omit changed coordinates while delivering a confirmed result", async () => {
    const base = await sealDocument(fixture());
    const match = base.matches.find((item) => item.status === "ready")!;
    const target = recordResult(base, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-10-20T12:00:00Z",
    });
    target.participants[0].location!.latitude = 23.45678;
    target.revision = base.revision + 1;
    const publicBase = await sealDocument(publicProjection(base));
    const publicTarget = await sealDocument(publicProjection(target));
    const patch = await createPatch(publicBase, publicTarget);
    expect(JSON.stringify(patch)).not.toContain("latitude");
    expect(
      patch.operations.some(
        (operation) => operation.path[0] === "participants",
      ),
    ).toBe(false);
    const restored = await applyPatch(
      publicBase,
      await decodePatch(await encodePatch(patch)),
    );
    expect(restored).toEqual(publicTarget);
    expect(
      restored.matches.find((item) => item.id === match.id)?.result?.scores,
    ).toEqual([2, 1]);
  });

  it("private update packets retain deliberate coordinate changes", async () => {
    const base = await sealDocument(fixture());
    const edited = structuredClone(base);
    edited.participants[0].location!.latitude = 23.45678;
    edited.revision++;
    const target = await sealDocument(edited);
    const patch = await createPatch(base, target);
    const restored = await applyPatch(
      base,
      await decodePatch(await encodePatch(patch)),
    );
    expect(restored.participants[0].location).toEqual(
      target.participants[0].location,
    );
    expect(restored).toEqual(target);
  });
});
