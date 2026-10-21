import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { DEFAULT_SWISS_POLICY, swissPolicyErrors } from "../domain/swiss";
import { validateTournament } from "../domain/validate";
import { generateStage, advanceStage, recordResult } from "./index";
import {
  admitSwissEntrant,
  setManualSwissPairings,
  setSwissPolicy,
} from "./swiss-controls";
import { fideTrf } from "./fide-dutch";
import { pairFideTrf } from "./fide-runtime";
import { decodeCode, encodeCode } from "../sharing";
import { decodeStageRecipe, encodeStageRecipe } from "../sharing/recipes";

const input = (name: string) =>
  readFileSync(
    new URL(`./fixtures/fide/${name}.input`, import.meta.url),
    "utf8",
  );
const reference = (name: string) =>
  readFileSync(
    new URL(`./fixtures/fide/${name}.output.expected`, import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/).map(Number));
function fixture(count = 8, color: "white" | "black" = "white") {
  const doc = createTournament(
    "Dutch test",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`بازیکن ${index + 1}`, index + 1),
    ),
    "swiss",
    "chess",
  );
  Object.assign(doc.rules, {
    pointsWin: 1,
    pointsDraw: 0.5,
    pointsLoss: 0,
    allowDraws: true,
    scoring: "high",
    bestOf: 1,
  });
  Object.assign(doc.stages[0].config, {
    rounds: Math.min(5, count - 1),
    seeding: "ranked",
    swiss: {
      ...DEFAULT_SWISS_POLICY,
      allowLateEntrants: true,
      federation: {
        system: "fide-dutch-2026",
        engine: "bbp-6.0.0-ts1",
        initialColor: color,
      },
    },
  });
  return doc;
}
function finish(input: Tournament, draw = false) {
  let doc = input;
  for (const match of doc.matches.filter((match) => match.status === "ready"))
    doc = recordResult(doc, match.id, {
      scores: draw ? [0.5, 0.5] : [1, 0],
      winnerIds: draw ? [] : [match.slots[0].participantId!],
      outcome: draw ? "draw" : "played",
      recordedAt: doc.updatedAt,
    });
  return doc;
}

