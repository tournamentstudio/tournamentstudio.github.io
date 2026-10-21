import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { pageWindow, PAGE_SIZES } from "./list-pages";

describe("bounded list windows", () => {
  it("covers all 512 entrants without omitted or duplicated positions", () => {
    const positions: number[] = [];
    for (let page = 0; page < 11; page++) {
      const window = pageWindow(512, page);
      positions.push(
        ...Array.from(
          { length: window.end - window.start },
          (_, index) => window.start + index,
        ),
      );
    }
    expect(positions).toEqual(Array.from({ length: 512 }, (_, index) => index));
    expect(pageWindow(512, 10)).toMatchObject({
      start: 500,
      end: 512,
      pages: 11,
    });
  });

  it("clamps after deletion, empty filtering, and invalid page input", () => {
    expect(pageWindow(49, 10)).toMatchObject({ page: 0, start: 0, end: 49 });
    expect(pageWindow(0, 8)).toMatchObject({
      page: 0,
      pages: 1,
      start: 0,
      end: 0,
    });
    expect(pageWindow(512, -2).page).toBe(0);
    expect(pageWindow(512, NaN).page).toBe(0);
    expect(() => pageWindow(-1, 0)).toThrow("Invalid item count");
  });

  it("never renders beyond its configured bound or outside the collection", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: -100, max: 20000 }),
        fc.constantFrom(...PAGE_SIZES),
        (total, page, size) => {
          const window = pageWindow(total, page, size);
          expect(window.end - window.start).toBeLessThanOrEqual(size);
          expect(window.start).toBeGreaterThanOrEqual(0);
          expect(window.end).toBeLessThanOrEqual(total);
          expect(window.page).toBeLessThan(window.pages);
        },
      ),
    );
  });
});
