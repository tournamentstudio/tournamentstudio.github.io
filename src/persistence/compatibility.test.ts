import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { migrateTournament } from "../domain/validate";
import { db, repository } from "./index";
import { compress } from "../security/codec";
import { sealDocument } from "../sharing";

const fixtureText = readFileSync(
  new URL("./fixtures/schema1-legacy.json", import.meta.url),
  "utf8",
);
afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});
it("opens a fixed schema1 fixture without adding optional settings or discarding extensions", async () => {
  const source = JSON.parse(fixtureText);
  expect(migrateTournament(source)).toEqual(source);
  expect(JSON.stringify(source)).toBe(JSON.stringify(JSON.parse(fixtureText)));
  const document = await sealDocument(source);
  await db.documents.add({
    id: document.id,
    title: document.title,
    sport: document.sport,
    status: document.status,
    updatedAt: document.updatedAt,
    revision: document.revision,
    revisionHash: document.revisionHash,
    protected: false,
    favorite: false,
    payload: document,
  });
  await db.snapshots.add({
    tournamentId: document.id,
    revision: document.revision,
    at: document.updatedAt,
    action: "Legacy checkpoint",
    hash: document.revisionHash,
    protected: false,
    payload: compress(document),
  });
  expect(await repository.load(document.id)).toEqual(document);
  expect(await repository.loadRevision(document.id, 1)).toEqual(document);
  const next = await repository.save(
    { ...document, subtitle: "Current application edit" },
    1,
  );
  expect(next.metadata["extension.unknown"]).toEqual(
    document.metadata["extension.unknown"],
  );
  expect(next.participants[0].metadata).toEqual(
    document.participants[0].metadata,
  );
  expect((await repository.loadRevision(document.id, 1)).subtitle).toBe(
    "جام قدیمی",
  );
});
it("rejects future and malformed source formats without replacing saved data", async () => {
  const saved = await repository.create(
    migrateTournament(JSON.parse(fixtureText)),
  );
  const before = await db.documents.toArray();
  for (const schemaVersion of [0, 2, "1", null]) {
    const future = {
      ...JSON.parse(fixtureText),
      schemaVersion,
      metadata: { unknownFuture: { preserve: true } },
    };
    const original = JSON.stringify(future);
    expect(() => migrateTournament(future)).toThrow();
    expect(JSON.stringify(future)).toBe(original);
  }
  expect(await db.documents.toArray()).toEqual(before);
  expect(await repository.load(saved.id)).toEqual(saved);
});
