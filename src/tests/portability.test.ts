import { describe, expect, it } from "vitest";
import { gzipSync, strToU8, zipSync } from "fflate";
import fc from "fast-check";
import {
  createParticipant,
  createTournament,
  type Tournament,
} from "../domain/types";
import { migrateTournament, validateTournament } from "../domain/validate";
import {
  base64ToBytes,
  bytesToBase64,
  canonicalize,
  decompress,
  LIMITS,
  safeParse,
  sha256,
  validateRasterAsset,
} from "../security/codec";
import {
  createRecoverySecret,
  decryptJson,
  encryptJson,
  KEY_ITERATIONS,
} from "../security/crypto";
import {
  applyPatch,
  createPatch,
  decodeCode,
  decodePatch,
  decodeRecipe,
  encodeCode,
  encodePatch,
  encodeRecipe,
  exportArchive,
  hashDocument,
  importArchive,
  publicProjection,
  sealDocument,
  transferAdvice,
} from "../sharing";
import {
  acceptRegistration,
  createRegistrationResponse,
  createRegistrationTemplate,
  createResultProposal,
  parseOfflinePacket,
  validateResultProposal,
} from "../sharing/packets";
import { generateStage, getChampion, simulate } from "../engine";
import { getStandings } from "../standings";

function fixture(): Tournament {
  const tournament = createTournament(
    "جام گل یا پوچ",
    [
      createParticipant("تهران", 1),
      createParticipant("Shiraz", 2),
      createParticipant("اصفهان", 3),
    ],
    "single-elimination",
    "gol-ya-pooch",
  );
  tournament.revision = 1;
  tournament.matches = [
    {
      id: "first",
      stageId: tournament.stages[0].id,
      round: 1,
      index: 0,
      label: "Opening",
      slots: [
        { participantId: tournament.participants[0].id },
        { participantId: tournament.participants[1].id },
      ],
      status: "ready",
      notes: "private organizer note",
      referee: "Private referee",
      private: { concealedPosition: "secret location" },
      metadata: { privateKey: "hidden metadata" },
    },
  ];
  tournament.metadata.privateNote = "private tournament note";
  tournament.participants[0].roster.push({
    id: "captain",
    name: "Private player",
    role: "captain",
  });
  tournament.theme.preset = "gol-traditional";
  return tournament;
}

