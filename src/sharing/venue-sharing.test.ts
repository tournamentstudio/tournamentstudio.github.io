import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, previewKnockoutDraw, recordResult } from "../engine";
import {
  base64ToBytes,
  bytesToBase64,
  canonicalize,
  compress,
  decompress,
  sha256,
} from "../security/codec";
import {
  publicProjection,
  encodeCode,
  decodeCode,
  exportArchive,
  importArchive,
  encodeRecipe,
  decodeRecipe,
  sealDocument,
  createPatch,
  applyPatch,
  encodePatch,
  decodePatch,
} from "./index";

function fixture() {
  const tournament = createTournament(
    "جام محل بازی",
    Array.from({ length: 4 }, (_, index) => ({
      ...createParticipant(`تیم ${index + 1}`, index + 1),
      location: { latitude: 12.34567, longitude: 45.67891 + index },
    })),
    "single-elimination",
  );
  tournament.schedule.resources = [
    {
      id: "original-private-venue-id",
      name: "Original venue name",
      location: { latitude: 12.45678, longitude: 45.78912 },
      availableFrom: "2026-10-20T12:00:00Z",
    },
  ];
  tournament.stages[0].config.knockoutDraw = {
    version: 6,
    pots: [],
    restrictions: [],
    protectedSeeds: 0,
    separation: [],
    losersSeparation: [],
    finalsSeparation: [],
    distance: {
      minKm: 0,
      winnersThroughRound: 2,
      losersThroughRound: 0,
      finals: [],
    },
    venueRules: [
      {
        resourceId: tournament.schedule.resources[0].id,
        minKm: 0,
        maxKm: 1000,
        targets: [{ bracket: "winners", round: 2, index: 0 }],
      },
    ],
  };
  return generateStage(tournament, tournament.stages[0].id);
}

