import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { defaultGolAbility, defaultGolPolicy } from "../domain/gol";
import { applySport } from "../sports";
import { generateStage } from "./index";
import {
  finishGolClock,
  golClockElapsed,
  golDecision,
  recordGolHand,
  setGolClock,
  setGolPossession,
  startGolOvertime,
  undoGolHand,
  type GolMatch,
  type GolRules,
} from "./gol";

const start = Date.parse("2026-01-01T12:00:00Z");
function fixture() {
  let t = applySport(
    createTournament(
      "Gol cup",
      Array.from({ length: 4 }, (_, i) =>
        createParticipant(`Team ${i}`, i + 1),
      ),
      "single-elimination",
    ),
    "gol-ya-pooch",
  );
  t = generateStage(t, t.stages[0].id);
  return t;
}
function hand(t: ReturnType<typeof fixture>, index = 0, points = 1) {
  return {
    concealingTeamId: t.matches[0].slots[0].participantId!,
    awardedToId: t.matches[0].slots[index].participantId!,
    points,
  };
}
describe("Gol referee commands", () => {
  it("persists elapsed time across reloads and pauses without repeated ticking writes", () => {
    const t = fixture(),
      id = t.matches[0].id;
    const started = setGolClock(t, id, "start", start);
    expect(
      golClockElapsed(
        JSON.parse(JSON.stringify(started)).matches[0],
        start + 65000,
      ),
    ).toBe(65000);
    const paused = setGolClock(started, id, "pause", start + 65000);
    expect(golClockElapsed(paused.matches[0] as GolMatch, start + 125000)).toBe(
      65000,
    );
    const restarted = setGolClock(paused, id, "start", start + 125000);
    expect(
      golClockElapsed(restarted.matches[0] as GolMatch, start + 140000),
    ).toBe(80000);
    expect(
      golClockElapsed(
        setGolClock(restarted, id, "reset", start + 140000)
          .matches[0] as GolMatch,
      ),
    ).toBe(0);
    expect((t.matches[0] as GolMatch).golState).toBeUndefined();
  });
  it("does not auto-finish legacy manual rules at the target", () => {
    const t = fixture(),
      next = recordGolHand(t, t.matches[0].id, hand(t, 0, 6), start);
    expect(next.matches[0].status).toBe("live");
    expect(next.matches[0].liveScores).toEqual([6, 0]);
  });
  it("ends a match and advances the winner only under an explicit target policy", () => {
    const t = fixture();
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      ending: "target",
      winBy: 2,
    };
    t.matches[0].liveScores = [5, 5];
    const first = recordGolHand(t, t.matches[0].id, hand(t), start);
    expect(first.matches[0].result).toBeUndefined();
    const final = recordGolHand(first, t.matches[0].id, hand(t), start + 1000);
    expect(final.matches[0].result?.scores).toEqual([7, 5]);
    expect(
      final.matches
        .at(-1)
        ?.slots.some(
          (slot) => slot.participantId === t.matches[0].slots[0].participantId,
        ),
    ).toBe(true);
  });
  it("finishes an expired clock with an actual leading score", () => {
    const t = fixture();
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      ending: "clock",
      clockSeconds: 60,
    };
    const live = recordGolHand(
      setGolClock(t, t.matches[0].id, "start", start),
      t.matches[0].id,
      hand(t),
      start + 20000,
    );
    expect(() => finishGolClock(live, t.matches[0].id, start + 59000)).toThrow(
      "No winner",
    );
    expect(
      finishGolClock(live, t.matches[0].id, start + 60000).matches[0].result
        ?.scores,
    ).toEqual([1, 0]);
    expect(() =>
      recordGolHand(live, t.matches[0].id, hand(t), start + 60000),
    ).toThrow("period has ended");
  });
  it("starts agreed sudden death after an expired tie and ends on a lead", () => {
    const t = fixture();
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      ending: "clock",
      clockSeconds: 60,
      overtime: "sudden-death",
    };
    const started = setGolClock(t, t.matches[0].id, "start", start);
    expect(() =>
      startGolOvertime(started, t.matches[0].id, start + 59000),
    ).toThrow("expired tied");
    const overtime = startGolOvertime(started, t.matches[0].id, start + 60000);
    expect((overtime.matches[0] as GolMatch).golState?.period).toBe(1);
    const next = recordGolHand(
      overtime,
      t.matches[0].id,
      hand(t, 1),
      start + 62000,
    );
    expect(next.matches[0].result?.winnerIds).toEqual([
      t.matches[0].slots[1].participantId,
    ]);
  });
  it("plays a full agreed extra-time period before finalizing a lead", () => {
    const t = fixture();
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      ending: "clock",
      clockSeconds: 60,
      overtime: "extra-time",
      overtimeSeconds: 30,
    };
    let live = startGolOvertime(
      setGolClock(t, t.matches[0].id, "start", start),
      t.matches[0].id,
      start + 60000,
    );
    live = recordGolHand(live, t.matches[0].id, hand(t, 1), start + 65000);
    expect(
      golDecision(live, live.matches[0] as GolMatch, start + 89000).winnerId,
    ).toBeUndefined();
    expect(
      finishGolClock(live, t.matches[0].id, start + 90000).matches[0].result,
    ).toBeDefined();
  });
  it("checks card role, counts usage against its actual owner and applies structured effects", () => {
    const t = fixture();
    (t.rules.gol as GolRules).cards = [
      {
        id: "card",
        name: "Double guess",
        limit: 1,
        points: 1,
        ability: {
          ...defaultGolAbility,
          eligible: "guessing",
          multiplier: 2,
          possession: "user",
          pauseClock: true,
        },
      },
    ];
    const input = {
      ...hand(t, 0),
      cardId: "card",
      cardUsedById: t.matches[0].slots[1].participantId,
      secret: "HIDDEN-POSITION",
    };
    expect(() =>
      recordGolHand(
        t,
        t.matches[0].id,
        { ...input, cardUsedById: t.matches[0].slots[0].participantId },
        start,
      ),
    ).toThrow("current role");
    const next = recordGolHand(
      setGolClock(t, t.matches[0].id, "start", start),
      t.matches[0].id,
      input,
      start + 5000,
    );
    expect(next.matches[0].liveScores).toEqual([3, 0]);
    expect((next.matches[0] as GolMatch).golState).toMatchObject({
      elapsedMs: 5000,
      concealingTeamId: input.cardUsedById,
      runningSince: undefined,
    });
    expect(next.matches[0].private?.concealedPosition).toBeUndefined();
    expect(() =>
      recordGolHand(next, t.matches[0].id, input, start + 6000),
    ).toThrow("card use limit");
  });
  it("restores ordered hand totals and possession while refusing arbitrary middle-hand removal", () => {
    const t = fixture();
    (t.rules.gol as GolRules).policy = {
      ...defaultGolPolicy,
      possession: "alternate",
    };
    const first = recordGolHand(t, t.matches[0].id, hand(t), start);
    const second = recordGolHand(
      first,
      t.matches[0].id,
      { ...hand(t, 1), concealingTeamId: t.matches[0].slots[1].participantId! },
      start + 1000,
    );
    expect(() =>
      undoGolHand(second, t.matches[0].id, second.matches[0].hands![0].id),
    ).toThrow("latest hand first");
    const undone = undoGolHand(
      second,
      t.matches[0].id,
      second.matches[0].hands![1].id,
    );
    expect(undone.matches[0].liveScores).toEqual([1, 0]);
    expect((undone.matches[0] as GolMatch).golState?.concealingTeamId).toBe(
      t.matches[0].slots[1].participantId,
    );
  });
  it("clears the previous concealed position when possession changes", () => {
    const t = fixture();
    t.matches[0].private = { concealedPosition: "SECRET" };
    const next = setGolPossession(
      t,
      t.matches[0].id,
      t.matches[0].slots[1].participantId!,
    );
    expect(next.matches[0].private?.concealedPosition).toBeUndefined();
    expect(() => setGolPossession(t, t.matches[0].id, "missing")).toThrow(
      "must be in",
    );
  });
  it("rejects unknown cards, negative totals and invalid hand points", () => {
    const t = fixture();
    expect(() =>
      recordGolHand(
        t,
        t.matches[0].id,
        { ...hand(t), cardId: "missing" },
        start,
      ),
    ).toThrow("agreed rules");
    expect(() =>
      recordGolHand(t, t.matches[0].id, hand(t, 0, NaN), start),
    ).toThrow("between 0 and 100");
    t.rules.gol.cards = [
      { id: "deduct", name: "Deduction", limit: 2, points: -10 },
    ];
    expect(() =>
      recordGolHand(
        t,
        t.matches[0].id,
        { ...hand(t), cardId: "deduct" },
        start,
      ),
    ).toThrow("outside 0");
  });
});
