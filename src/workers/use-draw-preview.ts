import { useEffect, useRef, useState } from "react";
import type { DrawTask, DrawTaskResults } from "./draw-task";
import { runDrawTask, WorkerUnavailableError } from "./client";

interface PreviewState<T> {
  key: string;
  busy: boolean;
  result?: T;
  error?: string;
  unavailable?: boolean;
}

/** Input changes and replacement requests invalidate pending results. */
export function useDrawPreview<K extends DrawTask["kind"]>(
  task: Extract<DrawTask, { kind: K }>,
  key: string,
) {
  const [state, setState] = useState<PreviewState<DrawTaskResults[K]>>();
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [key],
  );
  const current = state?.key === key ? state : undefined;
  const cancel = () => {
    active.current?.abort();
    active.current = null;
    setState(undefined);
  };
  const run = async (local = false) => {
    if (local && !current?.unavailable) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ key, busy: true });
    try {
      let result: DrawTaskResults[K];
      if (local) {
        const { performDrawTask } = await import("./draw-task");
        if (controller.signal.aborted) return;
        result = performDrawTask(task);
      } else {
        result = await runDrawTask(task, controller.signal);
      }
      if (active.current === controller && !controller.signal.aborted)
        setState({ key, busy: false, result });
    } catch (error) {
      if (active.current === controller && !controller.signal.aborted)
        setState({
          key,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
          unavailable: error instanceof WorkerUnavailableError,
        });
    } finally {
      if (active.current === controller) active.current = null;
    }
  };
  return {
    result: current?.result,
    stale: !!state && state.key !== key,
    busy: current?.busy ?? false,
    error: current?.error,
    canRunLocally: current?.unavailable ?? false,
    run,
    cancel,
  };
}
