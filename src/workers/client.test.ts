import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import {
  BACKGROUND_TIMEOUT_MS,
  runDrawTask,
  WorkerUnavailableError,
} from "./client";
import { performDrawTask } from "./draw-task";

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
  respond(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent);
  }
}

function task(count = 13) {
  const tournament = createTournament(
    "Worker draw",
    Array.from({ length: count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    "single-elimination",
  );
  return {
    kind: "knockout" as const,
    tournament,
    stageId: tournament.stages[0].id,
  };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("cancelable background draws", () => {
  it("dispatches a document copy and returns the engine result", async () => {
    const input = task();
    const expected = performDrawTask(input);
    const pending = runDrawTask(input);
    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(input);
    worker.respond({ ok: true, value: expected });
    expect(await pending).toEqual(expected);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates canceled computation and ignores a late reply", async () => {
    const controller = new AbortController();
    const pending = runDrawTask(task(), controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    FakeWorker.instances[0].respond({ ok: true, value: { status: "ready" } });
    await rejection;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("does not start an already canceled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runDrawTask(task(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("does not substitute success or synchronous work when workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(runDrawTask(task())).rejects.toBeInstanceOf(
      WorkerUnavailableError,
    );
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Blocked by policy");
        }
      },
    );
    await expect(runDrawTask(task())).rejects.toBeInstanceOf(
      WorkerUnavailableError,
    );
  });

  it("keeps timeout feasibility unknown and stops the worker", async () => {
    vi.useFakeTimers();
    const pending = runDrawTask(task());
    const rejection = expect(pending).rejects.toThrow(
      "Feasibility remains unknown",
    );
    await vi.advanceTimersByTimeAsync(BACKGROUND_TIMEOUT_MS);
    await rejection;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("preserves engine diagnostics and treats transport errors as failures", async () => {
    const pending = runDrawTask(task());
    FakeWorker.instances[0].respond({ ok: false, message: "Unknown stage" });
    await expect(pending).rejects.toThrow("Unknown stage");
    const unreadable = runDrawTask(task());
    FakeWorker.instances[1].onmessageerror?.();
    await expect(unreadable).rejects.toThrow("unreadable data");
    const unavailable = runDrawTask(task());
    FakeWorker.instances[2].onerror?.({
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent);
    await expect(unavailable).rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it("retains deterministic preview behavior for 512 entrants", () => {
    const input = task(512);
    const before = structuredClone(input.tournament);
    const first = performDrawTask(input);
    expect(performDrawTask(input)).toEqual(first);
    expect(input.tournament).toEqual(before);
  });
});
