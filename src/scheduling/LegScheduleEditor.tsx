import { useState } from "react";
import type { EditorProps } from "../app/Participants";
import type { LegSchedule } from "../domain/aggregate";
import { useI18n, generatedMatchLabel } from "../i18n";
import { ErrorText, Field, Notice } from "../components/ui";
import { bookAggregateLegs } from "./leg-adjustments";
import type { SchedulePreview } from "./adjustments";
const local = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
};
export function LegScheduleEditor({ tournament, onChange }: EditorProps) {
  const { t, locale, number } = useI18n();
  const matches = tournament.matches.filter(
    (m) =>
      tournament.stages.find((s) => s.id === m.stageId)?.config.aggregate &&
      !["bye", "canceled"].includes(m.status),
  );
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<LegSchedule>([]);
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<SchedulePreview>();
  const [error, setError] = useState<unknown>();
  const match = matches.find((m) => m.id === selected);
  const policy = tournament.stages.find((s) => s.id === match?.stageId)?.config
    .aggregate;
  if (!matches.length) return null;
  const patch = (index: number, value: Partial<LegSchedule[number]>) => {
    setDraft(draft.map((b, i) => (i === index ? { ...b, ...value } : b)));
    setPreview(undefined);
  };
  return (
    <details className="panel aggregate-leg-editor">
      <summary>
        {t("Aggregate leg bookings", "زمان‌بندی بازی‌های رفت‌وبرگشت")}
      </summary>
      <p>
        {t(
          "Each leg has its own time, venue and duration. Later ties wait for the final leg and rest period. An extra leg booking is provisional until a tied result requires it.",
          "هر بازی زمان، محل و مدت جداگانه دارد. دیدار بعدی پس از آخرین بازی و زمان استراحت شروع می‌شود. رزرو بازی اضافه تا زمان تساوی نتیجه، موقت است.",
        )}
      </p>
      <Field label={t("Aggregate tie", "دیدار رفت‌وبرگشت")}>
        <select
          value={selected}
          onChange={(e) => {
            const m = matches.find((m) => m.id === e.target.value);
            setSelected(e.target.value);
            setPreview(undefined);
            setError(undefined);
            setRevision(tournament.revision);
            const p = tournament.stages.find((s) => s.id === m?.stageId)?.config
              .aggregate;
            setDraft(
              m && p
                ? Array.from(
                    { length: Math.max(p.legs, m.legSchedule?.length ?? 0) },
                    (_, i) =>
                      m.legSchedule?.find((b) => b.leg === i + 1) ?? {
                        leg: i + 1,
                        scheduledAt: "",
                        resourceId:
                          m.resourceId ?? tournament.schedule.resources[0]?.id,
                        durationMinutes:
                          m.durationMinutes ?? tournament.schedule.matchMinutes,
                      },
                  )
                : [],
            );
          }}
        >
          <option value="">{t("Select a tie", "دیدار را انتخاب کنید")}</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {generatedMatchLabel(m, locale)}
            </option>
          ))}
        </select>
      </Field>
      {match && (
        <>
          {policy &&
            draft.length > policy.legs &&
            !match.aggregateProgress?.[policy.legs] &&
            !match.result && (
              <button
                className="button"
                onClick={() => {
                  setDraft(draft.slice(0, policy.legs));
                  setPreview(undefined);
                }}
              >
                {t("Cancel provisional extra leg", "لغو رزرو بازی اضافه")}
              </button>
            )}
          {draft.map((b, i) => (
            <fieldset key={b.leg}>
              <legend>
                {t("Leg", "بازی")} {number(b.leg)}
              </legend>
              <div className="field-grid">
                <Field
                  label={`${t("Leg start", "شروع بازی")} ${number(b.leg)}`}
                >
                  <input
                    type="datetime-local"
                    value={local(b.scheduledAt)}
                    onChange={(e) =>
                      patch(i, {
                        scheduledAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      })
                    }
                  />
                </Field>
                <Field label={`${t("Leg venue", "محل بازی")} ${number(b.leg)}`}>
                  <select
                    value={b.resourceId ?? ""}
                    onChange={(e) => patch(i, { resourceId: e.target.value })}
                  >
                    {tournament.schedule.resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={`${t("Leg minutes", "دقیقه بازی")} ${number(b.leg)}`}
                >
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={
                      b.durationMinutes ?? tournament.schedule.matchMinutes
                    }
                    onChange={(e) =>
                      patch(i, { durationMinutes: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
            </fieldset>
          ))}
          {policy?.tieBreak === "extra-leg" && draft.length === policy.legs && (
            <button
              className="button"
              onClick={() => {
                setDraft([
                  ...draft,
                  {
                    leg: draft.length + 1,
                    scheduledAt: "",
                    resourceId: draft.at(-1)?.resourceId,
                    durationMinutes: tournament.schedule.matchMinutes,
                  },
                ]);
                setPreview(undefined);
              }}
            >
              {t("Reserve an extra leg", "رزرو بازی اضافه")}
            </button>
          )}
          <button
            className="button primary"
            disabled={
              !!match.result ||
              match.status === "live" ||
              revision !== tournament.revision
            }
            onClick={() => {
              try {
                setPreview(bookAggregateLegs(tournament, selected, draft));
                setError(undefined);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t("Review leg bookings", "بررسی زمان‌بندی بازی‌ها")}
          </button>
          {revision !== tournament.revision && (
            <Notice>
              {t(
                "The tournament changed. Select the tie again to review current bookings.",
                "مسابقات تغییر کرد. دیدار را دوباره انتخاب کنید تا رزروهای تازه را ببینید.",
              )}
            </Notice>
          )}
          {preview && (
            <div
              role="region"
              aria-label={t("Leg booking review", "بررسی رزرو بازی‌ها")}
            >
              <p>
                {t(
                  "Review the times above before saving. Existing scores stay unchanged.",
                  "پیش از ذخیره، زمان‌های بالا را بررسی کنید. امتیازهای ثبت‌شده حفظ می‌شوند.",
                )}
              </p>
              <ErrorText
                error={
                  preview.conflicts.length
                    ? preview.conflicts.join("\n")
                    : undefined
                }
              />
              <button
                className="button primary"
                disabled={
                  preview.conflicts.length > 0 ||
                  revision !== tournament.revision ||
                  !preview.changes.length
                }
                onClick={() => {
                  onChange(
                    preview.tournament,
                    t("Book aggregate legs", "زمان‌بندی رفت‌وبرگشت"),
                  );
                  setPreview(undefined);
                  setSelected("");
                }}
              >
                {t("Save leg bookings", "ذخیره زمان‌بندی بازی‌ها")}
              </button>
            </div>
          )}
        </>
      )}
      <ErrorText error={error} />
    </details>
  );
}
