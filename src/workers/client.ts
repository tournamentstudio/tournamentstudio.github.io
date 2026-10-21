import type { DrawTask, DrawTaskResults } from "./draw-task";

export class WorkerUnavailableError extends Error {
  constructor() {
    super(
      "Background computation is unavailable in this browser. You can explicitly run the bounded preview locally.",
    );
    this.name = "WorkerUnavailableError";
  }
}
export const BACKGROUND_TIMEOUT_MS = 60000;

/** Each request owns one worker; cancellation terminates its computation. */
export function runDrawTask<K extends DrawTask["kind"]>(
  task: Extract<DrawTask, { kind: K }>,
  signal?: AbortSignal,
): Promise<DrawTaskResults[K]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Preview canceled", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(new WorkerUnavailableError());
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./draw.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(new WorkerUnavailableError());
      return;
    }
    let settled = false;
    const finish = (
      result: { value: DrawTaskResults[K] } | { error: unknown },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const cancel = () =>
      finish({ error: new DOMException("Preview canceled", "AbortError") });
    const timer = setTimeout(
      () =>
        finish({
          error: new Error(
            "The background preview reached its time limit. Feasibility remains unknown. Reduce the field or restrictions and try again.",
          ),
        }),
      BACKGROUND_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        value: DrawTaskResults[K];
        message?: string;
      }>,
    ) => {
      if (event.data.ok) finish({ value: event.data.value });
      else
        finish({
          error: new Error(
            event.data.message ?? "The background preview failed.",
          ),
        });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish({ error: new WorkerUnavailableError() });
    };
    worker.onmessageerror = () =>
      finish({
        error: new Error("The background preview returned unreadable data."),
      });
    try {
      worker.postMessage(task);
    } catch (error) {
      finish({ error });
    }
  });
}
