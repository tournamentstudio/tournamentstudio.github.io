import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorProps } from "../app/Participants";
import { Field, ErrorText, Modal, Notice } from "../components/ui";
import { useI18n, generatedMatchLabel, localizedDiagnostic } from "../i18n";
import {
  moveScheduledMatch,
  compareSchedules,
  propagateDelay,
  type SchedulePreview,
} from "./adjustments";
import "./timeline.css";
import { scheduleOccurrences } from "./legs";
import { optimizeSchedule } from "./optimize";

const localInput = (value: string) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
};
export function ScheduleTimeline({ tournament, onChange }: EditorProps) {
  const { t, locale, number } = useI18n();
  const date = (value: string) =>
    new Date(value).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  const matches = useMemo(
    () =>
      scheduleOccurrences({ ...tournament, locale }).filter(
        (m) => m.scheduledAt && !["bye", "canceled"].includes(m.status),
      ),
    [tournament, locale],
  );
  const [selected, setSelected] = useState("");
  const [day, setDay] = useState(() =>
    localInput(matches[0]?.scheduledAt ?? tournament.schedule.startAt).slice(
      0,
      10,
    ),
  );
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState(
    tournament.schedule.resources[0]?.id ?? "",
  );
  const [delay, setDelay] = useState(10);
  const [extend, setExtend] = useState(false);
  const [preview, setPreview] = useState<{
    result: SchedulePreview;
    revision: number;
    proof?: {
      optimal: boolean;
      minutes: number;
      lowerBoundMinutes: number;
      explored: number;
    };
  }>();
  const [error, setError] = useState<unknown>();
  const start = Date.parse(`${day}T00:00`);
  const shown = matches.filter(
    (m) =>
      Date.parse(m.scheduledAt!) >= start &&
      Date.parse(m.scheduledAt!) < start + 24 * 60 * 60000,
  );
  const scroll = useRef<HTMLDivElement>(null);
  const firstStart = shown[0]?.scheduledAt;
  useEffect(() => {
    if (scroll.current && firstStart && Number.isFinite(start))
      scroll.current.scrollLeft = Math.max(
        0,
        ((Date.parse(firstStart) - start) / (30 * 60000)) * 80,
      );
  }, [firstStart, start]);
  const label = (id: string) => {
    const match =
      matches.find((m) => m.id === id) ??
      (preview
        ? scheduleOccurrences({ ...preview.result.tournament, locale }).find(
            (m) => m.id === id,
          )
        : undefined) ??
      tournament.matches.find((m) => m.id === id);
    return match ? generatedMatchLabel(match, locale) : id;
  };
  function move(id: string, at: string, resource: string) {
    try {
      setPreview({
        result: moveScheduledMatch(tournament, id, at, resource),
        revision: tournament.revision,
      });
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  function select(id: string) {
    const m = matches.find((m) => m.id === id);
    setSelected(id);
    setTime(m ? localInput(m.scheduledAt!) : "");
    setVenue(m?.resourceId ?? "");
    setExtend(m?.status === "live");
  }
  return (
    <details className="panel schedule-timeline">
      <summary>
        {t("Timeline and match delays", "خط زمان و تأخیر دیدارها")}
      </summary>
      <ErrorText error={error} />
      <p>
        {t(
          "Small-schedule search checks up to 10 matches and 4 venues before play starts. It uses the saved duration, availability, referee, rest and dependency rules. The search stops at 50,000 states; only an exhausted search or matched lower bound proves the minimum.",
          "جستجوی برنامه کوچک پیش از شروع بازی حداکثر ۱۰ دیدار و ۴ محل را بررسی می‌کند. مدت، دسترسی، داور، استراحت و وابستگی ذخیره‌شده رعایت می‌شود. جستجو در ۵۰٬۰۰۰ حالت متوقف می‌شود؛ فقط بررسی کامل یا رسیدن به کران پایین کمینه را اثبات می‌کند.",
        )}
      </p>
      <button
        className="button secondary"
        onClick={() => {
          try {
            const result = optimizeSchedule(tournament);
            setPreview({
              result: compareSchedules(tournament, result.tournament),
              revision: tournament.revision,
              proof: result,
            });
            setError(undefined);
          } catch (e) {
            setError(e);
          }
        }}
      >
        {t("Optimize small schedule", "بهینه‌سازی برنامه کوچک")}
      </button>
      <p>
        {t(
          "Drag an unplayed match onto a half-hour slot, or select a match and edit its time below. Every change opens a review. Delay propagation keeps the existing order and rest periods; it does not claim the shortest possible schedule.",
          "دیدار بازی‌نشده را روی بازه نیم‌ساعته بکشید یا انتخاب کنید و زمان آن را در زیر تغییر دهید. هر تغییر پیش‌نمایش دارد. انتشار تأخیر ترتیب موجود و استراحت را حفظ می‌کند و ادعای کوتاه‌ترین برنامه را ندارد.",
        )}
      </p>
      {!matches.length ? (
        <Notice>
          {t(
            "Generate a schedule before using the timeline.",
            "پیش از استفاده از خط زمان برنامه را بسازید.",
          )}
        </Notice>
      ) : (
        <>
          <Field
            label={t(
              "Timeline day (device timezone)",
              "روز خط زمان (منطقه زمانی دستگاه)",
            )}
          >
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </Field>
          <div
            className="timeline-scroll"
            ref={scroll}
            role="region"
            tabIndex={0}
            aria-label={t("Daily venue timeline", "خط زمان روزانه محل‌ها")}
          >
            <div className="timeline-grid" style={{ width: 48 * 80 + 120 }}>
              <div className="timeline-hour-row">
                <span />
                {Array.from({ length: 48 }, (_, i) => (
                  <span key={i}>
                    {number(Math.floor(i / 2))}:{i % 2 ? "30" : "00"}
                  </span>
                ))}
              </div>
              {tournament.schedule.resources.map((resource) => (
                <div className="timeline-resource-row" key={resource.id}>
                  <strong>
                    <bdi>{resource.name}</bdi>
                  </strong>
                  <div className="timeline-lane">
                    {Array.from({ length: 48 }, (_, i) => (
                      <button
                        className="timeline-slot"
                        key={i}
                        style={{ left: i * 80 }}
                        aria-label={`${resource.name} ${number(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`}
                        onClick={() => {
                          if (selected)
                            move(
                              selected,
                              new Date(start + i * 30 * 60000).toISOString(),
                              resource.id,
                            );
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData(
                            "application/x-tournastudio-match",
                          );
                          if (id)
                            move(
                              id,
                              new Date(start + i * 30 * 60000).toISOString(),
                              resource.id,
                            );
                        }}
                      />
                    ))}
                    {shown
                      .filter((m) => m.resourceId === resource.id)
                      .map((m) => (
                        <button
                          key={m.id}
                          className={`timeline-match ${selected === m.id ? "selected" : ""}`}
                          style={{
                            left:
                              ((Date.parse(m.scheduledAt!) - start) /
                                (30 * 60000)) *
                              80,
                            width: Math.max(
                              70,
                              ((m.durationMinutes ??
                                tournament.schedule.matchMinutes) /
                                30) *
                                80,
                            ),
                          }}
                          draggable={!m.result && m.status !== "live"}
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              "application/x-tournastudio-match",
                              m.id,
                            )
                          }
                          onClick={() => select(m.id)}
                          aria-pressed={selected === m.id}
                          title={label(m.id)}
                        >
                          <span className="timeline-match-title">
                            {label(m.id)}
                          </span>
                          <small>
                            {m.slots
                              .map(
                                (s) =>
                                  tournament.participants.find(
                                    (p) => p.id === s.participantId,
                                  )?.name,
                              )
                              .filter(Boolean)
                              .join(" / ")}
                          </small>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="event-grid">
            <Field label={t("Timeline match", "دیدار خط زمان")}>
              <select value={selected} onChange={(e) => select(e.target.value)}>
                <option value="">{t("Choose match", "انتخاب دیدار")}</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {label(m.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Proposed start", "شروع پیشنهادی")}>
              <input
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field label={t("Proposed venue", "محل پیشنهادی")}>
              <select value={venue} onChange={(e) => setVenue(e.target.value)}>
                {tournament.schedule.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="button secondary"
            disabled={!selected || !time || !venue}
            onClick={() => move(selected, time, venue)}
          >
            {t("Preview timeline move", "پیش‌نمایش جابه‌جایی خط زمان")}
          </button>
          <div className="event-grid">
            <Field label={t("Delay minutes", "دقایق تأخیر")}>
              <input
                type="number"
                min={1}
                max={1440}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={extend}
                onChange={(e) => setExtend(e.target.checked)}
              />
              {t(
                "Extend match duration instead of delaying start",
                "افزایش مدت دیدار به جای تأخیر شروع",
              )}
            </label>
          </div>
          <button
            className="button secondary"
            disabled={!selected}
            onClick={() => {
              try {
                setPreview({
                  result: propagateDelay(tournament, selected, delay, extend),
                  revision: tournament.revision,
                });
                setError(undefined);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t("Preview propagated delay", "پیش‌نمایش انتشار تأخیر")}
          </button>
        </>
      )}
      {preview && (
        <Modal
          title={t("Review schedule changes", "بررسی تغییرات برنامه")}
          onClose={() => setPreview(undefined)}
        >
          <p>
            {t("Affected matches", "دیدارهای تغییرکرده")}:{" "}
            {number(preview.result.changes.length)}
          </p>
          {preview.proof && (
            <Notice>
              <p>
                {preview.proof.optimal
                  ? t(
                      "Minimum schedule proven for these constraints",
                      "کمترین برنامه برای این محدودیت‌ها اثبات شد",
                    )
                  : t(
                      "Best schedule found; search limit reached",
                      "بهترین برنامه یافت‌شده؛ سقف جستجو رسید",
                    )}
              </p>
              <p>
                {t("Duration in minutes", "مدت به دقیقه")}:{" "}
                {number(preview.proof.minutes)} ·{" "}
                {t("Lower bound", "کران پایین")}:{" "}
                {number(preview.proof.lowerBoundMinutes)} ·{" "}
                {t("Explored states", "حالت‌های بررسی‌شده")}:{" "}
                {number(preview.proof.explored)}
              </p>
            </Notice>
          )}
          <ol>
            {preview.result.changes.slice(0, 100).map((c) => (
              <li key={c.matchId}>
                {label(c.matchId)}: {c.before ? date(c.before) : ""} →{" "}
                {c.after ? date(c.after) : t("Booking removed", "رزرو حذف شد")}
                <small className="table-subline">
                  {t("Venue", "محل")}:{" "}
                  {tournament.schedule.resources.find(
                    (r) => r.id === c.beforeResource,
                  )?.name ?? ""}{" "}
                  →{" "}
                  {tournament.schedule.resources.find(
                    (r) => r.id === c.afterResource,
                  )?.name ?? ""}
                  ; {t("Minutes", "دقیقه")}: {number(c.beforeMinutes ?? 0)} →{" "}
                  {number(c.afterMinutes ?? 0)}
                </small>
              </li>
            ))}
          </ol>
          {preview.result.changes.length > 100 && (
            <p>
              {t(
                "Only the first 100 changes are listed. The complete schedule will be saved.",
                "فقط ۱۰۰ تغییر اول نمایش داده شده است. کل برنامه ذخیره می‌شود.",
              )}
            </p>
          )}
          {preview.result.conflicts.length > 0 && (
            <Notice danger>
              <ul>
                {preview.result.conflicts.slice(0, 100).map((c, i) => (
                  <li key={i}>{localizedDiagnostic(c, locale)}</li>
                ))}
              </ul>
            </Notice>
          )}
          {preview.revision !== tournament.revision && (
            <Notice danger>
              {t(
                "The tournament changed. Close this review and preview again.",
                "مسابقات تغییر کرده است. این بررسی را ببندید و دوباره پیش‌نمایش بگیرید.",
              )}
            </Notice>
          )}
          <button
            className="button primary"
            disabled={
              preview.revision !== tournament.revision ||
              preview.result.conflicts.length > 0 ||
              preview.result.changes.length === 0
            }
            onClick={() => {
              onChange(
                preview.result.tournament,
                t(
                  "Apply reviewed schedule changes",
                  "اعمال تغییرات بررسی‌شده برنامه",
                ),
              );
              setPreview(undefined);
            }}
          >
            {t("Confirm schedule changes", "تأیید تغییرات برنامه")}
          </button>
        </Modal>
      )}
    </details>
  );
}