describe("document validation", () => {
  it("preserves safe extension configuration and Unicode", () => {
    const tournament = fixture();
    tournament.stages[0].config.futurePlugin = { version: 2, option: "custom" };
    expect(
      validateTournament(tournament).stages[0].config.futurePlugin,
    ).toEqual({ version: 2, option: "custom" });
    expect(migrateTournament(tournament).title).toBe(tournament.title);
  });

  it("rejects future versions without mutating their data", () => {
    const future = { ...fixture(), schemaVersion: 9 };
    expect(() => migrateTournament(future)).toThrow(
      "unsupported schema version",
    );
    expect(future.schemaVersion).toBe(9);
  });

  it("rejects unsafe keys, invalid numbers and excessive nesting", () => {
    expect(() => safeParse('{"__proto__":{"polluted":true}}')).toThrow(
      "Unsafe object key",
    );
    const tournament = fixture();
    tournament.rules.pointsWin = Infinity;
    expect(() => validateTournament(tournament)).toThrow();
    expect(() => safeParse("[".repeat(50) + "1" + "]".repeat(50))).toThrow(
      "complexity",
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects duplicate entities, dangling sources and cyclic stages", () => {
    const duplicate = fixture();
    duplicate.participants.push(duplicate.participants[0]);
    expect(() => validateTournament(duplicate)).toThrow(
      "Duplicate participant",
    );
    const dangling = fixture();
    dangling.matches[0].slots[0].source = {
      matchId: "missing",
      result: "winner",
    };
    expect(() => validateTournament(dangling)).toThrow("invalid source");
    const cyclic = fixture();
    cyclic.stages[0].sources = [
      { stageId: cyclic.stages[0].id, count: 1, perGroup: false },
    ];
    expect(() => validateTournament(cyclic)).toThrow("cycle");
  });

  it("rejects control characters in identifiers used by exported formats", () => {
    const tournament = fixture();
    tournament.matches[0].id = "match\r\nBEGIN:VEVENT";
    expect(() => validateTournament(tournament)).toThrow("Identifiers");
  });

  it("rejects timezone names that would break localized output", () => {
    const tournament = fixture();
    tournament.timezone = "Unknown/Place";
    expect(() => validateTournament(tournament)).toThrow("timezone");
    tournament.timezone = "Asia/Tehran";
    expect(validateTournament(tournament).timezone).toBe("Asia/Tehran");
  });

  it("rejects winner identities outside their match", () => {
    const tournament = fixture();
    tournament.matches[0].result = {
      scores: [1, 0],
      winnerIds: [tournament.participants[2].id],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    };
    expect(() => validateTournament(tournament)).toThrow("winner is not in");
  });

  it("rejects remote and executable image content", () => {
    expect(validateRasterAsset("https://example.com/logo.png")).toBe(false);
    expect(
      validateRasterAsset("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    ).toBe(false);
    const tournament = fixture();
    tournament.theme.logo = "javascript:alert(1)";
    expect(() => validateTournament(tournament)).toThrow("images");
  });

  it("is stable across JSON property ordering", async () => {
    const document = fixture();
    expect(await hashDocument(document)).toBe(
      await hashDocument(JSON.parse(JSON.stringify(document))),
    );
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});

describe("snapshot sharing", () => {
  it("excludes referee secrets, notes, rosters and hidden extensions", () => {
    const tournament = fixture();
    tournament.stages[0].config.privateValue = "secret extension";
    const projected = publicProjection(tournament);
    const content = JSON.stringify(projected);
    for (const secret of [
      "secret location",
      "private organizer",
      "Private referee",
      "hidden metadata",
      "Private player",
      "private tournament",
      "secret extension",
    ]) {
      expect(content).not.toContain(secret);
    }
    expect(tournament.matches[0].private?.concealedPosition).toBe(
      "secret location",
    );
    expect(projected.matches[0].slots).toEqual(tournament.matches[0].slots);
  });

  it("preserves explicitly published presentation content", () => {
    const tournament = fixture();
    tournament.presentation.scenes[0].text = "Final starts at 18:00";
    expect(publicProjection(tournament).presentation.scenes[0].text).toBe(
      "Final starts at 18:00",
    );
  });

  it("retains safe live totals while excluding the referee hand log", () => {
    const tournament = fixture();
    tournament.matches[0].liveScores = [3, 2];
    expect(publicProjection(tournament).matches[0].liveScores).toEqual([3, 2]);
    tournament.matches[0].liveScores = [3];
    expect(() => validateTournament(tournament)).toThrow("one value");
  });

  it.each([
    "single-elimination",
    "double-elimination",
    "triple-elimination",
    "gsl",
    "ladder",
    "swiss",
  ] as const)(
    "preserves %s progression and standings across public transport",
    async (format) => {
      const initial = createTournament(
        "Public competition",
        Array.from({ length: 8 }, (_, index) =>
          createParticipant(`Team ${index + 1}`, index + 1),
        ),
        format,
      );
      const generated = generateStage(initial, initial.stages[0].id);
      const transported = await decodeCode(await encodeCode(generated));
      const expected = simulate(generated);
      const actual = simulate(transported);
      expect(getChampion(actual)?.id).toBe(getChampion(expected)?.id);
      expect(getStandings(actual, actual.stages[0].id)).toEqual(
        getStandings(expected, expected.stages[0].id),
      );
    },
  );

  it("roundtrips a Persian public code with a valid revision hash", async () => {
    const tournament = fixture();
    const code = await encodeCode(tournament);
    const restored = await decodeCode(
      `\n${code.slice(0, 50)} \n${code.slice(50)}\n`,
    );
    expect(restored.title).toBe(tournament.title);
    expect(restored.theme).toEqual(tournament.theme);
    expect(restored.matches[0].private).toBeUndefined();
    expect(restored.revisionHash).toBe(await hashDocument(restored));
    expect(restored.id).toBe(tournament.id);
  });

  it("roundtrips arbitrary participant text without HTML execution", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 60 })
          .filter((value) => value.trim().length > 0),
        async (name) => {
          const tournament = createTournament("Text test", [
            createParticipant(name, 1),
          ]);
          const restored = await decodeCode(await encodeCode(tournament));
          expect(restored.participants[0].name).toBe(name.trim());
        },
      ),
      { numRuns: 25 },
    );
  });

  it("rejects incomplete codes and modified data", async () => {
    const code = await encodeCode(fixture());
    await expect(decodeCode(code.slice(0, -3))).rejects.toThrow("checksum");
    await expect(decodeCode(code.replace("TS1:", "TS2:"))).rejects.toThrow(
      "TS1",
    );
    await expect(decodeCode(`TS1:${"x".repeat(10)}.invalid`)).rejects.toThrow(
      "checksum",
    );
  });

  it("roundtrips a complete private archive", async () => {
    const tournament = fixture();
    const archive = await exportArchive(tournament);
    const restored = await importArchive(archive);
    expect(restored.matches[0].private).toEqual(tournament.matches[0].private);
    expect(restored.participants[0].roster).toEqual(
      tournament.participants[0].roster,
    );
    expect(restored.title).toBe(tournament.title);
  });

  it("rejects traversal, unexpected archive files and truncated archives", async () => {
    const malicious = zipSync({
      "../tournament.json": strToU8("{}"),
      "manifest.json": strToU8("{}"),
    });
    await expect(importArchive(malicious)).rejects.toThrow("unsafe path");
    const executable = zipSync({
      "script.js": strToU8("alert(1)"),
      "manifest.json": strToU8("{}"),
    });
    await expect(importArchive(executable)).rejects.toThrow("unsafe path");
    const archive = await exportArchive(fixture());
    await expect(importArchive(archive.slice(0, 50))).rejects.toThrow();
    await expect(importArchive(archive.slice(0, -22))).rejects.toThrow(
      "footer",
    );
  });

  it("limits decompressed data rather than trusting compressed size", async () => {
    const bomb = gzipSync(strToU8(`"${"x".repeat(LIMITS.documentBytes + 1)}"`));
    expect(() => decompress(bomb)).toThrow("too large");
    const code = `TS1:${bytesToBase64(bomb)}.${await sha256(bomb)}`;
    await expect(decodeCode(code)).rejects.toThrow("too large");
    expect(() => base64ToBytes("not valid")).toThrow("Invalid");
  });

  it("creates a smaller recipe without participant identities and results", async () => {
    const tournament = fixture();
    const recipe = await encodeRecipe(tournament);
    const restored = await decodeRecipe(recipe);
    expect(restored.id).not.toBe(tournament.id);
    expect(restored.participants).toHaveLength(3);
    expect(restored.participants[0].name).toBe("Team 1");
    expect(restored.matches).toEqual([]);
    expect(restored.rules).toEqual(tournament.rules);
    expect(restored.theme).toEqual(tournament.theme);
    expect(recipe.length).toBeLessThan(
      (await encodeCode(tournament, undefined, true)).length,
    );
  });

  it("remaps recipe group assignments and restrictions to new entrants", async () => {
    const tournament = createTournament(
      "Assigned groups",
      Array.from({ length: 4 }, (_, index) =>
        createParticipant(`Original ${index + 1}`, index + 1),
      ),
      "groups",
    );
    const originalIds = tournament.participants.map(
      (participant) => participant.id,
    );
    tournament.stages[0].config.groupCount = 2;
    tournament.stages[0].config.groups = [
      [originalIds[0], originalIds[3]],
      [originalIds[1], originalIds[2]],
    ];
    tournament.stages[0].config.forbiddenPairs = [
      [originalIds[0], originalIds[1]],
    ];
    tournament.stages[0].config.manualQualifiers = [
      originalIds[2],
      originalIds[0],
    ];
    const recipe = await encodeRecipe(tournament);
    const payload = decompress(
      base64ToBytes(recipe.slice(5, recipe.lastIndexOf("."))),
    );
    for (const id of originalIds)
      expect(JSON.stringify(payload)).not.toContain(id);
    const restored = await decodeRecipe(recipe);
    const ids = restored.participants.map((participant) => participant.id);
    expect(restored.stages[0].config.groups).toEqual([
      [ids[0], ids[3]],
      [ids[1], ids[2]],
    ]);
    expect(restored.stages[0].config.forbiddenPairs).toEqual([
      [ids[0], ids[1]],
    ]);
    expect(restored.stages[0].config.manualQualifiers).toEqual([
      ids[2],
      ids[0],
    ]);
    const generated = generateStage(restored, restored.stages[0].id);
    expect(generated.matches).toHaveLength(2);
    expect(
      generated.matches
        .flatMap((match) => match.slots.map((slot) => slot.participantId))
        .sort(),
    ).toEqual([...ids].sort());
  });

  it("rejects unknown recipe positions and accepts older unassigned recipes", async () => {
    const code = await encodeRecipe(fixture());
    const payload = decompress(
      base64ToBytes(code.slice(5, code.lastIndexOf("."))),
    ) as Record<string, unknown>;
    const invalid = {
      ...payload,
      config: {
        ...(payload.config as Record<string, unknown>),
        manualQualifiers: ["slot-999"],
      },
    };
    const bytes = gzipSync(strToU8(JSON.stringify(invalid)));
    await expect(
      decodeRecipe(`TSR1:${bytesToBase64(bytes)}.${await sha256(bytes)}`),
    ).rejects.toThrow("unknown participant position");
    delete payload.participantReferences;
    const legacyBytes = gzipSync(strToU8(JSON.stringify(payload)));
    const restored = await decodeRecipe(
      `TSR1:${bytesToBase64(legacyBytes)}.${await sha256(legacyBytes)}`,
    );
    expect(restored.participants).toHaveLength(3);
  });

  it("recommends realistic transfer methods", () => {
    expect(transferAdvice(1000).qrSuitable).toBe(true);
    expect(transferAdvice(8000).method).toBe("code");
    expect(transferAdvice(20000).method).toBe("file");
    expect(transferAdvice(1000, true).method).toBe("file");
  });
});

