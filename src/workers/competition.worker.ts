import type { CompetitionTask } from "./competition-task";

self.addEventListener(
  "message",
  async (event: MessageEvent<CompetitionTask>) => {
    try {
      const { generateStage, advanceStage, simulate } =
        await import("../engine");
      const task = event.data;
      const value =
        task.kind === "simulate"
          ? simulate(task.tournament)
          : task.kind === "draw"
            ? generateStage(task.tournament, task.stageId)
            : advanceStage(task.tournament, task.stageId);
      self.postMessage({ ok: true, value });
    } catch (error) {
      self.postMessage({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
