import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  DEFAULT_CONFIG,
  type FormatId,
} from "../domain/types";
import { sourceGroups } from "../domain/advancement";
import { validateTournament } from "../domain/validate";
import { sourceGroups as editorGroups } from "../app/structure/helpers";
import { generateStage, getStandings, validateGraph } from "./index";
import { db, repository } from "../persistence";
import { publicProjection } from "../sharing";
import { decodeStageRecipe, encodeStageRecipe } from "../sharing/recipes";

function cup(count: number, format: FormatId = "groups", groupCount = count) {
  const doc = createTournament(
    "Group labels",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    format,
  );
  doc.stages[0].config.groupCount = groupCount;
  doc.stages[0].config.capacity = 4;
  doc.stages[0].config.rounds = 1;
  return doc;
}

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});

it.each([27, 64, 128])(
  "uses readable labels and valid identifiers for %i groups",
  async (count) => {
    const input = cup(count);
    const draftGroups = sourceGroups(input, input.stages[0]);
    expect(draftGroups.slice(24, 28)).toEqual(
      count === 27 ? ["Y", "Z", "AA"] : ["Y", "Z", "AA", "AB"],
    );
    const generated = generateStage(input, input.stages[0].id);
    const labels = sourceGroups(generated, generated.stages[0]);
    expect(labels).toEqual(draftGroups);
    expect(editorGroups(generated, generated.stages[0])).toEqual(labels);
    expect(labels.at(-1)).toBe(
      count === 27 ? "AA" : count === 64 ? "BL" : "DX",
    );
    expect(validateTournament(generated)).toEqual(generated);
    expect(getStandings(generated, generated.stages[0].id, "AA")).toHaveLength(
      1,
    );
    const saved = await repository.create(generated);
    expect(await repository.load(saved.id)).toEqual(saved);
    expect(publicProjection(saved).stages[0].config.groupLabelVersion).toBe(1);
  },
);

it.each(["gsl", "free-for-all"] as const)(
  "uses the same labels for %s groups and heats",
  (format) => {
    const doc = cup(512, format, 128);
    const generated = generateStage(doc, doc.stages[0].id);
    expect(
      [...new Set(generated.matches.map((match) => match.group))].at(-1),
    ).toBe("DX");
    expect(validateTournament(generated)).toEqual(generated);
  },
);

it("roundtrips 512 entrants in 128 played groups without unsafe match IDs", async () => {
  const input = cup(512, "groups", 128);
  const generated = generateStage(input, input.stages[0].id);
  expect(generated.matches).toHaveLength(768);
  expect(generated.matches.every((match) => match.status === "ready")).toBe(
    true,
  );
  const imported = validateTournament(JSON.parse(JSON.stringify(generated)));
  const saved = await repository.create(imported);
  expect(await repository.load(saved.id)).toEqual(saved);
  expect(getStandings(saved, saved.stages[0].id, "DX")).toHaveLength(4);
});

it("keeps alphabetic group selections in drafts, generated stages and recipes", async () => {
  const doc = cup(54, "groups", 27);
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    status: "draft",
    metadata: {},
    sources: [
      {
        stageId: doc.stages[0].id,
        count: 1,
        perGroup: false,
        selection: { kind: "positions", picks: [{ group: "AA", rank: 1 }] },
      },
    ],
  });
  expect(validateGraph(doc)).toEqual([]);
  const generated = generateStage(doc, doc.stages[0].id);
  expect(validateGraph(generated)).toEqual([]);
  const recipe = await decodeStageRecipe(await encodeStageRecipe(generated));
  expect(recipe.stages[0].config.groupLabelVersion).toBe(1);
  expect(sourceGroups(recipe, recipe.stages[0]).at(-1)).toBe("AA");
  expect(validateGraph(recipe)).toEqual([]);
});

it("retains unmarked legacy group IDs and exact selections on import and regeneration", async () => {
  const doc = cup(54, "groups", 27);
  delete doc.stages[0].config.groupLabelVersion;
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    status: "draft",
    metadata: {},
    sources: [
      {
        stageId: doc.stages[0].id,
        count: 1,
        perGroup: false,
        selection: { kind: "positions", picks: [{ group: "[", rank: 1 }] },
      },
    ],
  });
  expect(sourceGroups(doc, doc.stages[0]).at(-1)).toBe("[");
  const generated = generateStage(doc, doc.stages[0].id);
  const restored = validateTournament(JSON.parse(JSON.stringify(generated)));
  expect(restored).toEqual(generated);
  expect(generateStage(restored, restored.stages[0].id).matches).toEqual(
    generated.matches,
  );
  expect(sourceGroups(restored, restored.stages[0]).at(-1)).toBe("[");
  expect(
    publicProjection(restored).stages[0].config.groupLabelVersion,
  ).toBeUndefined();
  const recipe = await decodeStageRecipe(await encodeStageRecipe(restored));
  expect(recipe.stages[0].config.groupLabelVersion).toBeUndefined();
  expect(sourceGroups(recipe, recipe.stages[0]).at(-1)).toBe("[");
});