describe("pinned FIDE Dutch engine", () => {
  it.each([
    "dutch_2025_C5",
    "dutch_2025_C9",
    "issue_7",
    "dutch_exchange_rule4",
  ])("matches every reference color and opponent in %s", (name) => {
    expect(pairFideTrf(input(name))).toEqual(reference(name));
  });
  it("matches the native BBP reference for the 180-entrant regression", () => {
    expect(pairFideTrf(input("issue_15") + "\nXXR 12\n")).toEqual(
      reference("issue_15_pairs"),
    );
  }, 30000);
  it("rejects malformed or oversized data without poisoning the next call", () => {
    expect(() => pairFideTrf("x".repeat(600001))).toThrow("safe format limits");
    expect(() => pairFideTrf("x".repeat(120000))).toThrow(
      "complete legal pairing",
    );
    expect(() => pairFideTrf("012\n\u0000")).toThrow("safe format limits");
    expect(pairFideTrf(input("dutch_2025_C5"))).toEqual(
      reference("dutch_2025_C5"),
    );
  });
  it("accepts a bounded large TRF string without stack overflow", () => {
    expect(
      pairFideTrf(input("dutch_2025_C5") + "\n" + " ".repeat(550000)),
    ).toEqual(reference("dutch_2025_C5"));
  });
  it.each(["white", "black"] as const)(
    "uses declared %s initial color and fixed initial numbers",
    (color) => {
      const doc = fixture(8, color);
      const generated = generateStage(doc, doc.stages[0].id);
      const order = generated.stages[0].config.swiss!.federation!.pairingOrder!;
      const expected = [
        [1, 5],
        [6, 2],
        [3, 7],
        [8, 4],
      ].map((pair) => (color === "white" ? pair : [...pair].reverse()));
      expect(
        generated.matches.map((match) =>
          match.slots.map((slot) => order.indexOf(slot.participantId!) + 1),
        ),
      ).toEqual(expected);
      expect(
        doc.stages[0].config.swiss!.federation!.pairingOrder,
      ).toBeUndefined();
      expect(
        validateTournament(generated).stages[0].config.swiss!.federation!
          .pairingOrder,
      ).toEqual(order);
    },
  );
  it("keeps seed edits and withdrawals from renumbering initial entrants", () => {
    let doc = fixture();
    doc = finish(generateStage(doc, doc.stages[0].id));
    const order = [...doc.stages[0].config.swiss!.federation!.pairingOrder!];
    doc.participants[0].status = "withdrawn";
    doc.participants.forEach((participant) => {
      participant.seed = 100 - participant.seed;
    });
    doc = advanceStage(doc, doc.stages[0].id);
    expect(doc.stages[0].config.swiss!.federation!.pairingOrder).toEqual(order);
    const next = doc.matches.filter((match) => match.round === 2);
    expect(
      next.flatMap((match) => match.slots.map((slot) => slot.participantId)),
    ).not.toContain(order[0]);
    expect(next.filter((match) => match.status === "bye")).toHaveLength(1);
  });
  it("retains colors, float history, and unique byes through five odd-field rounds", () => {
    let doc = fixture(17);
    doc = generateStage(doc, doc.stages[0].id);
    for (let round = 1; round <= 5; round++) {
      doc = finish(doc, round % 2 === 0);
      if (round < 5) doc = advanceStage(doc, doc.stages[0].id);
    }
    const pairs = doc.matches
      .filter((match) => match.status === "completed")
      .map((match) =>
        match.slots
          .map((slot) => slot.participantId)
          .sort()
          .join(":"),
      );
    expect(new Set(pairs).size).toBe(pairs.length);
    const byes = doc.matches
      .filter((match) => match.status === "bye")
      .map((match) => match.result!.winnerIds[0]);
    expect(new Set(byes).size).toBe(5);
    expect(doc.stages[0].status).toBe("completed");
  });
  it("treats an unplayed forfeit as a win without a played color or rematch restriction", () => {
    let doc = fixture(5);
    doc = generateStage(doc, doc.stages[0].id);
    const match = doc.matches.find((match) => match.status === "ready")!;
    const winner = match.slots[0].participantId!;
    doc = recordResult(doc, match.id, {
      scores: [0, 0],
      winnerIds: [winner],
      outcome: "forfeit",
      recordedAt: doc.updatedAt,
    });
    doc = finish(doc);
    const trf = fideTrf(doc, doc.stages[0], 2);
    expect(trf).toContain("w +");
    expect(trf).toContain("b -");
    doc = advanceStage(doc, doc.stages[0].id);
    expect(
      doc.matches.find((match) => match.round === 2 && match.status === "bye")
        ?.result?.winnerIds,
    ).not.toContain(winner);
  });
  it("adds zero-credit late entrants at the end of the fixed pairing order", () => {
    let doc = fixture();
    doc = finish(generateStage(doc, doc.stages[0].id));
    const order = [...doc.stages[0].config.swiss!.federation!.pairingOrder!];
    expect(() =>
      admitSwissEntrant(doc, doc.stages[0].id, "Late entrant", 0.5),
    ).toThrow("zero points");
    doc = admitSwissEntrant(doc, doc.stages[0].id, "Late entrant", 0);
    const late = doc.participants.at(-1)!.id;
    expect(doc.stages[0].config.swiss!.federation!.pairingOrder).toEqual([
      ...order,
      late,
    ]);
    doc = advanceStage(doc, doc.stages[0].id);
    expect(
      doc.matches
        .filter((match) => match.round === 2)
        .flatMap((match) => match.slots.map((slot) => slot.participantId)),
    ).toContain(late);
  });
  it("locks system, colors, and manual pairing changes after the first draw", () => {
    const initial = fixture();
    const drawn = generateStage(initial, initial.stages[0].id);
    expect(() => setManualSwissPairings(drawn, drawn.stages[0].id, [])).toThrow(
      "cannot be edited manually",
    );
    const doc = finish(drawn);
    const policy = structuredClone(doc.stages[0].config.swiss!);
    policy.federation!.initialColor = "black";
    expect(() => setSwissPolicy(doc, doc.stages[0].id, policy)).toThrow(
      "fixed after the first draw",
    );
    delete policy.federation;
    expect(() => setSwissPolicy(doc, doc.stages[0].id, policy)).toThrow(
      "fixed after the first draw",
    );
  });
  it("rejects unsupported policies, missing TPN history, and future engine versions", () => {
    const doc = fixture();
    const stage = doc.stages[0];
    doc.rules.pointsWin = 3;
    stage.config.forbiddenPairs = [
      [stage.participantIds[0], stage.participantIds[1]],
    ];
    doc.participants[0].metadata.pointsAdjustment = 1;
    expect(swissPolicyErrors(doc, stage)).toHaveLength(3);
    const clean = fixture();
    const generated = generateStage(clean, clean.stages[0].id);
    delete generated.stages[0].config.swiss!.federation!.pairingOrder;
    expect(() => validateTournament(generated)).toThrow(
      "original pairing numbers",
    );
    const unknown = JSON.parse(JSON.stringify(clean));
    unknown.stages[0].config.swiss.federation.engine = "future-engine";
    expect(() => validateTournament(unknown)).toThrow();
  });
  it("excludes names and private notes from the TRF adapter", () => {
    const doc = fixture();
    doc.participants[0].metadata.notes = "Private roster details";
    const trf = fideTrf(doc, doc.stages[0], 1);
    expect(trf).not.toContain(doc.participants[0].name);
    expect(trf).not.toContain("Private roster details");
  });
  it("clears dependent pairing numbers after an upstream correction", () => {
    let doc = fixture();
    const destination = structuredClone(doc.stages[0]);
    const source = doc.stages[0];
    source.format = "round-robin";
    delete source.config.swiss;
    doc.rules.tieBreakers = ["points", "seed"];
    destination.id = "dutch-final";
    destination.order = 1;
    destination.participantIds = [];
    destination.sources = [{ stageId: source.id, count: 4, perGroup: false }];
    destination.config.rounds = 3;
    doc.stages.push(destination);
    doc = finish(generateStage(doc, source.id));
    doc = generateStage(doc, destination.id);
    expect(doc.stages[1].config.swiss!.federation!.pairingOrder).toHaveLength(
      4,
    );
    const match = doc.matches.find(
      (match) => match.stageId === source.id && match.status === "completed",
    )!;
    doc = recordResult(
      doc,
      match.id,
      {
        scores: [0, 1],
        winnerIds: [match.slots[1].participantId!],
        outcome: "played",
        recordedAt: doc.updatedAt,
      },
      true,
    );
    expect(doc.stages[1].participantIds).toEqual([]);
    expect(
      doc.stages[1].config.swiss!.federation!.pairingOrder,
    ).toBeUndefined();
    expect(validateTournament(doc)).toBeDefined();
    const next = generateStage(doc, destination.id);
    expect(next.stages[1].config.swiss!.federation!.pairingOrder).toHaveLength(
      4,
    );
  });
  it("reassigns pairing numbers for a fresh draw using the new seed order", () => {
    const doc = fixture();
    const generated = generateStage(doc, doc.stages[0].id);
    generated.matches = [];
    generated.stages[0].status = "draft";
    generated.participants.forEach((participant) => {
      participant.seed = 100 - participant.seed;
    });
    const reseeded = generateStage(generated, generated.stages[0].id);
    expect(reseeded.stages[0].config.swiss!.federation!.pairingOrder).toEqual(
      [...doc.stages[0].participantIds].reverse(),
    );
  });
  it("preserves the policy in snapshots and remaps fixed numbers in recipes", async () => {
    const doc = fixture();
    const drawn = generateStage(doc, doc.stages[0].id);
    const copied = await decodeCode(await encodeCode(drawn));
    expect(copied.stages[0].config.swiss!.federation).toEqual(
      drawn.stages[0].config.swiss!.federation,
    );
    const recipe = await decodeStageRecipe(await encodeStageRecipe(drawn));
    const restored = recipe.stages[0];
    expect(restored.config.swiss!.federation!.pairingOrder).toEqual(
      restored.participantIds,
    );
  });
});
