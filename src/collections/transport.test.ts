import { beforeAll, describe, expect, it } from "vitest";
import { readInvitations } from "../domain/ladder";
import { DEFAULT_SWISS_POLICY } from "../domain/swiss";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult, simulate } from "../engine";
import { decideChallenge, requestChallenge } from "../engine/challenges";
import { admitSwissEntrant } from "../engine/swiss-controls";
import {
  deletePlayerEvent,
  readPlayerStatistics,
  savePlayerEvent,
  savePlayerMetric,
} from "../players/model";
import { playerMetricTemplates } from "../players/templates";
import { sealDocument } from "../sharing";
import { createCollection, linkCompetition, sealCollection } from "./model";
import { forkBundle } from "./transport";
import { prepareDutchEngine } from "../engine/fide-runtime";

beforeAll(prepareDutchEngine);

function fixture(format: Tournament["stages"][number]["format"] = "swiss") {
  const doc = createTournament(
    "Recurring event",
    Array.from({ length: 4 }, (_, i) =>
      createParticipant(`Player ${i + 1}`, i + 1, "individual"),
    ),
    format,
  );
  Object.assign(doc.rules, {
    pointsWin: 1,
    pointsDraw: 0.5,
    pointsLoss: 0,
    allowDraws: true,
  });
  doc.stages[0].config.rounds = 3;
  return doc;
}

async function bundle(doc: Tournament) {
  const collection = createCollection("Annual games");
  return {
    version: 1 as const,
    collection: await sealCollection(
      linkCompetition(
        collection,
        doc,
        doc.stages[0].id,
        collection.divisions[0].id,
      ),
    ),
    tournaments: [await sealDocument(doc)],
  };
}

function win(doc: Tournament, matchId: string, winner = 0) {
  const match = doc.matches.find((entry) => entry.id === matchId)!;
  return recordResult(doc, matchId, {
    scores: winner ? [0, 1] : [1, 0],
    winnerIds: [match.slots[winner].participantId!],
    outcome: "played",
    recordedAt: doc.updatedAt,
  });
}