it("rejects unsupported label versions without changing input", () => {
  const doc = cup(27);
  Reflect.set(doc.stages[0].config, "groupLabelVersion", 2);
  const before = structuredClone(doc);
  expect(() => validateTournament(doc)).toThrow();
  expect(() => generateStage(doc, doc.stages[0].id)).toThrow(
    /group label version/,
  );
  expect(doc).toEqual(before);
});

it("upgrades only unsafe legacy draft labels and remaps exact and wildcard group references", async () => {
  const doc = cup(128, "groups", 64);
  delete doc.stages[0].config.groupLabelVersion;
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    status: "draft",
    metadata: {},
    sources: [
      {
        stageId: doc.stages[0].id,
        count: 1,
        perGroup: false,
        selection: { kind: "positions", picks: [{ group: "\u007f", rank: 1 }] },
      },
      {
        stageId: doc.stages[0].id,
        count: 1,
        perGroup: false,
        selection: {
          kind: "wildcard",
          rank: 2,
          groups: ["\u007f", "\u0080"],
          comparison: "total",
          tieBreakers: ["points"],
        },
      },
    ],
  });
  const before = structuredClone(doc);
  expect(validateTournament(doc)).toEqual(doc);
  const generated = generateStage(doc, doc.stages[0].id);
  expect(doc).toEqual(before);
  expect(generated.stages[0].config.groupLabelVersion).toBe(1);
  expect(generated.stages[1].sources[0].selection).toMatchObject({
    picks: [{ group: "BK", rank: 1 }],
  });
  expect(generated.stages[1].sources[1].selection).toMatchObject({
    groups: ["BK", "BL"],
  });
  expect(validateGraph(generated)).toEqual([]);
  expect(validateTournament(generated)).toEqual(generated);
  const saved = await repository.create(generated);
  expect(await repository.load(saved.id)).toEqual(saved);
});

it("does not upgrade or rewrite a legacy stage with played match evidence", () => {
  const doc = cup(128, "groups", 64);
  const generated = generateStage(doc, doc.stages[0].id);
  const labels = sourceGroups(generated, generated.stages[0]);
  for (const match of generated.matches) {
    const legacy = String.fromCharCode(65 + labels.indexOf(match.group!));
    match.id = match.id.replace(`:${match.group}:`, `:${legacy}:`);
    match.group = legacy;
  }
  delete generated.stages[0].config.groupLabelVersion;
  const first = generated.matches[0];
  first.status = "completed";
  first.result = {
    scores: [2, 0],
    winnerIds: [first.slots[0].participantId!],
    outcome: "played",
    recordedAt: generated.updatedAt,
  };
  const before = structuredClone(generated);
  expect(() => generateStage(generated, generated.stages[0].id)).toThrow(
    /played or live/,
  );
  expect(generated).toEqual(before);
});

it("keeps unsafe legacy source references unchanged when a descendant draw already exists", () => {
  const doc = cup(128, "groups", 64);
  delete doc.stages[0].config.groupLabelVersion;
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: doc.stages[0].participantIds.slice(0, 2),
    status: "active",
    metadata: {},
    sources: [
      {
        stageId: doc.stages[0].id,
        count: 2,
        perGroup: false,
        selection: {
          kind: "positions",
          picks: [
            { group: "\u007f", rank: 1 },
            { group: "\u0080", rank: 1 },
          ],
        },
      },
    ],
  });
  doc.matches.push({
    id: "finals:main:1:0",
    stageId: "finals",
    round: 1,
    index: 0,
    label: "Final",
    status: "ready",
    metadata: {},
    slots: doc.stages[1].participantIds.map((participantId) => ({
      participantId,
    })),
  });
  const before = structuredClone(doc);
  expect(() => generateStage(doc, doc.stages[0].id)).toThrow(
    /Reset dependent stages/,
  );
  expect(doc).toEqual(before);
});

it("rejects unsafe legacy upgrades with future match outcome references", () => {
  const doc = cup(128, "groups", 64);
  delete doc.stages[0].config.groupLabelVersion;
  doc.stages.push({
    id: "finals",
    name: "Finals",
    format: "single-elimination",
    formatVersion: 1,
    order: 1,
    config: { ...DEFAULT_CONFIG },
    participantIds: [],
    status: "draft",
    metadata: {},
    sources: [
      {
        stageId: doc.stages[0].id,
        count: 1,
        perGroup: false,
        selection: {
          kind: "match-results",
          picks: [
            { matchId: `${doc.stages[0].id}:[:main:1:0`, outcome: "winners" },
          ],
        },
      },
    ],
  });
  expect(validateGraph(doc)).toEqual([]);
  const before = structuredClone(doc);
  expect(() => generateStage(doc, doc.stages[0].id)).toThrow(
    "Remove match outcome connections before regenerating their source draw.",
  );
  expect(doc).toEqual(before);
});
