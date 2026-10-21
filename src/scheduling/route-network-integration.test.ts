import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { db, repository } from "../persistence";
import { decodeCode, encodeCode, publicProjection } from "../sharing";
import { updateScheduleSettings } from "./settings";
import { readRouteNetwork, withRouteNetwork } from "./route-network";

afterEach(async () => {
  await db.documents.clear();
  await db.snapshots.clear();
});
function fixture() {
  let doc = createTournament("Private routes", [
    createParticipant("One", 1),
    createParticipant("Two", 2),
    createParticipant("Three", 3),
  ]);
  doc.schedule.resources.push({ id: "unused-venue", name: "Alternate venue" });
  doc = withRouteNetwork(doc, {
    version: 1,
    nodes: [
      { id: "home", name: "Private home location" },
      { id: "venue", name: "Alternate venue" },
    ],
    edges: [
      {
        id: "route",
        from: "home",
        to: "venue",
        km: 12,
        minutes: 20,
        bidirectional: true,
      },
    ],
    homes: [{ participantId: doc.participants[2].id, nodeId: "home" }],
    venues: [{ resourceId: "unused-venue", nodeId: "venue" }],
  });
  return doc;
}
it("preserves complete private network packets and excludes all location data from public snapshots", async () => {
  const doc = fixture(),
    network = readRouteNetwork(doc);
  const restored = await decodeCode(await encodeCode(doc, undefined, true));
  expect(readRouteNetwork(restored)).toEqual(network);
  expect(publicProjection(doc).metadata.travelNetwork).toBeUndefined();
  expect(JSON.stringify(publicProjection(doc))).not.toContain(
    "Private home location",
  );
  const publicCopy = await decodeCode(await encodeCode(doc));
  expect(publicCopy.metadata.travelNetwork).toBeUndefined();
});
it("removes deleted entrant mappings on repository save and retains a recoverable prior revision", async () => {
  const doc = await repository.create(fixture()),
    next = structuredClone(doc),
    removed = next.participants.pop()!;
  next.stages[0].participantIds = next.stages[0].participantIds.filter(
    (id) => id !== removed.id,
  );
  const saved = await repository.save(next, doc.revision, "Remove entrant");
  expect(readRouteNetwork(saved).homes).toHaveLength(0);
  expect(readRouteNetwork(saved).nodes).toHaveLength(2);
  const previous = await repository.loadRevision(doc.id, doc.revision);
  expect(readRouteNetwork(previous).homes[0].participantId).toBe(removed.id);
});
it("removes obsolete venue mappings through schedule settings without changing route geometry", () => {
  const doc = fixture();
  const changed = updateScheduleSettings(doc, {
    ...doc.schedule,
    resources: doc.schedule.resources.filter(
      (resource) => resource.id !== "unused-venue",
    ),
  });
  expect(readRouteNetwork(changed).venues).toEqual([]);
  expect(readRouteNetwork(changed).edges).toEqual(readRouteNetwork(doc).edges);
  expect(readRouteNetwork(doc).venues).toHaveLength(1);
});
