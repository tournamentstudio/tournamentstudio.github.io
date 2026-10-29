import type { CompetitionTask } from "./competition-task";
import { requiresCompetitionWorker } from "./competition-task";

self.addEventListener(
  "message",
  async (event: MessageEvent<CompetitionTask>) => {
    try {
      const task = event.data;
      if (
        requiresCompetitionWorker(
          task.tournament,
          task.kind === "simulate" ? undefined : task.stageId,
        )
      ) {
        const { prepareDutchEngine } = await import("../engine/fide-runtime");
        await prepareDutchEngine();
      }
      const { generateStage, advanceStage, simulate } =
        await import("../engine");
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