describe("venue location privacy and portable rules", () => {
  async function changedRecipe(
    edit: (payload: Record<string, unknown>) => void,
  ) {
    const code = await encodeRecipe(fixture());
    const payload = decompress(
      base64ToBytes(code.slice(5, code.lastIndexOf("."))),
    ) as Record<string, unknown>;
    edit(payload);
    const bytes = compress(payload);
    return `TSR1:${bytesToBase64(bytes)}.${await sha256(bytes)}`;
  }

  it("rejects missing, duplicate and unbound recipe venues instead of dropping the rules", async () => {
    for (const edit of [
      (payload: Record<string, unknown>) => {
        delete payload.venueResources;
      },
      (payload: Record<string, unknown>) => {
        payload.venueResources = [
          { id: "venue-1", name: "A" },
          { id: "venue-1", name: "B" },
        ];
      },
      (payload: Record<string, unknown>) => {
        payload.venueResources = [{ id: "different-venue", name: "A" }];
      },
    ])
      await expect(decodeRecipe(await changedRecipe(edit))).rejects.toThrow();
  });

  it("rejects coordinate payloads and oversized resource lists in recipes", async () => {
    await expect(
      decodeRecipe(
        await changedRecipe((payload) => {
          payload.venueResources = [
            {
              id: "venue-1",
              name: "A",
              location: { latitude: 0, longitude: 0 },
            },
          ];
        }),
      ),
    ).rejects.toThrow();
    await expect(
      decodeRecipe(
        await changedRecipe((payload) => {
          payload.venueResources = Array.from({ length: 65 }, (_, index) => ({
            id: `venue-${index + 1}`,
            name: "A",
          }));
        }),
      ),
    ).rejects.toThrow();
  });
  it("public projection excludes every coordinate but retains venue names, availability, targets and matches", async () => {
    const tournament = fixture();
    const projected = publicProjection(tournament);
    expect(projected.schedule.resources).toEqual([
      {
        id: tournament.schedule.resources[0].id,
        name: "Original venue name",
        availableFrom: "2026-10-20T12:00:00Z",
      },
    ]);
    expect(canonicalize(projected)).not.toMatch(
      /latitude|longitude|12\.34567|12\.45678|45\.78912/,
    );
    const restored = await decodeCode(await encodeCode(tournament));
    expect(restored.stages[0].config.knockoutDraw).toEqual(
      tournament.stages[0].config.knockoutDraw,
    );
    expect(restored.matches).toEqual(projected.matches);
    expect(previewKnockoutDraw(restored, restored.stages[0].id).ready).toBe(
      false,
    );
    const match = restored.matches.find((item) => item.status === "ready")!;
    const scored = recordResult(restored, match.id, {
      scores: [2, 1],
      winnerIds: [match.slots[0].participantId!],
      outcome: "played",
      recordedAt: "2026-10-20T12:00:00Z",
    });
    expect(
      scored.matches.find((item) => item.id === match.id)?.result?.scores,
    ).toEqual([2, 1]);
    expect(
      tournament.matches.find((item) => item.id === match.id)?.result,
    ).toBeUndefined();
  });

  it("private codes and encrypted archives preserve coordinates and reproducible venue draws", async () => {
    const tournament = fixture();
    const archive = await exportArchive(tournament, "test-only-venue-secret");
    await expect(
      importArchive(archive, "test-only-wrong-secret"),
    ).rejects.toThrow();
    for (const restored of [
      await decodeCode(await encodeCode(tournament, undefined, true)),
      await importArchive(archive, "test-only-venue-secret"),
    ]) {
      expect(restored.schedule).toEqual(tournament.schedule);
      expect(
        previewKnockoutDraw(restored, restored.stages[0].id).slots,
      ).toEqual(previewKnockoutDraw(tournament, tournament.stages[0].id).slots);
    }
  });

  it("recipes remap venue bindings to new resources without names or coordinates", async () => {
    const original = fixture();
    const code = await encodeRecipe(original);
    const first = await decodeRecipe(code);
    const second = await decodeRecipe(code);
    expect(canonicalize(first)).not.toMatch(
      /latitude|longitude|Original venue name|original-private-venue-id/,
    );
    expect(first.schedule.resources[0].name).toBe("Venue 1");
    expect(first.schedule.resources[0].id).not.toBe(
      second.schedule.resources[0].id,
    );
    const rule = first.stages[0].config.knockoutDraw;
    expect(rule?.version).toBe(6);
    if (rule?.version !== 6) throw new Error("Expected venue rules");
    expect(rule.venueRules[0].resourceId).toBe(first.schedule.resources[0].id);
    expect(rule.venueRules[0].minKm).toBe(0);
    expect(previewKnockoutDraw(first, first.stages[0].id).ready).toBe(false);
    first.participants.forEach((participant, index) => {
      participant.location = original.participants[index].location;
    });
    first.schedule.resources[0].location =
      original.schedule.resources[0].location;
    expect(
      generateStage(first, first.stages[0].id).matches.some(
        (match) => match.resourceId === first.schedule.resources[0].id,
      ),
    ).toBe(true);
  });

  it("public patches omit coordinate changes and private patches preserve them", async () => {
    const base = await sealDocument(fixture());
    const changed = structuredClone(base);
    changed.revision++;
    changed.schedule.resources[0].name = "Renamed court";
    changed.schedule.resources[0].location!.latitude = 13.45678;
    changed.participants[0].location!.longitude = 46.67891;
    const target = await sealDocument(changed);
    const visibleBase = await sealDocument(publicProjection(base));
    const visibleTarget = await sealDocument(publicProjection(target));
    const publicPatch = await createPatch(visibleBase, visibleTarget);
    expect(canonicalize(publicPatch)).not.toMatch(
      /latitude|longitude|13\.45678|46\.67891/,
    );
    expect(
      await applyPatch(
        visibleBase,
        await decodePatch(await encodePatch(publicPatch)),
      ),
    ).toEqual(visibleTarget);
    expect(await applyPatch(base, await createPatch(base, target))).toEqual(
      target,
    );
  });

  it("keeps a legacy resource projection unchanged when locations are absent", () => {
    const tournament = createTournament(
      "Legacy",
      [createParticipant("A", 1), createParticipant("B", 2)],
      "single-elimination",
    );
    expect(publicProjection(tournament).schedule).toEqual(tournament.schedule);
    expect(
      Object.hasOwn(
        publicProjection(tournament).schedule.resources[0],
        "location",
      ),
    ).toBe(false);
  });
});
