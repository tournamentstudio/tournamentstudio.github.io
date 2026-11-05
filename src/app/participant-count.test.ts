import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseParticipantCount } from "./participant-count";

describe("participant count drafts", () => {
  it.each([
    "",
    " ",
    "0",
    "-1",
    "1",
    "2.5",
    "511.9",
    "513",
    "NaN",
    "Infinity",
    "1e309",
    "two",
  ])("rejects %j without inventing a valid count", (input) =>
    expect(parseParticipantCount(input)).toBeUndefined(),
  );

  it("preserves every supported integer without rounding or clamping", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 512 }), (count) => {
        expect(parseParticipantCount(String(count))).toBe(count);
      }),
    );
    expect(parseParticipantCount("2")).toBe(2);
    expect(parseParticipantCount("512")).toBe(512);
    expect(parseParticipantCount(" 13 ")).toBe(13);
  });
});
