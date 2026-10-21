import { useEffect, useState } from "react";
import type { Match, Tournament, JsonValue } from "../domain/types";
import { Field, ErrorText, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  elapsedTime,
  newRun,
  runSchema,
  timingSchema,
  updateRun,
  type TimedRun,
} from "./model";
export function RunTimer({
  tournament,
  match,
  onChange,
  onScores,
}: {
  tournament: Tournament;
  match: Match;
  onChange: (t: Tournament, action: string) => void;
  onScores: (scores: number[]) => void;
}) {
  const { t, number } = useI18n();
  const [selected, setSelected] = useState(match.slots[0]?.participantId ?? "");
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState<unknown>();
  const [label, setLabel] = useState("");
  const runs = timingSchema.parse(match.metadata.timing ?? {});
  const run = runs[selected] ?? newRun();
  useEffect(() => {
    if (run.startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [run.startedAt]);
  function save(value: TimedRun) {
    try {
      const doc = structuredClone(tournament);
      doc.matches.find((m) => m.id === match.id)!.metadata.timing = JSON.parse(
        JSON.stringify({ ...runs, [selected]: runSchema.parse(value) }),
      ) as JsonValue;
      onChange(doc, t("Save run timer", "ذخیره تایمر اجرا"));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <details className="panel inset-panel">
      <summary>
        {t("Run timer, splits and evidence", "تایمر اجرا، بخش‌ها و مدرک")}
      </summary>
      <Notice>
        {t(
          "This device clock is a manual timing aid, not certified timing. Split records and evidence stay in private packages. Accepting evidence is your ruling, not an automated video or game check. Score entry remains a separate confirmed action.",
          "ساعت این دستگاه ابزار زمان‌گیری دستی است و تأیید رسمی ندارد. بخش‌ها و مدرک فقط در بسته خصوصی می‌مانند. پذیرش مدرک رأی شماست و بررسی خودکار ویدیو یا بازی نیست. ثبت امتیاز جداگانه تأیید می‌شود.",
        )}
      </Notice>
      <ErrorText error={error} />
      <Field label={t("Timed entrant", "شرکت‌کننده زمان‌گیری")}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {match.slots
            .filter((s) => s.participantId)
            .map((s) => (
              <option key={s.participantId} value={s.participantId}>
                {
                  tournament.participants.find((p) => p.id === s.participantId)
                    ?.name
                }
              </option>
            ))}
        </select>
      </Field>
      <output
        className="timer-value"
        aria-label={t("Elapsed run seconds", "ثانیه سپری‌شده اجرا")}
      >
        {number(Math.round(elapsedTime(run, now)) / 1000)}
      </output>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={run.startedAt !== null || !!match.result}
          onClick={() => {
            setNow(Date.now());
            save(updateRun(run, "start"));
          }}
        >
          {t("Start run", "شروع اجرا")}
        </button>
        <button
          className="button secondary"
          disabled={run.startedAt === null || !!match.result}
          onClick={() => save(updateRun(run, "pause"))}
        >
          {t("Pause run", "توقف اجرا")}
        </button>
      </div>
      <Field label={t("Split label", "نام بخش")}>
        <input
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <button
        className="button secondary"
        disabled={
          run.startedAt === null || run.splits.length >= 256 || !!match.result
        }
        onClick={() => {
          try {
            save(
              updateRun(
                run,
                "split",
                Date.now(),
                label.trim() || `${t("Split", "بخش")} ${run.splits.length + 1}`,
              ),
            );
            setLabel("");
          } catch (e) {
            setError(e);
          }
        }}
      >
        {t("Record split", "ثبت بخش")}
      </button>
      <ol>
        {run.splits.map((s, i) => (
          <li key={i}>
            <bdi>{s.label}</bdi>: {number(s.elapsedMs / 1000)} (
            {number((s.elapsedMs - (run.splits[i - 1]?.elapsedMs ?? 0)) / 1000)}
            )
          </li>
        ))}
      </ol>
      <Field label={t("Correct elapsed seconds", "اصلاح ثانیه سپری‌شده")}>
        <input
          key={`${selected}-${run.elapsedMs}`}
          type="number"
          min={0}
          max={604800}
          step={0.001}
          disabled={run.startedAt !== null || !!match.result}
          defaultValue={run.elapsedMs / 1000}
          onBlur={(e) => {
            const elapsedMs = Math.round(Number(e.target.value) * 1000);
            if (elapsedMs !== run.elapsedMs)
              save({ ...run, elapsedMs, review: "pending" });
          }}
        />
      </Field>
      <Field label={t("Evidence URL (private)", "نشانی مدرک (خصوصی)")}>
        <input
          key={selected}
          type="url"
          maxLength={2000}
          defaultValue={run.evidence}
          onBlur={(e) => {
            if (e.target.value !== run.evidence)
              save({ ...run, evidence: e.target.value, review: "pending" });
          }}
        />
      </Field>
      {run.evidence && (
        <a href={run.evidence} target="_blank" rel="noopener noreferrer">
          {t("Open evidence in a separate tab", "بازکردن مدرک در زبانه جدا")}
        </a>
      )}
      <Field
        label={t("Organizer evidence ruling", "رأی برگزارکننده درباره مدرک")}
      >
        <select
          value={run.review}
          onChange={(e) =>
            save({ ...run, review: e.target.value as TimedRun["review"] })
          }
        >
          <option value="pending">
            {t("Awaiting review", "در انتظار بررسی")}
          </option>
          <option value="accepted">
            {t("Accepted by organizer", "پذیرفته توسط برگزارکننده")}
          </option>
          <option value="rejected">
            {t("Rejected by organizer", "ردشده توسط برگزارکننده")}
          </option>
        </select>
      </Field>
      <button
        className="button secondary"
        disabled={
          !!match.result ||
          match.slots.some(
            (s) =>
              !s.participantId ||
              !runs[s.participantId] ||
              runs[s.participantId].startedAt !== null ||
              runs[s.participantId].review !== "accepted",
          )
        }
        onClick={() =>
          onScores(
            match.slots.map((s) => runs[s.participantId!].elapsedMs / 1000),
          )
        }
      >
        {t(
          "Copy accepted times to score form",
          "کپی زمان‌های پذیرفته به فرم امتیاز",
        )}
      </button>
    </details>
  );
}
