import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  schedulingConflictPairs,
  type ConflictInterval,
} from "./conflict-pairs";

function bruteForce(intervals: ConflictInterval[], rest: number) {
  const pairs = new Map<number, number[]>();
  for (let i = 0; i < intervals.length; i++) {
    const first = intervals[i];
    for (let j = i + 1; j < intervals.length; j++) {
      const second = intervals[j];
      const overlaps = first.start < second.end && second.start < first.end;
      const sharedResource =
        first.resourceId && first.resourceId === second.resourceId;
      const sharedReferee = first.referee && first.referee === second.referee;
      const insufficientRest =
        first.start < second.end + rest &&
        second.start < first.end + rest &&
        [...first.entrantIds].some((id) => second.entrantIds.has(id));
      if ((overlaps && (sharedResource || sharedReferee)) || insufficientRest) {
        const low = Math.min(first.index, second.index),
          high = Math.max(first.index, second.index);
        pairs.set(
          low,
          [...(pairs.get(low) ?? []), high].sort((a, b) => a - b),
        );
      }
    }
  }
  return new Map([...pairs].sort(([a], [b]) => a - b));
}

describe("schedule conflict interval index", () => {
  it("matches all-pairs checking for varied shared resources and possible entrants", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            start: fc.integer({ min: 0, max: 10000 }),
            duration: fc.integer({ min: 1, max: 1000 }),
            resource: fc.integer({ min: -1, max: 3 }),
            referee: fc.integer({ min: -1, max: 3 }),
            entrantIds: fc.uniqueArray(fc.integer({ min: 0, max: 12 }), {
              maxLength: 6,
            }),
          }),
          { maxLength: 60 },
        ),
        fc.integer({ min: 0, max: 500 }),
        (values, rest) => {
          const intervals = values.map((value, index) => ({
            index,
            start: value.start,
            end: value.start + value.duration,
            resourceId: value.resource >= 0 ? `r${value.resource}` : undefined,
            referee: value.referee >= 0 ? `f${value.referee}` : undefined,
            entrantIds: new Set(value.entrantIds.map(String)),
          }));
          expect(schedulingConflictPairs(intervals, rest)).toEqual(
            bruteForce(intervals, rest),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("treats touching intervals and exact rest boundaries as nonconflicting", () => {
    const first: ConflictInterval = {
      index: 0,
      start: 0,
      end: 20,
      resourceId: "court",
      entrantIds: new Set(["A"]),
    };
    const second: ConflictInterval = {
      index: 1,
      start: 25,
      end: 45,
      resourceId: "court",
      entrantIds: new Set(["A"]),
    };
    expect(schedulingConflictPairs([first, second], 5).size).toBe(0);
    expect(schedulingConflictPairs([first, second], 6).get(0)).toEqual([1]);
    expect(
      schedulingConflictPairs([first, { ...second, start: 20 }], 0).size,
    ).toBe(0);
  });

  it("deduplicates pairs sharing a referee, resource and many potential entrants", () => {
    const first = {
      index: 3,
      start: 0,
      end: 20,
      resourceId: "court",
      referee: "ref",
      entrantIds: new Set(["A", "B", "C"]),
    };
    expect(schedulingConflictPairs([first, { ...first, index: 1 }], 5)).toEqual(
      new Map([[1, [3]]]),
    );
  });

  it("handles 20000 sequential matches without generating pair candidates", () => {
    const intervals = Array.from({ length: 20000 }, (_, index) => ({
      index,
      start: index * 30,
      end: index * 30 + 20,
      resourceId: "court",
      referee: "ref",
      entrantIds: new Set(["A", "B"]),
    }));
    expect(schedulingConflictPairs(intervals, 10).size).toBe(0);
  });

  it("leaves the input untouched and excludes invalid intervals", () => {
    const input: ConflictInterval[] = [
      { index: 0, start: 10, end: 30, entrantIds: new Set(["A"]) },
      { index: 1, start: NaN, end: 30, entrantIds: new Set(["A"]) },
    ];
    const original = structuredClone(input);
    expect(schedulingConflictPairs(input, 0).size).toBe(0);
    expect(input).toEqual(original);
    expect(() => schedulingConflictPairs(input, -1)).toThrow(
      "Invalid rest duration",
    );
  });

  it("retains overlap candidates for invalid finite durations so the caller can report both errors", () => {
    const input: ConflictInterval[] = [
      {
        index: 0,
        start: 0,
        end: 100,
        resourceId: "court",
        entrantIds: new Set(),
      },
      {
        index: 1,
        start: 20,
        end: 10,
        resourceId: "court",
        entrantIds: new Set(),
      },
      {
        index: 2,
        start: 20,
        end: -5,
        resourceId: "court",
        entrantIds: new Set(),
      },
    ];
    expect(schedulingConflictPairs(input, 0)).toEqual(bruteForce(input, 0));
  });
});
