import { beforeAll, describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { DEFAULT_SWISS_POLICY } from "../domain/swiss";
import { generateStage } from "../engine";
import { decodeRecipe, encodeRecipe } from "./index";
import { prepareDutchEngine } from "../engine/fide-runtime";

beforeAll(prepareDutchEngine);

const fixture = () =>
  createTournament(
    "Recipe entrants",
    Array.from({ length: 4 }, (_, index) =>
      createParticipant(`Entrant ${index + 1}`, index + 1),
    ),
  );

describe("recipe entrant selection", () => {
  it("uses a stage recipe for a FIDE subset without losing directory entrants", async () => {
    let doc = fixture();
    const stage = doc.stages[0];
    stage.format = "swiss";
    stage.participantIds = stage.participantIds.slice(0, 3);
    stage.config.rounds = 2;
    stage.config.swiss = {
      ...DEFAULT_SWISS_POLICY,
      federation: {
        system: "fide-dutch-2026",
        engine: "bbp-6.0.0-ts1",
        initialColor: "white",
      },
    };
    Object.assign(doc.rules, {
      pointsWin: 1,
      pointsDraw: 0.5,
      pointsLoss: 0,
      allowDraws: true,
      bestOf: 1,
      scoring: "high",
    });
    doc = generateStage(doc, stage.id);
    const code = await encodeRecipe(doc);
    expect(code.startsWith("TSR2:")).toBe(true);
    const restored = await decodeRecipe(code);
    expect(restored.participants).toHaveLength(4);
    expect(restored.stages[0].participantIds).toEqual(
      restored.participants.slice(0, 3).map((participant) => participant.id),
    );
    expect(restored.stages[0].config.swiss!.federation!.pairingOrder).toEqual(
      restored.stages[0].participantIds,
    );
    const generated = generateStage(restored, restored.stages[0].id);
    expect(generated.matches).toHaveLength(2);
    expect(
      generated.matches.filter((match) => match.status === "bye"),
    ).toHaveLength(1);
  });
  it("preserves a full-field manual order that differs from directory order", async () => {
    const doc = fixture();
    const stage = doc.stages[0];
    stage.config.seeding = "manual";
    const order = [2, 0, 3, 1];
    stage.participantIds = order.map((index) => doc.participants[index].id);
    const code = await encodeRecipe(doc);
    expect(code.startsWith("TSR2:")).toBe(true);
    const restored = await decodeRecipe(code);
    expect(restored.stages[0].participantIds).toEqual(
      order.map((index) => restored.participants[index].id),
    );
    const generated = generateStage(restored, restored.stages[0].id);
    expect(generated.stages[0].metadata.drawOrder).toEqual(
      restored.stages[0].participantIds,
    );
  });
  it("retains the compact legacy format when it can represent the same field", async () => {
    const doc = fixture();
    const code = await encodeRecipe(doc);
    expect(code.startsWith("TSR1:")).toBe(true);
    const restored = await decodeRecipe(code);
    expect(restored.stages[0].participantIds).toEqual(
      restored.participants.map((participant) => participant.id),
    );
  });
});