describe("recurring event resets", () => {
  it("restarts pairing numbers and admits previous late entrants from round one", async () => {
    let doc = fixture();
    const stageId = doc.stages[0].id;
    doc.stages[0].config.swiss = {
      ...DEFAULT_SWISS_POLICY,
      allowLateEntrants: true,
      federation: {
        system: "fide-dutch-2026",
        engine: "bbp-6.0.0-ts1",
        initialColor: "black",
      },
    };
    doc = generateStage(doc, stageId);
    for (const match of doc.matches) doc = win(doc, match.id);
    doc = admitSwissEntrant(doc, stageId, "Late player", 0);
    doc.participants[0].seed = 99;
    const source = await bundle(doc),
      snapshot = structuredClone(source),
      fork = await forkBundle(source),
      copy = (await forkBundle(source, true)).tournaments[0];
    expect(fork.tournaments[0].stages[0].config.swiss).toEqual(
      doc.stages[0].config.swiss,
    );
    expect(copy.stages[0].config.swiss).toEqual({
      ...doc.stages[0].config.swiss,
      lateEntries: [],
      federation: {
        system: "fide-dutch-2026",
        engine: "bbp-6.0.0-ts1",
        initialColor: "black",
      },
    });
    const drawn = generateStage(copy, stageId);
    expect(drawn.stages[0].config.swiss!.federation!.pairingOrder).toEqual(
      [...copy.participants].sort((a, b) => a.seed - b.seed).map((p) => p.id),
    );
    expect(
      drawn.matches.flatMap((match) =>
        match.slots.flatMap((slot) => slot.participantId ?? []),
      ),
    ).toHaveLength(5);
    expect(validateTournament(drawn)).toEqual(drawn);
    expect(source).toEqual(snapshot);
  });

  it.each(["federation", "acceleration"] as const)(
    "clears entrant-bound %s data when sourced qualifiers restart",
    async (policy) => {
      let doc = simulate(fixture("round-robin"));
      const destination = fixture().stages[0];
      destination.order = 1;
      destination.participantIds = doc.participants.map((p) => p.id);
      destination.sources = [
        { stageId: doc.stages[0].id, count: 4, perGroup: false },
      ];
      destination.config.swiss = {
        ...DEFAULT_SWISS_POLICY,
        ...(policy === "federation"
          ? {
              federation: {
                system: "fide-dutch-2026" as const,
                engine: "bbp-6.0.0-ts1" as const,
                initialColor: "white" as const,
              },
            }
          : {
              acceleration: {
                policy: "fixed-group-v1" as const,
                rounds: 1,
                points: 1,
                participantIds: [doc.participants[0].id],
              },
            }),
      };
      doc.stages.push(destination);
      doc = generateStage(doc, destination.id);
      const source = await bundle(doc),
        copy = (await forkBundle(source, true)).tournaments[0],
        reset = copy.stages[1];
      expect(reset.participantIds).toEqual([]);
      expect(reset.config.swiss!.federation?.pairingOrder).toBeUndefined();
      expect(reset.config.swiss!.acceleration).toBeUndefined();
      expect(reset.config.swiss!.lateEntries).toEqual([]);
      expect(reset.sources).toEqual(destination.sources);
      expect(validateTournament(copy)).toEqual(copy);
      const completed = simulate(copy);
      expect(
        completed.stages.every((stage) => stage.status === "completed"),
      ).toBe(true);
      expect(validateTournament(completed)).toEqual(completed);
      expect(source.tournaments[0].matches.length).toBeGreaterThan(0);
    },
  );

  it("preserves fixed acceleration groups for standalone Swiss fields", async () => {
    let doc = fixture();
    doc.stages[0].config.swiss = {
      ...DEFAULT_SWISS_POLICY,
      acceleration: {
        policy: "fixed-group-v1",
        rounds: 1,
        points: 1,
        participantIds: [doc.participants[0].id],
      },
    };
    doc = generateStage(doc, doc.stages[0].id);
    const copy = (await forkBundle(await bundle(doc), true)).tournaments[0];
    expect(copy.stages[0].config.swiss).toEqual(doc.stages[0].config.swiss);
    const drawn = generateStage(copy, copy.stages[0].id);
    expect(drawn.matches).toHaveLength(2);
    expect(validateTournament(drawn)).toEqual(drawn);
  });

  it("clears observations and match recovery while preserving metric definitions", async () => {
    let doc = fixture("ladder");
    const stageId = doc.stages[0].id;
    doc.stages[0].config.ladder = {
      version: 1,
      mode: "invitations",
      maxRankGap: 3,
    };
    doc = generateStage(doc, stageId);
    doc = requestChallenge(
      doc,
      stageId,
      doc.participants[3].id,
      doc.participants[0].id,
      "Previous season invitation",
    );
    doc = decideChallenge(
      doc,
      stageId,
      readInvitations(doc.stages[0])[0].id,
      "approve",
    );
    const matchId = doc.matches[0].id,
      playerId = doc.matches[0].slots[0].participantId!;
    doc = savePlayerMetric(doc, playerMetricTemplates("generic")[0]);
    const observation = {
      matchId,
      teamId: playerId,
      playerId,
      metricId: "points",
      value: 1,
      period: "First",
      notes: "Previous season observation",
    };
    doc = savePlayerEvent(doc, observation);
    doc = deletePlayerEvent(
      doc,
      readPlayerStatistics(doc).events[0].id,
      "Mistaken entry",
    );
    doc = savePlayerEvent(doc, observation);
    doc = win(doc, matchId);
    doc = win(doc, matchId, 1);
    doc = savePlayerEvent(doc, observation);
    doc.metadata.organizerNotes = "Recurring event instructions";
    const source = await bundle(doc),
      snapshot = structuredClone(source),
      fork = (await forkBundle(source)).tournaments[0],
      copy = (await forkBundle(source, true)).tournaments[0];
    expect(
      readPlayerStatistics(doc).events.map((event) => event.status),
    ).toEqual(["deleted", "quarantined", "active"]);
    expect(fork.metadata).toEqual(doc.metadata);
    expect(fork.stages[0].metadata).toEqual(doc.stages[0].metadata);
    expect(readPlayerStatistics(copy)).toEqual({
      version: 1,
      metrics: readPlayerStatistics(doc).metrics,
      events: [],
    });
    expect(copy.metadata.correctionRecovery).toBeUndefined();
    expect(copy.metadata.organizerNotes).toBe(doc.metadata.organizerNotes);
    expect(readInvitations(copy.stages[0])).toEqual([]);
    expect(copy.stages[0].config.ladder).toEqual(doc.stages[0].config.ladder);
    expect(validateTournament(copy)).toEqual(copy);
    expect(source).toEqual(snapshot);
  });
});
