import { describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../../domain/types";
import {
  organizerRecord,
  participantAvailabilityError,
  waitingList,
} from "../../domain/participant-admin";
import { publicProjection } from "../../sharing";
import { tournamentCSV } from "../../export";
import { importParticipants, parseCSV } from "./import-list";

describe("participant file imports", () => {
  it("reads the application's exported CSV column names and booleans", () => {
    const person = createParticipant("تیم آفتاب", 2);
    person.checkedIn = true;
    person.region = "North";
    const doc = createTournament("Cup", [person]);
    for (const locale of ["en", "fa"] as const) {
      const [imported] = importParticipants(
        tournamentCSV(doc, "participants", locale),
        "csv",
      );
      expect(imported).toMatchObject({
        name: person.name,
        checkedIn: true,
        seed: 2,
        region: "North",
      });
    }
  });
  it("reads multiline CSV names and doubled quotes without splitting records", () => {
    expect(
      parseCSV(
        'name,region\r\n"Team, One","North"\r\n"تیم\nدوم","A ""B"""\r\n',
      ),
    ).toEqual([
      ["name", "region"],
      ["Team, One", "North"],
      ["تیم\nدوم", 'A "B"'],
    ]);
    const result = importParticipants(
      'name,seed,region,organization,checkedIn,tags\r\n"تیم, آفتاب",7,تهران,Club,true,"a;b"',
      "csv",
    );
    expect(result[0]).toMatchObject({
      name: "تیم, آفتاب",
      seed: 7,
      region: "تهران",
      organization: "Club",
      checkedIn: true,
      tags: ["a", "b"],
    });
  });
  it("rejects malformed CSV, unsupported headers and mismatched columns", () => {
    for (const text of [
      'name,region\n"Open,x',
      "name,name\na,b",
      "name,unknown\na,b",
      "name,seed\na,2,3",
      'name\n"a"tail',
    ])
      expect(() => importParticipants(text, "csv")).toThrow();
  });
  it("keeps roster roles and safe extensions while assigning fresh identities", () => {
    const original = createParticipant("North", 4);
    original.roster = [{ id: "old-player", name: "Captain", role: "captain" }];
    original.metadata = {
      extension: { retained: true },
      availableFrom: "2026-10-21T09:00:00Z",
      availableUntil: "2026-10-21T18:00:00Z",
    };
    const [imported] = importParticipants(JSON.stringify([original]), "json");
    expect(imported.id).not.toBe(original.id);
    expect(imported.roster[0].id).not.toBe("old-player");
    expect(imported.roster[0]).toMatchObject({
      name: "Captain",
      role: "captain",
    });
    expect(imported.metadata).toEqual(original.metadata);
  });
  it("imports organizer fields and rejects invalid dates or choices", () => {
    const [participant] = importParticipants(
      'name,registration,eligibility,payment,note,availableFrom,availableUntil\nTeam,waiting,eligible,unpaid,"Call captain",2026-10-21T09:00:00Z,2026-10-21T18:00:00Z',
      "csv",
    );
    expect(organizerRecord(participant)).toMatchObject({
      registration: "waiting",
      eligibility: "eligible",
      payment: "unpaid",
      note: "Call captain",
    });
    expect(participantAvailabilityError(participant)).toBeUndefined();
    for (const value of [
      { name: "A", metadata: { availableFrom: "invalid" } },
      {
        name: "A",
        metadata: {
          availableFrom: "2026-10-21T18:00:00Z",
          availableUntil: "2026-10-21T09:00:00Z",
        },
      },
      { name: "A", metadata: { organizer: { payment: "charged" } } },
      { name: "A", roster: [{ name: "Player", role: "wizard" }] },
    ])
      expect(() => importParticipants(JSON.stringify([value]), "json")).toThrow(
        /invalid fields/,
      );
  });
  it("validates imported assets and file bounds", () => {
    expect(() =>
      importParticipants(
        JSON.stringify([{ name: "A", logo: "https://example.com/avatar.svg" }]),
        "json",
      ),
    ).toThrow();
    expect(() =>
      importParticipants("x".repeat(1024 * 1024 + 1), "txt"),
    ).toThrow(/1 MB/);
    expect(() =>
      importParticipants(
        Array.from({ length: 513 }, (_, i) => `P${i}`).join("\n"),
        "txt",
      ),
    ).toThrow(/512/);
    expect(() =>
      importParticipants('[{"name":"A","metadata":{"__proto__":{}}}]', "json"),
    ).toThrow(/Unsafe/);
  });
});

describe("private organizer records", () => {
  it("orders waiting entrants by queue time without mutating participants", () => {
    const people = [
      createParticipant("Later", 1),
      createParticipant("Earlier", 2),
      createParticipant("Approved", 3),
    ];
    people[0].metadata.organizer = {
      registration: "waiting",
      queuedAt: "2026-10-21T10:00:00Z",
    };
    people[1].metadata.organizer = {
      registration: "waiting",
      queuedAt: "2026-10-21T09:00:00Z",
    };
    expect(waitingList(people).map((person) => person.name)).toEqual([
      "Earlier",
      "Later",
    ]);
    expect(people[0].name).toBe("Later");
  });
  it("excludes organizer notes, payments and availability from public copies", () => {
    const [participant] = importParticipants(
      "name,registration,eligibility,payment,note,availableFrom\nPublic name,waiting,eligible,paid,Private note,2026-10-21T09:00:00Z",
      "csv",
    );
    const projected = publicProjection(createTournament("Cup", [participant]));
    expect(projected.participants[0].metadata).toEqual({});
    expect(JSON.stringify(projected)).not.toContain("Private note");
    expect(projected.participants[0].name).toBe("Public name");
  });
});
