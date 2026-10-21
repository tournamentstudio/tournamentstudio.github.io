import { describe, expect, it } from "vitest";
import { strToU8, strFromU8, zipSync } from "fflate";
import { readWorkbookEntries, writeWorkbook } from "./xlsx";
import { participantWorkbook } from "../app/participants/workbook";
import { createParticipant } from "../domain/types";

describe("bounded workbook transport", () => {
  it("writes real XML cells with types, escaped names and no formulas", () => {
    const bytes = writeWorkbook([
      {
        name: "Teams",
        rows: [
          ["نام", "Seed", "Checked in"],
          ['=HYPERLINK("https://example.com")', 3, true],
          ["<تیم & یک>", 4, false],
        ],
      },
    ]);
    const entries = readWorkbookEntries(bytes);
    const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("&lt;تیم &amp; یک&gt;");
    expect(sheet).toContain('<c r="B2"><v>3</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).not.toContain("<f>");
    expect(Object.keys(entries)).toHaveLength(5);
  });
  it("writes participant rosters and private administration records", () => {
    const participant = createParticipant("تهران", 2);
    participant.roster = [{ id: "captain", name: "Captain", role: "captain" }];
    participant.metadata.organizer = {
      registration: "waiting",
      payment: "unpaid",
      note: "Private review",
    };
    const sheet = strFromU8(
      readWorkbookEntries(participantWorkbook([participant]))[
        "xl/worksheets/sheet1.xml"
      ],
    );
    expect(sheet).toContain("Captain");
    expect(sheet).toContain("unpaid");
    expect(sheet).toContain("Private review");
  });
  it("rejects unsafe paths, active content, truncation and archive bombs", () => {
    for (const name of [
      "../workbook.xml",
      "/workbook.xml",
      "xl/vbaProject.bin",
      "xl/externalLinks/externalLink1.xml",
      "xl/activeX/control.xml",
    ]) {
      expect(() =>
        readWorkbookEntries(zipSync({ [name]: strToU8("a") })),
      ).toThrow(/Unsafe/);
    }
    const bytes = writeWorkbook([{ name: "A", rows: [["name"], ["A"]] }]);
    expect(() =>
      readWorkbookEntries(bytes.subarray(0, bytes.length - 4)),
    ).toThrow(/footer/);
    expect(() =>
      readWorkbookEntries(
        zipSync({
          "xl/worksheets/sheet1.xml": new Uint8Array(8 * 1024 * 1024 + 1),
        }),
      ),
    ).toThrow(/8 MB/);
  });
  it("rejects excessive writer output, invalid names, numbers and controls", () => {
    for (const name of ["", "A/B", "a".repeat(32)])
      expect(() => writeWorkbook([{ name, rows: [] }])).toThrow();
    expect(() =>
      writeWorkbook([
        { name: "A", rows: [] },
        { name: "a", rows: [] },
      ]),
    ).toThrow();
    expect(() => writeWorkbook([{ name: "A", rows: [[Infinity]] }])).toThrow(
      /finite/,
    );
    expect(() =>
      writeWorkbook([{ name: "A", rows: [[String.fromCharCode(1)]] }]),
    ).toThrow(/characters/);
    expect(() =>
      writeWorkbook([{ name: "A", rows: [Array(65).fill(0)] }]),
    ).toThrow(/size/);
  });
});
