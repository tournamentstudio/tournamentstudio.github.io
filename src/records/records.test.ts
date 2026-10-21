import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { publicProjection } from "../sharing";
import {
  calculateRatings,
  exportRatingSource,
  importRatingSource,
  ratingSource,
  validateRatingSource,
} from "./ratings";
import {
  decodePrediction,
  encodePrediction,
  freezePrediction,
  predictionDrawHash,
  predictionRows,
  predictionScore,
  validatePrediction,
} from "./predictions";
import { readRecords, withRecords } from "./model";

function fixture(count = 4) {
  let document = createTournament(
    "Records cup",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Player ${index + 1}`, index + 1),
    ),
  );
  document = generateStage(document, document.stages[0].id);
  return document;
}
function play(document: ReturnType<typeof fixture>, id: string, winner = 0) {
  const match = document.matches.find((entry) => entry.id === id)!;
  return recordResult(document, id, {
    scores: winner === 0 ? [2, 0] : [0, 2],
    winnerIds: [match.slots[winner].participantId!],
    outcome: "played",
    recordedAt: "2026-10-21T12:00:00Z",
  });
}
function picks(document: ReturnType<typeof fixture>) {
  const selected: Record<string, string> = {};
  for (let round = 0; round < 10; round++) {
    const rows = predictionRows(document, document.stages[0].id, selected);
    for (const row of rows)
      if (!row.automatic && row.entrants.length === 2)
        selected[row.match.id] = row.entrants[0];
  }
  return selected;
}
describe("local Elo results", () => {
  it("uses entered played results, excluding BYEs and organizer outcomes", async () => {
    let document = fixture(3);
    expect(ratingSource(document).matches).toHaveLength(0);
    document = play(
      document,
      document.matches.find((match) => match.status === "ready")!.id,
    );
    document.description = "Private notes";
    const source = ratingSource(document);
    expect(source.matches).toHaveLength(1);
    const code = await exportRatingSource(document);
    const restored = await importRatingSource(code);
    expect(restored).toEqual(source);
    expect(JSON.stringify(restored)).not.toContain("Private notes");
    const match = document.matches.find(
      (entry) => entry.status === "completed",
    )!;
    match.result!.outcome = "forfeit";
    expect(ratingSource(document).matches).toHaveLength(0);
  });
  it("calculates expected scores, preserves rating totals and records chronological history", () => {
    let document = fixture(2);
    document = play(document, document.matches[0].id);
    const source = ratingSource(document);
    const identities = source.participants;
    const mapped = {
      source,
      bindings: identities.map((entry) => ({
        participantId: entry.id,
        identityId: entry.id,
      })),
    };
    const result = calculateRatings(identities, [mapped]);
    expect(result.rows.map((entry) => entry.rating)).toEqual([1216, 1184]);
    expect(result.history[0].firstBefore).toBe(1200);
    expect(result.history[0].firstAfter + result.history[0].secondAfter).toBe(
      2400,
    );
    const later = structuredClone(mapped);
    later.source.tournamentId = "later";
    later.source.matches[0].at = "2026-10-22T00:00:00Z";
    expect(
      calculateRatings(identities, [later, mapped]).history.map(
        (entry) => entry.tournamentId,
      ),
    ).toEqual([document.id, "later"]);
    later.source.matches[0].result = "draw";
    expect(
      calculateRatings(identities, [later]).rows.map((entry) => entry.rating),
    ).toEqual([1200, 1200]);
  });
  it("requires explicit unique identities and rejects malformed imported sources", () => {
    const document = fixture(2),
      source = ratingSource(document),
      identities = source.participants;
    expect(() =>
      calculateRatings(identities, [{ source, bindings: [] }]),
    ).toThrow("Map every");
    expect(() =>
      calculateRatings(identities, [
        {
          source,
          bindings: identities.map((entry) => ({
            participantId: entry.id,
            identityId: identities[0].id,
          })),
        },
      ]),
    ).toThrow("Map every");
    expect(() =>
      validateRatingSource({
        ...source,
        participants: [...source.participants, source.participants[0]],
      }),
    ).toThrow("duplicate");
    expect(() =>
      validateRatingSource({
        ...source,
        matches: [
          {
            id: "bad",
            at: "2026-10-22T00:00:00Z",
            entrants: ["missing", "missing"],
            result: "draw",
          },
        ],
      }),
    ).toThrow("invalid match");
    expect(() => calculateRatings([], [], 1200, 0)).toThrow("K factor");
  });
});

describe("frozen local prediction brackets", () => {
  it.each([3, 13, 32])(
    "resolves %i entrants with BYEs and freezes a complete bracket",
    async (count) => {
      const document = fixture(count),
        selected = picks(document);
      const packet = await freezePrediction(
        document,
        document.stages[0].id,
        "My predictions",
        selected,
      );
      expect(packet.picks).toHaveLength(count - 1);
      expect(await decodePrediction(await encodePrediction(packet))).toEqual(
        packet,
      );
      expect(await validatePrediction(document, packet)).toEqual(packet);
      expect(predictionScore(document, packet)).toEqual({
        correct: 0,
        incorrect: 0,
        pending: count - 1,
      });
    },
  );
  it("keeps draw identity stable after results and scores actual winners", async () => {
    const initial = fixture(4),
      selected = picks(initial);
    const packet = await freezePrediction(
      initial,
      initial.stages[0].id,
      "Local bracket",
      selected,
    );
    const first = initial.matches.find((entry) => entry.status === "ready")!;
    const updated = play(initial, first.id);
    expect(await predictionDrawHash(updated, initial.stages[0].id)).toBe(
      packet.drawHash,
    );
    expect((await validatePrediction(updated, packet)).id).toBe(packet.id);
    expect(predictionScore(updated, packet)).toEqual({
      correct: 1,
      incorrect: 0,
      pending: 2,
    });
    await expect(
      freezePrediction(updated, updated.stages[0].id, "Late", selected),
    ).rejects.toThrow("before this stage");
    const changed = structuredClone(initial);
    changed.matches[0].slots.reverse();
    await expect(validatePrediction(changed, packet)).rejects.toThrow(
      "different tournament draw",
    );
  });
  it("invalidates downstream guesses when an upstream winner changes and supports placement sources", async () => {
    let document = createTournament(
      "Placement",
      Array.from({ length: 4 }, (_, index) =>
        createParticipant(`P${index}`, index + 1),
      ),
    );
    document.stages[0].config.thirdPlace = true;
    document = generateStage(document, document.stages[0].id);
    const selected = picks(document);
    const packet = await freezePrediction(
      document,
      document.stages[0].id,
      "Placement bracket",
      selected,
    );
    expect(packet.picks).toHaveLength(4);
    const first = predictionRows(
      document,
      document.stages[0].id,
      selected,
    ).find((row) => row.match.round === 1 && row.entrants.length === 2)!;
    selected[first.match.id] = first.entrants[1];
    expect(
      predictionRows(document, document.stages[0].id, selected).some(
        (row) => !row.automatic && !row.winnerId,
      ),
    ).toBe(true);
    const duplicate = { ...packet, picks: [...packet.picks, packet.picks[0]] };
    await expect(validatePrediction(document, duplicate)).rejects.toThrow(
      "same match twice",
    );
  });
  it("preserves private records through document editing and excludes them from public snapshots", async () => {
    const document = fixture(2);
    const packet = await freezePrediction(
      document,
      document.stages[0].id,
      "Private predictor",
      picks(document),
    );
    const records = readRecords(document);
    records.predictions.push({
      packet,
      imported: false,
      receivedAt: packet.frozenAt,
    });
    const saved = withRecords(document, records);
    expect(readRecords(saved).predictions).toHaveLength(1);
    expect(publicProjection(saved).metadata).toEqual({});
    expect(() =>
      readRecords({ ...document, metadata: { records: { version: 2 } } }),
    ).toThrow("unsupported");
  });
});
