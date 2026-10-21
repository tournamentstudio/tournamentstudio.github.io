import { describe, expect, it } from "vitest";
import { createParticipant, createTournament, type Tournament } from "../domain/types";
import { generateStage, recordResult } from "./index";
import { matchResultQualifiers } from "./match-qualifiers";

function fixture(count = 4): Tournament {
  const doc = createTournament(
    "Outcome connections",
    Array.from({ length: count }, (_, index) => createParticipant(`Team ${index + 1}`, index + 1)),
    "single-elimination",
  );
  return generateStage(doc, doc.stages[0].id);
}

function completeFirst(doc: Tournament) {
  const match = doc.matches.find((entry) => entry.status === "ready")!;
  return recordResult(doc, match.id, {
    scores: [2, 0], winnerIds: [match.slots[0].participantId!],
    outcome: "played", recordedAt: doc.updatedAt,
  });
}

describe("actual match outcome qualification", () => {
  it("selects winners and losers from completed matches while the stage continues", () => {
    const doc = completeFirst(fixture());
    const match = doc.matches.find((entry) => entry.status === "completed")!;
    expect(doc.stages[0].status).toBe("active");
    const before = JSON.stringify(doc);
    expect(matchResultQualifiers(doc, match.stageId, [{ matchId: match.id, outcome: "winners" }], 1))
      .toMatchObject({ participantIds: [match.slots[0].participantId], issues: [] });
    expect(matchResultQualifiers(doc, match.stageId, [{ matchId: match.id, outcome: "losers" }], 1))
      .toMatchObject({ participantIds: [match.slots[1].participantId], issues: [] });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("blocks missing, unfinished, repeated, tied and abandoned source outcomes", () => {
    const initial = fixture();
    const match = initial.matches.find((entry) => entry.status === "ready")!;
    const picks = [{ matchId: match.id, outcome: "winners" as const }];
    expect(matchResultQualifiers(initial, match.stageId, picks, 1).issues.join(" ")).toContain("Complete every");
    expect(matchResultQualifiers(initial, "elsewhere", picks, 1).issues.join(" ")).toContain("missing source match");
    const doc = completeFirst(initial);
    expect(matchResultQualifiers(doc, match.stageId, [...picks, ...picks], 2).issues.join(" ")).toContain("more than once");
    const played = doc.matches.find((entry) => entry.id === match.id)!;
    for (const outcome of ["draw", "abandoned"] as const) {
      played.result!.outcome = outcome;
      expect(matchResultQualifiers(doc, match.stageId, picks, 1).issues.join(" ")).toContain("no decisive");
    }
  });

  it("allows a bye winner but never invents a bye loser", () => {
    const doc = fixture(3);
    const bye = doc.matches.find((entry) => entry.status === "bye")!;
    expect(matchResultQualifiers(doc, bye.stageId, [{ matchId: bye.id, outcome: "winners" }], 1))
      .toMatchObject({ participantIds: bye.result!.winnerIds, issues: [] });
    expect(matchResultQualifiers(doc, bye.stageId, [{ matchId: bye.id, outcome: "losers" }], 1).issues.join(" ")).toContain("bye has no loser");
  });

  it("preserves slot order for several advancing entrants and enforces the quota", () => {
    const doc = fixture();
    const match = doc.matches[0];
    const ids = doc.participants.map((participant) => participant.id);
    match.slots = ids.map((participantId) => ({ participantId }));
    match.status = "completed";
    match.result = { winnerIds: [ids[2], ids[0]], scores: [4, 1, 3, 2], outcome: "played", recordedAt: doc.updatedAt };
    expect(matchResultQualifiers(doc, match.stageId, [{ matchId: match.id, outcome: "winners" }], 2))
      .toMatchObject({ participantIds: [ids[0], ids[2]], issues: [] });
    expect(matchResultQualifiers(doc, match.stageId, [{ matchId: match.id, outcome: "losers" }], 2))
      .toMatchObject({ participantIds: [ids[1], ids[3]], issues: [] });
    expect(matchResultQualifiers(doc, match.stageId, [{ matchId: match.id, outcome: "winners" }], 1).issues.join(" ")).toContain("expected qualifier count");
  });
});
