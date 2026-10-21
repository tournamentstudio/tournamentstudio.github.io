import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import {
  COMPETITION_TIMEOUT_MS,
  runCompetitionTask,
} from "./competition-client";
import {
  requiresCompetitionWorker,
  type CompetitionTask,
} from "./competition-task";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function task(): CompetitionTask {
  const tournament = createTournament(
    "Background chess",
    [createParticipant("One", 1), createParticipant("Two", 2)],
    "swiss",
    "chess",
  );
  tournament.stages[0].config.swiss = {
    version: 1,
    colorPolicy: "balanced",
    allowLateEntrants: false,
    preferences: {},
    lateEntries: [],
    federation: {
      system: "fide-dutch-2026",
      engine: "bbp-6.0.0-ts1",
      initialColor: "white",
    },
  };
  return { kind: "draw", tournament, stageId: tournament.stages[0].id };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("competition worker transport", () => {
  it("isolates named Swiss operations without changing generic engine execution", () => {
    const input = task();
    expect(requiresCompetitionWorker(input.tournament)).toBe(true);
    expect(requiresCompetitionWorker(input.tournament, "other-stage")).toBe(
      false,
    );
    delete input.tournament.stages[0].config.swiss?.federation;
    expect(requiresCompetitionWorker(input.tournament)).toBe(false);
  });
  it("dispatches the selected operation and releases a successful worker", async () => {
    const input = task();
    const pending = runCompetitionTask(input);
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(input);
    FakeWorker.instances[0].respond({ ok: true, value: input.tournament });
    expect(await pending).toEqual(input.tournament);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("cancels computation and ignores replies arriving after termination", async () => {
    const controller = new AbortController(),
      input = task();
    const pending = runCompetitionTask(input, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    FakeWorker.instances[0].respond({ ok: true, value: input.tournament });
    await rejection;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("does not construct workers for already canceled requests", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCompetitionTask(task(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it("rejects unavailable workers without a synchronous fallback", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(runCompetitionTask(task())).rejects.toMatchObject({
      code: "unavailable",
    });
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Disabled");
        }
      },
    );
    await expect(runCompetitionTask(task())).rejects.toMatchObject({
      code: "unavailable",
    });
  });
  it("terminates computations at the documented time limit", async () => {
    vi.useFakeTimers();
    const pending = runCompetitionTask(task());
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(COMPETITION_TIMEOUT_MS);
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("preserves engine errors and rejects malformed, mismatched and unreadable messages", async () => {
    const engine = runCompetitionTask(task());
    FakeWorker.instances[0].respond({
      ok: false,
      message: "No valid pairing exists",
    });
    await expect(engine).rejects.toThrow("No valid pairing exists");
    for (const data of [
      null,
      { ok: true, value: { id: "other" } },
      { ok: false },
      {},
    ]) {
      const pending = runCompetitionTask(task());
      FakeWorker.instances.at(-1)!.respond(data);
      await expect(pending).rejects.toMatchObject({ code: "transport" });
    }
    const unreadable = runCompetitionTask(task());
    FakeWorker.instances.at(-1)!.onmessageerror?.();
    await expect(unreadable).rejects.toMatchObject({ code: "transport" });
    const unavailable = runCompetitionTask(task());
    FakeWorker.instances
      .at(-1)!
      .onerror?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    await expect(unavailable).rejects.toMatchObject({ code: "unavailable" });
  });
});
