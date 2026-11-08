import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { generateStage, recordResult } from "../engine";
import { localeCodes } from "../i18n/locales";
import {
  decodeCode,
  encodeCode,
  exportArchive,
  importArchive,
} from "../sharing";
import { db, repository } from "./index";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});

describe("tournament language compatibility", () => {
  it.each(localeCodes)(
    "preserves %s through saved results, history and portable backups",
    async (locale) => {
      const source = createTournament(
        "Club pétanque باشگاه",
        [createParticipant("Roma", 1), createParticipant("شیراز", 2)],
        "round-robin",
      );
      source.locale = locale;
      let saved = await repository.create(source);
      expect(validateTournament(saved).locale).toBe(locale);
      saved = generateStage(saved, saved.stages[0].id);
      saved = recordResult(saved, saved.matches[0].id, {
        scores: [13, 8],
        winnerIds: [],
        outcome: "played",
        recordedAt: saved.updatedAt,
      });
      saved = await repository.save(
        saved,
        saved.revision,
        "Record match result",
      );
      expect(await repository.load(saved.id)).toEqual(saved);
      expect((await repository.loadRevision(saved.id, 1)).locale).toBe(locale);
      const restored = await importArchive(await exportArchive(saved));
      expect(restored).toEqual(saved);
      const shared = await decodeCode(await encodeCode(saved));
      expect(shared.locale).toBe(locale);
      expect(shared.matches).toEqual(saved.matches);
      expect(
        shared.participants.map((participant) => participant.name),
      ).toEqual(["Roma", "شیراز"]);
    },
  );

  it("rejects unsupported locale values without discarding saved content", () => {
    const source = createTournament("Original title", []);
    const before = structuredClone(source);
    expect(() => validateTournament({ ...source, locale: "xx" })).toThrow();
    expect(source).toEqual(before);
  });
});
