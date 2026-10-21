import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { advisorPlans } from "./advisor-plans";

describe("builder-ready format advice", () => {
  it("prefills 18 entrants in four uneven groups with eight playoff qualifiers", () => {
    const option = advisorPlans(18, 20, 3).find(
      (item) => item.id === "groups-finals",
    )!;
    expect(option.plan).toMatchObject({
      count: 18,
      groupCount: 4,
      qualifiers: 2,
      playoffs: true,
      format: "groups",
      matchMinutes: 20,
      resources: 3,
    });
    expect(option.matches).toBe(39);
    expect(option.minimum).toBe(3);
  });
  it("keeps qualifier counts possible for every supported field size", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 512 }), (count) => {
        for (const option of advisorPlans(count, 15, 2)) {
          expect(Number.isInteger(option.matches)).toBe(true);
          expect(option.matches).toBeGreaterThanOrEqual(count - 1);
          expect(option.minimum).toBeGreaterThanOrEqual(1);
          expect(option.plan.qualifiers).toBeLessThanOrEqual(
            option.plan.format === "groups"
              ? Math.floor(count / option.plan.groupCount)
              : count,
          );
        }
      }),
    );
  });
});
