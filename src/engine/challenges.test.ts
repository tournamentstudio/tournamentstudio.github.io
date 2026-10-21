import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { validateTournament } from "../domain/validate";
import { readInvitations } from "../domain/ladder";
import {
  advanceStage,
  generateStage,
  getChampion,
  recordResult,
  refreshTournament,
  simulate,
  CorrectionRequiredError,
} from "./index";
import { closeLadder, decideChallenge, requestChallenge } from "./challenges";
import { activeHillQueue } from "./ladder-state";
import {
  publicProjection,
  encodeCode,
  decodeCode,
  encodeRecipe,
  decodeRecipe,
} from "../sharing";

function fixture(mode: "invitations" | "king-of-hill", rounds = 5) {
  const doc = createTournament(
    "Challenge cup",
    Array.from({ length: 5 }, (_, index) =>
      createParticipant(`Player ${index + 1}`, index + 1),
    ),
    "ladder",
  );
  doc.stages[0].config.ladder = { version: 1, mode, maxRankGap: 4 };
  doc.stages[0].config.rounds = rounds;
  return generateStage(doc, doc.stages[0].id);
}
function result(doc: Tournament, winnerIndex: 0 | 1) {
  const match = doc.matches.find((entry) => entry.status === "ready")!;
  return recordResult(doc, match.id, {
    scores: winnerIndex ? [0, 2] : [2, 0],
    winnerIds: [match.slots[winnerIndex].participantId!],
    outcome: "played",
    recordedAt: new Date().toISOString(),
  });
}
function invite(doc: Tournament, challenger: number, opponent: number) {
  return requestChallenge(
    doc,
    doc.stages[0].id,
    doc.participants[challenger].id,
    doc.participants[opponent].id,
    "Private invitation note",
  );
}
function decide(doc: Tournament, decision: "approve" | "decline" | "cancel") {
  return decideChallenge(
    doc,
    doc.stages[0].id,
    readInvitations(doc.stages[0]).at(-1)!.id,
    decision,
  );
}
describe("organizer-approved challenges", () => {
  it("simulates a bounded invitation ladder without changing the source", () => {
    const original = fixture("invitations", 3);
    const simulated = simulate(original);
    expect(simulated.stages[0].status).toBe("completed");
    expect(
      simulated.matches.filter((match) => match.status === "completed"),
    ).toHaveLength(3);
    expect(original.matches).toHaveLength(0);
  });
  it("approves arbitrary eligible rank gaps and swaps ranks from the completed result", async () => {
    let doc = fixture("invitations");
    expect(doc.matches).toHaveLength(0);
    doc = invite(doc, 4, 0);
    expect(() => generateStage(doc, doc.stages[0].id)).toThrow(
      "invitation history",
    );
    doc = decide(doc, "approve");
    expect(doc.matches[0].slots.map((slot) => slot.participantId)).toEqual([
      doc.participants[0].id,
      doc.participants[4].id,
    ]);
    doc = result(doc, 1);
    expect(doc.stages[0].metadata.ladderOrder).toEqual([
      doc.participants[4].id,
      doc.participants[1].id,
      doc.participants[2].id,
      doc.participants[3].id,
      doc.participants[0].id,
    ]);
    expect(readInvitations(doc.stages[0])[0].status).toBe("resolved");
    expect(validateTournament(doc)).toEqual(doc);
    const restored = await decodeCode(await encodeCode(doc, undefined, true));
    expect(readInvitations(restored.stages[0])).toEqual(
      readInvitations(doc.stages[0]),
    );
    const publicDoc = publicProjection(doc);
    expect(JSON.stringify(publicDoc)).not.toContain("Private invitation note");
    expect(publicDoc.stages[0].config.ladder).toEqual(
      doc.stages[0].config.ladder,
    );
    const recipe = await decodeRecipe(await encodeRecipe(doc));
    expect(recipe.stages[0].config.ladder?.mode).toBe("invitations");
    expect(readInvitations(recipe.stages[0])).toHaveLength(0);
  });
  it("persists decline and cancellation, never revives canceled matches", () => {
    let doc = fixture("invitations");
    doc = decide(invite(doc, 4, 0), "decline");
    expect(readInvitations(doc.stages[0])[0].status).toBe("declined");
    doc = decide(invite(doc, 3, 0), "approve");
    doc = decide(doc, "cancel");
    expect(refreshTournament(doc).matches[0].status).toBe("canceled");
    expect(readInvitations(doc.stages[0])[1].status).toBe("canceled");
    doc = decide(invite(doc, 2, 0), "approve");
    expect(doc.matches[1].round).toBe(2);
    doc.matches[1].status = "live";
    expect(() => decide(doc, "cancel")).toThrow("started challenge");
  });
  it("rejects duplicate, inactive, self, upward and oversized gap requests", () => {
    const doc = fixture("invitations");
    expect(() => invite(doc, 0, 4)).toThrow("lower ranked");
    expect(() => invite(doc, 0, 0)).toThrow("lower ranked");
    expect(() => invite(invite(doc, 4, 0), 4, 0)).toThrow(
      "already has an open",
    );
    doc.stages[0].config.ladder!.maxRankGap = 1;
    expect(() => invite(doc, 4, 0)).toThrow("rank gap");
    doc.participants[1].status = "withdrawn";
    expect(() => invite(doc, 1, 0)).toThrow("must be active");
  });
  it("rechecks rank eligibility at approval and requires pending decisions before closing", () => {
    let doc = fixture("invitations");
    doc = invite(doc, 4, 0);
    const first = readInvitations(doc.stages[0])[0].id;
    doc = invite(doc, 3, 1);
    doc = decide(doc, "approve");
    expect(() =>
      decideChallenge(doc, doc.stages[0].id, first, "approve"),
    ).toThrow("active challenge");
    doc = result(doc, 0);
    expect(() => closeLadder(doc, doc.stages[0].id)).toThrow(
      "pending invitations",
    );
    doc = decideChallenge(doc, doc.stages[0].id, first, "decline");
    const closed = closeLadder(doc, doc.stages[0].id);
    expect(closed.stages[0].status).toBe("completed");
    expect(getChampion(closed)?.id).toBe(doc.participants[0].id);
  });
  it("rejects a stale invitation after its challenger gains a higher rank and closes pending requests at the limit", () => {
    let doc = invite(fixture("invitations"), 4, 3);
    const pending = readInvitations(doc.stages[0])[0].id;
    doc = result(decide(invite(doc, 4, 0), "approve"), 1);
    expect(() =>
      decideChallenge(doc, doc.stages[0].id, pending, "approve"),
    ).toThrow("lower ranked");
    doc = invite(fixture("invitations", 1), 4, 3);
    doc = result(decide(invite(doc, 2, 0), "approve"), 1);
    expect(doc.stages[0].status).toBe("completed");
    expect(readInvitations(doc.stages[0])[0].status).toBe("canceled");
  });
  it("invalidates later invitations only after confirmed result correction", () => {
    let doc = fixture("invitations");
    doc = result(decide(invite(doc, 4, 0), "approve"), 1);
    const first = doc.matches[0];
    doc = result(decide(invite(doc, 3, 4), "approve"), 1);
    const correction = {
      scores: [2, 0],
      winnerIds: [first.slots[0].participantId!],
      outcome: "played" as const,
      recordedAt: new Date().toISOString(),
    };
    expect(() => recordResult(doc, first.id, correction)).toThrow(
      CorrectionRequiredError,
    );
    doc = recordResult(doc, first.id, correction, true);
    expect(doc.matches).toHaveLength(1);
    expect(readInvitations(doc.stages[0])[1].status).toBe("invalidated");
    expect(doc.metadata.correctionRecovery).toBeTruthy();
    expect(validateTournament(doc)).toEqual(doc);
  });
});
describe("incumbent-stays King of the Hill", () => {
  it("keeps a winning incumbent and sends the loser to the end of the queue", () => {
    let doc = fixture("king-of-hill", 3);
    const ids = doc.participants.map((p) => p.id);
    doc = result(doc, 0);
    expect(activeHillQueue(doc, doc.stages[0])).toEqual([
      ids[0],
      ids[2],
      ids[3],
      ids[4],
      ids[1],
    ]);
    doc = advanceStage(doc, doc.stages[0].id);
    doc = result(doc, 1);
    expect(activeHillQueue(doc, doc.stages[0])).toEqual([
      ids[2],
      ids[3],
      ids[4],
      ids[1],
      ids[0],
    ]);
    doc = advanceStage(doc, doc.stages[0].id);
    doc = result(doc, 0);
    expect(doc.stages[0].status).toBe("completed");
    expect(getChampion(doc)?.id).toBe(ids[2]);
  });
  it("skips withdrawn queue entrants and supports explicit early completion", () => {
    let doc = result(fixture("king-of-hill"), 0);
    doc.participants[2].status = "withdrawn";
    doc = advanceStage(doc, doc.stages[0].id);
    expect(doc.matches[1].slots[1].participantId).toBe(doc.participants[3].id);
    expect(() => closeLadder(doc, doc.stages[0].id)).toThrow("finish active");
    doc = result(doc, 0);
    doc = closeLadder(doc, doc.stages[0].id);
    expect(doc.stages[0].status).toBe("completed");
  });
  it("continues to recompute conditional grand-final resets after the canceled-match fix", () => {
    let doc = createTournament(
      "Reset regression",
      [createParticipant("A", 1), createParticipant("B", 2)],
      "double-elimination",
    );
    doc = generateStage(doc, doc.stages[0].id);
    doc = result(doc, 0);
    doc = result(doc, 0);
    expect(
      doc.matches.find((match) => match.metadata.conditionalReset)?.status,
    ).toBe("canceled");
    const final = doc.matches.find((match) => match.bracket === "final")!;
    doc = recordResult(doc, final.id, {
      scores: [0, 2],
      winnerIds: [final.slots[1].participantId!],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect(
      doc.matches.find((match) => match.metadata.conditionalReset)?.status,
    ).toBe("ready");
  });
});
