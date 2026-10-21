import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, previewKnockoutDraw } from "./index";
import { decodeCode, encodeCode } from "../sharing";
import { decodeStageRecipe, encodeStageRecipe } from "../sharing/recipes";
import {
  withDistanceRule,
  withSeparationRules,
} from "../app/structure/knockout-config";
import { previewAutomaticKnockoutVenues } from "./automatic-venues";

function fixture(count = 8) {
  const doc = createTournament(
    "Pinned entrants",
    Array.from({ length: count }, (_, i) => ({
      ...createParticipant(`Team ${i + 1}`, i + 1),
      region: `Region ${i % 2}`,
      location: { latitude: 0, longitude: 0 },
    })),
    "double-elimination",
  );
  doc.stages[0].config.knockoutDraw = {
    version: 1,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    fixedSlots: [{ participantId: doc.participants[3].id, slot: 1 }],
  };
  return doc;
}
describe("explicit protected knockout slots", () => {
  it("pins arbitrary seeds, stays reproducible and persists in generated matches", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 7 }),
        fc.integer({ min: 1, max: 8 }),
        (seedIndex, slot) => {
          const doc = fixture(),
            stage = doc.stages[0];
          stage.config.knockoutDraw!.fixedSlots = [
            { participantId: doc.participants[seedIndex].id, slot },
          ];
          const preview = previewKnockoutDraw(doc, stage.id);
          expect(preview.issues).toEqual([]);
          expect(preview.slots[slot - 1]).toBe(doc.participants[seedIndex].id);
          expect(previewKnockoutDraw(doc, stage.id)).toEqual(preview);
          const generated = generateStage(doc, stage.id)
            .matches.filter(
              (match) => match.bracket === "winners" && match.round === 1,
            )
            .flatMap((match) => match.slots.map((slot) => slot.participantId));
          expect(generated).toEqual(preview.slots);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("rejects duplicate, inactive, oversized and conflicting protected positions", () => {
    const doc = fixture(),
      stage = doc.stages[0],
      draw = stage.config.knockoutDraw!;
    draw.fixedSlots!.push({ participantId: doc.participants[4].id, slot: 1 });
    expect(() => validateTournament(doc)).toThrow("distinct active entrants");
    draw.fixedSlots!.pop();
    draw.fixedSlots![0].slot = 9;
    expect(previewKnockoutDraw(doc, stage.id).issues.join(" ")).toContain(
      "distinct active entrants",
    );
    draw.fixedSlots![0].slot = 1;
    draw.protectedSeeds = 1;
    expect(previewKnockoutDraw(doc, stage.id).issues.join(" ")).toContain(
      "Protected seed",
    );
    draw.protectedSeeds = 0;
    doc.participants[3].status = "withdrawn";
    expect(previewKnockoutDraw(doc, stage.id).issues.join(" ")).toContain(
      "distinct active entrants",
    );
  });

  it("keeps fixed slots through rule upgrades and automatic venue proposals", () => {
    const doc = fixture(),
      stage = doc.stages[0],
      fixed = stage.config.knockoutDraw!.fixedSlots;
    const separated = withSeparationRules(
      stage.config.knockoutDraw!,
      [],
      [],
      ["region"],
    );
    expect(separated.fixedSlots).toEqual(fixed);
    stage.config.knockoutDraw = withDistanceRule(separated, {
      minKm: 0,
      winnersThroughRound: 1,
      losersThroughRound: 0,
      finals: [],
    });
    expect(previewKnockoutDraw(doc, stage.id).ready).toBe(true);
    doc.schedule.resources = [
      { id: "court", name: "Court", location: { latitude: 0, longitude: 0 } },
    ];
    const proposal = previewAutomaticKnockoutVenues(doc, stage.id, {
      resourceIds: ["court"],
      targets: [{ bracket: "winners", round: 1, index: 0 }],
      maxKm: 1,
    });
    expect(proposal.ready).toBe(true);
    expect(proposal.draw!.fixedSlots).toEqual(fixed);
    expect(proposal.preview!.slots[0]).toBe(doc.participants[3].id);
  });

  it("preserves fixed IDs in snapshots and maps them to new recipe entrants", async () => {
    const doc = fixture();
    expect(
      (await decodeCode(await encodeCode(doc))).stages[0].config.knockoutDraw!
        .fixedSlots,
    ).toEqual(doc.stages[0].config.knockoutDraw!.fixedSlots);
    const recipe = await decodeStageRecipe(await encodeStageRecipe(doc));
    expect(recipe.stages[0].config.knockoutDraw!.fixedSlots).toEqual([
      { participantId: recipe.participants[3].id, slot: 1 },
    ]);
  });
});
