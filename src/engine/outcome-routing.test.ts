import { describe, expect, it } from "vitest";
import { createParticipant, createTournament, DEFAULT_CONFIG, type Tournament, type Advancement } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { applyPatch, createPatch, decodeCode, encodeCode, exportArchive, importArchive, sealDocument } from "../sharing";
import { encodeStageRecipe } from "../sharing/recipes";
import { CorrectionRequiredError, generateStage, previewAdvancement, recordResult, validateGraph } from "./index";

function fixture() {
  const input = createTournament("Outcome routes", Array.from({ length: 8 }, (_, i) => createParticipant(`Team ${i + 1}`, i + 1)), "single-elimination");
  let doc = generateStage(input, input.stages[0].id);
  for (const match of doc.matches.filter((match) => match.round === 1))
    doc = recordResult(doc, match.id, { scores: [2, 0], winnerIds: [match.slots[0].participantId!], outcome: "played", recordedAt: doc.updatedAt });
  return doc;
}

function connect(doc: Tournament, id: string, sourceId: string, outcome: "winners" | "losers") {
  const matches = doc.matches.filter((match) => match.stageId === sourceId && match.round === 1);
  const source: Advancement = { stageId: sourceId, count: matches.length, perGroup: false, selection: { kind: "match-results", picks: matches.map((match) => ({ matchId: match.id, outcome })) } };
  doc.stages.push({ id, name: id, format: "single-elimination", formatVersion: 1, order: doc.stages.length, config: { ...DEFAULT_CONFIG }, participantIds: [], sources: [source], status: "draft", metadata: {} });
}

describe("stage connections from actual match results", () => {
  it("routes first-round winners and losers to independent stages before the source final", () => {
    let doc = fixture();
    const sourceId = doc.stages[0].id;
    connect(doc, "winners", sourceId, "winners");
    connect(doc, "losers", sourceId, "losers");
    expect(doc.stages[0].status).toBe("active");
    expect(validateGraph(doc)).toEqual([]);
    const winners = previewAdvancement(doc, "winners"), losers = previewAdvancement(doc, "losers");
    expect(winners.ready && losers.ready).toBe(true);
    expect(new Set([...winners.participantIds, ...losers.participantIds]).size).toBe(8);
    doc = generateStage(generateStage(doc, "winners"), "losers");
    expect(doc.matches.filter((match) => match.stageId === "losers")).toHaveLength(3);
    expect(validateTournament(doc)).toEqual(doc);
  });

  it("preserves refs and results through snapshot, archive and patch transports", async () => {
    const doc = fixture();
    const base = await sealDocument(doc);
    connect(doc, "losers", doc.stages[0].id, "losers");
    doc.revision++;
    const target = await sealDocument(generateStage(doc, "losers"));
    const restored = await decodeCode(await encodeCode(target));
    expect(previewAdvancement(restored, "losers").participantIds).toEqual(target.stages[1].participantIds);
    const archive = await importArchive(await exportArchive(target));
    expect(archive.stages[1].sources).toEqual(target.stages[1].sources);
    expect(await applyPatch(base, await createPatch(base, target))).toEqual(target);
    await expect(encodeStageRecipe(target)).rejects.toThrow("full snapshot");
  });

  it("confirms upstream correction, retains recovery and preserves draft outcome references", () => {
    let doc = fixture();
    connect(doc, "losers", doc.stages[0].id, "losers");
    doc = generateStage(doc, "losers");
    for (const match of doc.matches.filter((match) => match.stageId === "losers" && match.round === 1))
      doc = recordResult(doc, match.id, { scores: [2, 0], winnerIds: [match.slots[0].participantId!], outcome: "played", recordedAt: doc.updatedAt });
    connect(doc, "next", "losers", "winners");
    const source = doc.matches[0];
    const correction = { scores: [0, 2], winnerIds: [source.slots[1].participantId!], outcome: "played" as const, recordedAt: doc.updatedAt };
    expect(() => recordResult(doc, source.id, correction)).toThrow(CorrectionRequiredError);
    const corrected = recordResult(doc, source.id, correction, true);
    expect(corrected.metadata.correctionRecovery).toBeDefined();
    expect(corrected.stages[2].sources).toEqual(doc.stages[2].sources);
    expect(validateTournament(corrected)).toEqual(corrected);
    expect(previewAdvancement(corrected, "next").issues.join(" ")).toContain("missing source match");
    expect(() => generateStage(corrected, "next")).toThrow("missing source match");
    const redrawn = generateStage(corrected, "losers");
    expect(previewAdvancement(redrawn, "next").issues.join(" ")).toContain("Complete every");
  });

  it("rejects invalid or repeated source outcomes and inactive qualifiers", () => {
    const doc = fixture();
    connect(doc, "losers", doc.stages[0].id, "losers");
    const selection = doc.stages[1].sources[0].selection!;
    if (selection.kind !== "match-results") throw new Error("Unexpected test selection");
    selection.picks.push(selection.picks[0]);
    expect(() => validateTournament(doc)).toThrow("assigned more than once");
    selection.picks.pop();
    doc.participants.find((participant) => participant.id === previewAdvancement(doc, "losers").participantIds[0])!.status = "withdrawn";
    expect(previewAdvancement(doc, "losers").issues.join(" ")).toContain("not active");
    selection.picks[0].matchId = "missing";
    expect(() => validateTournament(doc)).toThrow("missing source match");
  });
});
