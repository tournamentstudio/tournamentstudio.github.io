import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("../vendor/bbp/dutch.js"));

it("requires preparation without loading the solver for ordinary engine imports", async () => {
  const loaded = vi.fn();
  const call = vi.fn(() => "OK\n1 2\n");
  vi.doMock("../vendor/bbp/dutch.js", () => {
    loaded();
    return { default: () => ({ ccall: call }) };
  });
  const { pairFideTrf, prepareDutchEngine } = await import("./fide-runtime");
  expect(loaded).not.toHaveBeenCalled();
  expect(() => pairFideTrf("012")).toThrow("Load the Dutch pairing engine");
  expect(loaded).not.toHaveBeenCalled();
  await Promise.all([prepareDutchEngine(), prepareDutchEngine()]);
  expect(loaded).toHaveBeenCalledOnce();
  expect(pairFideTrf("012")).toEqual([[1, 2]]);
});

it("discards a failed solver instance so a later valid pairing can recover", async () => {
  const call = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error("Test solver failure");
    })
    .mockReturnValue("OK\n1 2\n");
  const create = vi.fn(() => ({ ccall: call }));
  vi.doMock("../vendor/bbp/dutch.js", () => ({ default: create }));
  const { pairFideTrf, prepareDutchEngine } = await import("./fide-runtime");
  await prepareDutchEngine();
  expect(() => pairFideTrf("012")).toThrow("memory or computation limit");
  expect(pairFideTrf("012")).toEqual([[1, 2]]);
  expect(create).toHaveBeenCalledTimes(2);
});