describe("authenticated encryption", () => {
  const secret = "test-only-not-for-use";

  it("uses fresh salt and nonce, and authenticates all ciphertext", async () => {
    const first = await encryptJson({ private: "sensitive fixture" }, secret);
    const second = await encryptJson({ private: "sensitive fixture" }, secret);
    expect(first.iterations).toBe(KEY_ITERATIONS);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.salt).not.toBe(second.salt);
    expect(JSON.stringify(first)).not.toContain("sensitive fixture");
    expect(await decryptJson(first, secret)).toEqual({
      private: "sensitive fixture",
    });
    await expect(decryptJson(first, "incorrect-test-secret")).rejects.toThrow(
      "Incorrect secret",
    );
    const bytes = base64ToBytes(first.ciphertext);
    bytes[0] ^= 1;
    await expect(
      decryptJson({ ...first, ciphertext: bytesToBase64(bytes) }, secret),
    ).rejects.toThrow("damaged");
  });

  it("roundtrips protected files and protected codes with a separate secret", async () => {
    const tournament = fixture();
    const archive = await exportArchive(tournament, secret);
    await expect(importArchive(archive)).rejects.toThrow("separate secret");
    const recovered = await importArchive(archive, secret);
    expect(recovered.title).toBe(tournament.title);
    expect(recovered.matches[0].private).toEqual(tournament.matches[0].private);
    const code = await encodeCode(tournament, secret, true);
    await expect(decodeCode(code, "incorrect-test-secret")).rejects.toThrow(
      "Incorrect secret",
    );
    expect((await decodeCode(code, secret)).participants).toEqual(
      tournament.participants,
    );
    expect(createRecoverySecret()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("versioned updates", () => {
  it("applies only changed entities and preserves the target exactly", async () => {
    const base = await sealDocument(fixture());
    const target = structuredClone(base);
    target.revision = 4;
    target.matches[0].status = "completed";
    target.matches[0].result = {
      scores: [6, 2],
      winnerIds: [base.participants[0].id],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    };
    const sealedTarget = await sealDocument(target);
    const patch = await createPatch(base, sealedTarget);
    expect(patch.operations).toHaveLength(1);
    expect(patch.operations[0].path).toEqual(["matches", "first"]);
    const restored = await applyPatch(
      base,
      await decodePatch(await encodePatch(patch)),
    );
    expect(restored).toEqual(sealedTarget);
    await expect(applyPatch(restored, patch)).rejects.toThrow(
      "already applied",
    );
    const divergent = { ...base, title: "Changed independently" };
    await expect(applyPatch(divergent, patch)).rejects.toThrow("diverged");
    expect(base.matches[0].status).toBe("ready");
  });

  it("handles inserted entities and rejects altered update packets", async () => {
    const base = await sealDocument(fixture());
    const target = {
      ...base,
      revision: 2,
      participants: [...base.participants, createParticipant("New team", 4)],
    };
    const patch = await createPatch(base, target);
    expect((await applyPatch(base, patch)).participants).toHaveLength(4);
    patch.operations[0].value = [];
    await expect(applyPatch(base, patch)).rejects.toThrow("checksum");
  });

  it("rejects wrong tournament identity and backward updates", async () => {
    const base = fixture();
    await expect(createPatch(base, { ...base, revision: 0 })).rejects.toThrow(
      "older revision",
    );
    const patch = await createPatch(base, {
      ...base,
      revision: 2,
      title: "Finals",
    });
    await expect(applyPatch({ ...base, id: "other" }, patch)).rejects.toThrow(
      "different tournament",
    );
  });
});

describe("offline organizer packets", () => {
  it("validates required registration fields and detects duplicate approval", () => {
    const tournament = fixture();
    const form = createRegistrationTemplate(tournament, [
      {
        id: "eligible",
        label: "Eligibility confirmed",
        type: "boolean",
        required: true,
      },
    ]);
    const participant = createParticipant("New entrant", 4);
    expect(() => createRegistrationResponse(form, [participant])).toThrow(
      "required",
    );
    const response = createRegistrationResponse(form, [participant], {
      eligible: true,
    });
    expect(parseOfflinePacket(JSON.stringify(response))).toEqual(response);
    const next = acceptRegistration(tournament, response);
    expect(next.participants).toHaveLength(4);
    expect(() => acceptRegistration(next, response)).toThrow(
      "already approved",
    );
    const duplicate = createRegistrationResponse(
      form,
      [createParticipant("تهران", 4)],
      { eligible: true },
    );
    expect(() => acceptRegistration(tournament, duplicate)).toThrow(
      "already registered",
    );
  });

  it("checks result proposals against public competitive state", async () => {
    const tournament = fixture();
    const proposal = await createResultProposal(tournament, "first", {
      scores: [6, 2],
      winnerIds: [tournament.participants[0].id],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect((await validateResultProposal(tournament, proposal)).matchId).toBe(
      "first",
    );
    tournament.matches[0].notes = "Changed by organizer";
    expect((await validateResultProposal(tournament, proposal)).matchId).toBe(
      "first",
    );
    tournament.matches[0].status = "live";
    await expect(validateResultProposal(tournament, proposal)).rejects.toThrow(
      "changed after",
    );
  });

  it("accepts a scorekeeper proposal from a public snapshot", async () => {
    const tournament = fixture();
    const snapshot = await decodeCode(await encodeCode(tournament));
    const proposal = await createResultProposal(snapshot, "first", {
      scores: [6, 2],
      winnerIds: [tournament.participants[0].id],
      outcome: "played",
      recordedAt: new Date().toISOString(),
    });
    expect((await validateResultProposal(tournament, proposal)).matchId).toBe(
      "first",
    );
  });
});
