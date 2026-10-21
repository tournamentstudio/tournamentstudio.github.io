import { describe, expect, it } from "vitest";
import { inactivityRemaining, parseInactivityMinutes } from "./inactivity";

describe("vault inactivity policy", () => {
  it("uses a deliberate default and refuses unrecognized stored settings", () => {
    for (const value of [null, "", "garbage", "-1", "0.5", "300", "{}"])
      expect(parseInactivityMinutes(value)).toBe(15);
    expect(parseInactivityMinutes("1")).toBe(1);
    expect(parseInactivityMinutes("0")).toBe(0);
  });
  it("expires on the deadline, preserves explicit off and bounds clock reversal", () => {
    expect(inactivityRemaining(1000, 60_999, 1)).toBe(1);
    expect(inactivityRemaining(1000, 61_000, 1)).toBe(0);
    expect(inactivityRemaining(1000, 900_000, 1)).toBe(0);
    expect(inactivityRemaining(1000, 0, 1)).toBe(60_000);
    expect(inactivityRemaining(1000, 900_000, 0)).toBeUndefined();
  });
});
