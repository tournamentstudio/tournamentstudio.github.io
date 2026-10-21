import type { Tournament } from "../domain/types";
import type { CompetitionTask } from "./competition-task";

export class CompetitionWorkerError extends Error {
  constructor(public code: "unavailable" | "timeout" | "transport") {
    super(code);
    this.name = "CompetitionWorkerError";
  }
}
export const COMPETITION_TIMEOUT_MS = 180000;

export function runCompetitionTask(
  task: CompetitionTask,
  signal?: AbortSignal,
): Promise<Tournament> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new DOMException("Competition calculation canceled", "AbortError"),
      );
      return;
    }
    let worker: Worker;
    try {
      if (typeof Worker === "undefined") throw new Error("Worker unavailable");
      worker = new Worker(new URL("./competition.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(new CompetitionWorkerError("unavailable"));
      return;
    }
    let settled = false;
    const finish = (result: { value: Tournament } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const cancel = () =>
      finish({
        error: new DOMException(
          "Competition calculation canceled",
          "AbortError",
        ),
      });
    const timer = setTimeout(
      () => finish({ error: new CompetitionWorkerError("timeout") }),
      COMPETITION_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        value?: Tournament;
        message?: string;
      }>,
    ) => {
      if (!event.data || typeof event.data.ok !== "boolean")
        finish({ error: new CompetitionWorkerError("transport") });
      else if (event.data.ok && event.data.value?.id === task.tournament.id)
        finish({ value: event.data.value });
      else if (event.data.ok)
        finish({ error: new CompetitionWorkerError("transport") });
      else if (typeof event.data.message === "string")
        finish({
          error: new Error(event.data.message),
        });
      else finish({ error: new CompetitionWorkerError("transport") });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish({ error: new CompetitionWorkerError("unavailable") });
    };
    worker.onmessageerror = () =>
      finish({ error: new CompetitionWorkerError("transport") });
    try {
      worker.postMessage(task);
    } catch {
      finish({ error: new CompetitionWorkerError("transport") });
    }
  });
}
