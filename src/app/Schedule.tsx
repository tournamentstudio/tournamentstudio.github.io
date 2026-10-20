import { useState } from "react";
import {
  CalendarDays,
  Plus,
  Trash2,
  Download,
  WandSparkles,
} from "lucide-react";
import { uid } from "../domain/types";
import { autoSchedule, detectConflicts, estimateDuration } from "../scheduling";
import { exportCalendar, exportCSV } from "../export";
import { Field, Notice, ErrorText } from "../components/ui";
import { useI18n } from "../i18n";
import type { EditorProps } from "./Participants";

export function Schedule({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState(structuredClone(doc.schedule));
  const [error, setError] = useState<unknown>();
  const conflicts = detectConflicts(doc);
  const estimate = estimateDuration({ ...doc, schedule: settings });
  function generate() {
    try {
      onChange(
        autoSchedule({ ...doc, schedule: settings }),
        t("Schedule matches", "زمان‌بندی دیدارها"),
      );
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>
            {t("A place and time for every match", "زمان و مکان هر دیدار")}
          </h2>
          <p>
            {t(
              "Schedule around resources, dependencies, and rest periods.",
              "زمان‌بندی با توجه به منابع، وابستگی‌ها و استراحت.",
            )}
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => exportCSV(doc, "matches", locale)}
          >
            <Download size={15} />
            CSV
          </button>
          <button
            className="button secondary"
            onClick={() => exportCalendar(doc, locale)}
          >
            <CalendarDays size={16} />
            {t("Calendar file", "فایل تقویم")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      <div className="schedule-layout">
        <aside className="panel">
          <h3>{t("Schedule setup", "تنظیم برنامه")}</h3>
          <Field
            label={t(
              "Start time (device timezone)",
              "زمان شروع (منطقه زمانی دستگاه)",
            )}
          >
            <input
              type="datetime-local"
              value={settings.startAt.slice(0, 16)}
              onChange={(e) =>
                setSettings({ ...settings, startAt: e.target.value })
              }
            />
          </Field>
          <div className="two-columns">
            <Field label={t("Match minutes", "دقایق دیدار")}>
              <input
                type="number"
                min={1}
                max={1440}
                value={settings.matchMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    matchMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label={t("Rest minutes", "دقایق استراحت")}>
              <input
                type="number"
                min={0}
                max={1440}
                value={settings.restMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    restMinutes: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="section-heading">
            <h4>
              {t("Courts, tables, or rooms", "زمین‌ها، میزها یا اتاق‌ها")}
            </h4>
            <button
              className="icon-button"
              title={t("Add resource", "افزودن منبع")}
              onClick={() =>
                setSettings({
                  ...settings,
                  resources: [
                    ...settings.resources,
                    {
                      id: uid(),
                      name: `${t("Court", "زمین")} ${settings.resources.length + 1}`,
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
            </button>
          </div>
          {settings.resources.map((r) => (
            <div className="resource-edit" key={r.id}>
              <input
                aria-label={t("Resource name", "نام منبع")}
                value={r.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    resources: settings.resources.map((x) =>
                      x.id === r.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="icon-button"
                aria-label={t("Remove resource", "حذف منبع")}
                onClick={() =>
                  setSettings({
                    ...settings,
                    resources: settings.resources.filter((x) => x.id !== r.id),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
              <details>
                <summary>{t("Availability", "دسترسی")}</summary>
                <Field label={t("Available from", "در دسترس از")}>
                  <input
                    type="datetime-local"
                    value={r.availableFrom ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        resources: settings.resources.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                availableFrom: e.target.value || undefined,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={t("Available until", "در دسترس تا")}>
                  <input
                    type="datetime-local"
                    value={r.availableUntil ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        resources: settings.resources.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                availableUntil: e.target.value || undefined,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
              </details>
            </div>
          ))}
          <button className="button primary full-width" onClick={generate}>
            <WandSparkles size={16} />
            {t("Generate schedule", "ساخت برنامه")}
          </button>
          <p className="muted">
            {t(
              "Unknown future opponents are reserved conservatively. The estimate excludes delays and cannot predict future dynamic rounds.",
              "برای حریفان آینده زمان با احتیاط رزرو می‌شود. برآورد شامل تأخیر یا دورهای پویای آینده نیست.",
            )}
          </p>
          <dl className="estimate-details">
            <div>
              <dt>{t("Generated matches", "دیدارهای ساخته شده")}</dt>
              <dd>{estimate.matches.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("Playing resources", "منابع بازی")}</dt>
              <dd>{estimate.resources.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("Minimum playing time", "حداقل زمان بازی")}</dt>
              <dd>
                {estimate.minimumMinutes.toLocaleString(locale)}{" "}
                {t("minutes", "دقیقه")}
              </dd>
            </div>
            {estimate.scheduledMinutes !== undefined && (
              <div>
                <dt>{t("Saved schedule span", "مدت برنامه ذخیره شده")}</dt>
                <dd>
                  {estimate.scheduledMinutes.toLocaleString(locale)}{" "}
                  {t("minutes", "دقیقه")}
                </dd>
              </div>
            )}
          </dl>
          <p className="muted">
            {t(
              "The minimum divides total playing time by available resources. Rest and qualification dependencies can extend it.",
              "حداقل زمان از تقسیم زمان بازی بر منابع محاسبه می‌شود. استراحت و وابستگی صعود می‌توانند آن را افزایش دهند.",
            )}
          </p>
        </aside>
        <div>
          {conflicts.length > 0 ? (
            <Notice danger>
              <b>{t("Schedule conflicts", "تعارض برنامه")}</b>
              <ul>
                {conflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </Notice>
          ) : (
            <Notice>
              {t(
                "No conflicts detected in the saved schedule.",
                "در برنامه ذخیره شده تعارضی یافت نشد.",
              )}
            </Notice>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Match", "دیدار")}</th>
                  <th>{t("Start", "شروع")}</th>
                  <th>{t("Resource", "منبع")}</th>
                  <th>{t("Referee", "داور")}</th>
                </tr>
              </thead>
              <tbody>
                {[...doc.matches]
                  .filter((m) => m.status !== "bye" && m.status !== "canceled")
                  .sort((a, b) =>
                    (a.scheduledAt ?? "z").localeCompare(b.scheduledAt ?? "z"),
                  )
                  .map((m) => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.label}</b>
                        <small className="table-subline">
                          {m.slots
                            .map(
                              (s) =>
                                doc.participants.find(
                                  (p) => p.id === s.participantId,
                                )?.name ?? t("TBD", "نامشخص"),
                            )
                            .join(" / ")}
                        </small>
                      </td>
                      <td>
                        <input
                          type="datetime-local"
                          aria-label={`${t("Start", "شروع")} ${m.label}`}
                          value={
                            m.scheduledAt
                              ? new Date(
                                  new Date(m.scheduledAt).getTime() -
                                    new Date(
                                      m.scheduledAt,
                                    ).getTimezoneOffset() *
                                      60000,
                                )
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          onChange={(e) => {
                            const next = structuredClone(doc);
                            next.matches.find(
                              (x) => x.id === m.id,
                            )!.scheduledAt = e.target.value
                              ? new Date(e.target.value).toISOString()
                              : undefined;
                            onChange(
                              next,
                              t("Reschedule match", "زمان‌بندی دوباره دیدار"),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${t("Resource", "منبع")} ${m.label}`}
                          value={m.resourceId ?? ""}
                          onChange={(e) => {
                            const next = structuredClone(doc);
                            next.matches.find(
                              (x) => x.id === m.id,
                            )!.resourceId = e.target.value || undefined;
                            onChange(next, t("Assign resource", "تخصیص منبع"));
                          }}
                        >
                          <option value="">
                            {t("Unassigned", "تعیین نشده")}
                          </option>
                          {doc.schedule.resources.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`${t("Referee", "داور")} ${m.label}`}
                          defaultValue={m.referee ?? ""}
                          onBlur={(e) => {
                            if (e.target.value === (m.referee ?? "")) return;
                            const next = structuredClone(doc);
                            next.matches.find((x) => x.id === m.id)!.referee =
                              e.target.value;
                            onChange(next, t("Assign referee", "تعیین داور"));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
