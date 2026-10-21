import { useEffect, useRef, useState } from "react";
import type { Tournament } from "../domain/types";
import { useI18n } from "../i18n";
import { ErrorText, Notice } from "../components/ui";
import type { CompetitionTask } from "./competition-task";
import {
  CompetitionWorkerError,
  runCompetitionTask,
} from "./competition-client";

export function useCompetitionTask(
  document: Tournament | undefined,
  scope: unknown,
) {
  const { t } = useI18n();
  const [state, setState] = useState<{
    document: Tournament | undefined;
    scope: unknown;
    busy: boolean;
    error?: unknown;
  }>();
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ document, scope });
  latest.current = { document, scope };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [document, scope],
  );
  const current =
    state?.document === document && state?.scope === scope ? state : undefined;
  function cancel() {
    active.current?.abort();
    active.current = null;
    setState(undefined);
  }
  async function run(task: CompetitionTask): Promise<Tournament | undefined> {
    if (
      !mounted.current ||
      latest.current.document !== document ||
      latest.current.scope !== scope
    )
      return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ document, scope, busy: true });
    const valid = () =>
      mounted.current &&
      active.current === controller &&
      !controller.signal.aborted &&
      latest.current.document === document &&
      latest.current.scope === scope;
    try {
      const result = await runCompetitionTask(task, controller.signal);
      if (!valid()) return;
      setState({ document, scope, busy: false });
      return result;
    } catch (error) {
      if (!valid()) return;
      const message =
        error instanceof CompetitionWorkerError
          ? error.code === "unavailable"
            ? t(
                "Background computation is unavailable. Enable browser workers and try again. No results were changed.",
                "محاسبه در پس‌زمینه در دسترس نیست. پردازشگرهای مرورگر را فعال و دوباره تلاش کنید. هیچ نتیجه‌ای تغییر نکرد.",
              )
            : error.code === "timeout"
              ? t(
                  "The competition calculation reached its three-minute limit. Reduce the field or simulate fewer rounds and try again. No results were changed.",
                  "محاسبه مسابقات به محدودیت سه دقیقه رسید. تعداد شرکت‌کنندگان یا دورهای شبیه‌سازی را کم و دوباره تلاش کنید. هیچ نتیجه‌ای تغییر نکرد.",
                )
              : t(
                  "The background computation returned unreadable data. Try again. No results were changed.",
                  "محاسبه پس‌زمینه داده ناخوانا برگرداند. دوباره تلاش کنید. هیچ نتیجه‌ای تغییر نکرد.",
                )
          : error;
      setState({ document, scope, busy: false, error: message });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }
  return { busy: current?.busy ?? false, error: current?.error, run, cancel };
}

export function CompetitionTaskNotice({
  task,
}: {
  task: ReturnType<typeof useCompetitionTask>;
}) {
  const { t } = useI18n();
  return (
    <>
      <ErrorText error={task.error} />
      {task.busy && (
        <Notice>
          <p role="status" aria-atomic="true">
            {t(
              "Computing the competition in the background. Canceling keeps your saved results unchanged.",
              "مسابقات در پس‌زمینه محاسبه می‌شود. لغو، نتایج ذخیره‌شده را تغییر نمی‌دهد.",
            )}
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={task.cancel}
          >
            {t("Cancel computation", "لغو محاسبه")}
          </button>
        </Notice>
      )}
    </>
  );
}
