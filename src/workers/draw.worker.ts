import { performDrawTask, type DrawTask } from "./draw-task";

self.addEventListener("message", (event: MessageEvent<DrawTask>) => {
  try {
    const value = performDrawTask(event.data);
    self.postMessage({ ok: true, value });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
