import { useEffect, useId, useMemo, useState } from "react";
import type { Tournament } from "../domain/types";
import { Field, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";
import {
  listLegacyTimezoneFields,
  createLegacyWallTimeResolver,
  type LegacyTimezoneChoice,
  type LegacyTimezoneField,
  type LegacyWallTimeStatus,
} from "../sharing/legacy-timezones";
import "./legacy-timezone-review.css";

interface FieldEdit {
  selected: boolean;
  wallTime: string;
  timeZone: string;
  disambiguation?: "earlier" | "later";
}

export function LegacyTimezoneReview({
  tournament,
  onReview,
  disabled = false,
}: {
  tournament: Tournament;
  onReview: (choices: LegacyTimezoneChoice[] | undefined) => void;
  disabled?: boolean;
}) {
  const { t, locale, number } = useI18n();
  const id = useId();
  const fields = useMemo(
    () => listLegacyTimezoneFields(tournament),
    [tournament],
  );
  const resolveWallTime = useMemo(createLegacyWallTimeResolver, [tournament]);
  const [timeZone, setTimeZone] = useState(tournament.timezone);
  const [edits, setEdits] = useState<Record<string, FieldEdit>>({});
  const [page, setPage] = useState(0);
  const [reviewed, setReviewed] = useState<"original" | "corrected">();
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    setTimeZone(tournament.timezone);
    setEdits({});
    setPage(0);
    setReviewed(undefined);
    onReview(fields.length ? undefined : []);
  }, [tournament, fields, onReview]);

  const rows = useMemo(
    () =>
      fields.map((field) => {
        const edit = edits[field.id] ?? {
          selected: true,
          wallTime: field.value,
          timeZone: "",
        };
        const zone = (edit.timeZone || timeZone).trim();
        const resolution = resolveWallTime(edit.wallTime, zone);
        return { field, edit, zone, resolution };
      }),
    [fields, edits, timeZone, resolveWallTime],
  );
  const selected = rows.filter((row) => row.edit.selected);
  const unresolved = selected.filter(
    ({ resolution, edit }) =>
      resolution.status !== "unique" &&
      !(resolution.status === "ambiguous" && edit.disambiguation),
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));

  function invalidate() {
    setReviewed(undefined);
    onReview(undefined);
  }

  function editField(field: LegacyTimezoneField, patch: Partial<FieldEdit>) {
    invalidate();
    setEdits((current) => ({
      ...current,
      [field.id]: {
        ...(current[field.id] ?? {
          selected: true,
          wallTime: field.value,
          timeZone: "",
        }),
        ...patch,
      },
    }));
  }

  function fieldLabel(field: LegacyTimezoneField): string {
    if (field.kind === "schedule-start")
      return t("Tournament start", "شروع مسابقات");
    if (field.kind === "resource-from" || field.kind === "resource-until") {
      const resource = tournament.schedule.resources.find(
        (item) => item.id === field.resourceId,
      );
      return `${resource?.name ?? t("Resource", "محل بازی")}: ${field.kind === "resource-from" ? t("Available from", "شروع دسترسی") : t("Available until", "پایان دسترسی")}`;
    }
    if (
      field.kind === "participant-from" ||
      field.kind === "participant-until"
    ) {
      const participant = tournament.participants.find(
        (item) => item.id === field.participantId,
      );
      return `${participant?.name ?? t("Participant", "شرکت‌کننده")}: ${field.kind === "participant-from" ? t("Available from", "شروع دسترسی") : t("Available until", "پایان دسترسی")}`;
    }
    const match = tournament.matches.find((item) => item.id === field.matchId);
    const label = match
      ? generatedMatchLabel(match, locale)
      : t("Match", "دیدار");
    return field.kind === "leg-start"
      ? t(
          `${label}: leg ${number(field.leg ?? 1)} start`,
          `${label}: شروع بازی ${number(field.leg ?? 1)}`,
        )
      : t(`${label}: scheduled start`, `${label}: زمان شروع`);
  }

  function issue(status: LegacyWallTimeStatus): string {
    if (status === "ambiguous")
      return t(
        "This clock time occurs twice. Choose the earlier or later occurrence.",
        "این ساعت دو بار رخ می‌دهد. نوبت زودتر یا دیرتر را انتخاب کنید.",
      );
    if (status === "nonexistent")
      return t(
        "This clock time does not exist in this timezone because the clocks moved forward. Edit the time or leave this field unchanged.",
        "به دلیل جلو رفتن ساعت، این زمان در منطقه زمانی انتخاب‌شده وجود ندارد. ساعت را اصلاح کنید یا این مورد را بدون تغییر نگه دارید.",
      );
    if (status === "invalid-timezone")
      return t(
        "Enter a valid timezone such as Asia/Tehran, America/Los_Angeles, or UTC.",
        "منطقه زمانی معتبری مانند Asia/Tehran، America/Los_Angeles یا UTC وارد کنید.",
      );
    return t(
      "Enter a valid Gregorian date and time, for example 2026-10-22T18:30. Fractions may contain up to three digits.",
      "تاریخ و ساعت میلادی معتبر وارد کنید، برای مثال 2026-10-22T18:30. بخش اعشاری ثانیه حداکثر سه رقم دارد.",
    );
  }

  function localPreview(iso: string, zone: string): string {
    return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
      calendar: "gregory",
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "shortOffset",
    }).format(new Date(iso));
  }

  if (!fields.length) return null;
  return (
    <section className="legacy-timezone-review" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        {t("Review older backup times", "بررسی زمان‌های پشتیبان قدیمی")}
      </h3>
      <Notice>
        {t(
          `${number(fields.length)} schedule times have no timezone. The original timezone cannot be inferred. Choose the timezone that these clock times meant, or explicitly keep the original values.`,
          `${number(fields.length)} زمان برنامه فاقد منطقه زمانی است. منطقه زمانی اصلی قابل تشخیص نیست. منطقه‌ای را که ساعت‌ها بر اساس آن ثبت شده‌اند انتخاب کنید یا مقادیر اصلی را بدون تغییر نگه دارید.`,
        )}
      </Notice>
      <p className="muted">
        {t(
          "Some older tournament start defaults were written as UTC clock times. Use UTC for those values. Times that already include an offset stay unchanged. Dates below use the Gregorian calendar.",
          "زمان شروع پیش‌فرض برخی نسخه‌های قدیمی بر اساس ساعت UTC نوشته شده بود. برای آن مقادیر UTC را انتخاب کنید. زمان‌هایی که اختلاف با UTC دارند تغییر نمی‌کنند. تاریخ‌های زیر میلادی هستند.",
        )}
      </p>
      <Field label={t("Original timezone", "منطقه زمانی اصلی")}>
        <input
          dir="ltr"
          value={timeZone}
          list={`${id}-zones`}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          onChange={(event) => {
            invalidate();
            setTimeZone(event.target.value);
            setEdits((current) =>
              Object.fromEntries(
                Object.entries(current).map(([key, edit]) => [
                  key,
                  { ...edit, disambiguation: undefined },
                ]),
              ),
            );
          }}
        />
      </Field>
      <datalist id={`${id}-zones`}>
        {[
          ...new Set([
            tournament.timezone,
            deviceZone,
            "UTC",
            "Asia/Tehran",
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "Europe/Paris",
            "Asia/Tokyo",
            "Australia/Sydney",
          ]),
        ]
          .filter(Boolean)
          .map((zone) => (
            <option key={zone} value={zone} />
          ))}
      </datalist>
      <div className="legacy-timezone-actions">
        {[...new Set(["UTC", deviceZone])].map((zone) => (
          <button
            key={zone}
            type="button"
            className="button secondary small"
            disabled={disabled}
            onClick={() => {
              invalidate();
              setTimeZone(zone);
              setEdits((current) =>
                Object.fromEntries(
                  Object.entries(current).map(([key, edit]) => [
                    key,
                    { ...edit, disambiguation: undefined },
                  ]),
                ),
              );
            }}
          >
            {zone === "UTC"
              ? t("Use UTC", "استفاده از UTC")
              : t("Use device timezone", "استفاده از منطقه زمانی دستگاه")}
          </button>
        ))}
      </div>
      <div className="legacy-timezone-actions">
        <button
          type="button"
          className="button secondary small"
          disabled={disabled}
          onClick={() => {
            invalidate();
            setEdits(
              Object.fromEntries(
                rows.map(({ field, edit }) => [
                  field.id,
                  { ...edit, selected: true },
                ]),
              ),
            );
          }}
        >
          {t("Select all times", "انتخاب همه زمان‌ها")}
        </button>
        <button
          type="button"
          className="button secondary small"
          disabled={disabled}
          onClick={() => {
            invalidate();
            setEdits(
              Object.fromEntries(
                rows.map(({ field, edit }) => [
                  field.id,
                  { ...edit, selected: false },
                ]),
              ),
            );
          }}
        >
          {t("Clear selection", "لغو انتخاب‌ها")}
        </button>
        <span>
          {t(
            `${number(selected.length)} selected`,
            `${number(selected.length)} مورد انتخاب‌شده`,
          )}
        </span>
      </div>
      <div className="legacy-timezone-fields">
        {rows
          .slice(page * 20, (page + 1) * 20)
          .map(({ field, edit, zone, resolution }, rowIndex) => {
            const label = fieldLabel(field);
            const rowId = `${id}-${page * 20 + rowIndex}`;
            const candidate =
              resolution.status === "unique"
                ? resolution.candidates[0]
                : edit.disambiguation
                  ? resolution.candidates.at(
                      edit.disambiguation === "earlier" ? 0 : -1,
                    )
                  : undefined;
            return (
              <fieldset
                className="legacy-timezone-field"
                key={field.id}
                disabled={disabled}
              >
                <legend>{label}</legend>
                <label className="legacy-timezone-selection">
                  <input
                    type="checkbox"
                    checked={edit.selected}
                    onChange={(event) =>
                      editField(field, { selected: event.target.checked })
                    }
                  />
                  <span>{t("Correct this time", "اصلاح این زمان")}</span>
                </label>
                <p className="legacy-timezone-original">
                  <span>{t("Original value", "مقدار اصلی")}</span>
                  <bdi dir="ltr">{field.value}</bdi>
                </p>
                {edit.selected ? (
                  <>
                    <Field
                      label={t("Clock date and time", "تاریخ و ساعت ثبت‌شده")}
                      hint={t(
                        "YYYY-MM-DDTHH:mm, with optional seconds",
                        "سال-ماه-روزTساعت:دقیقه، با ثانیه اختیاری",
                      )}
                    >
                      <input
                        type="text"
                        dir="ltr"
                        value={edit.wallTime}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={40}
                        aria-invalid={
                          resolution.status === "invalid-date" ||
                          resolution.status === "nonexistent"
                        }
                        aria-describedby={
                          resolution.status !== "unique"
                            ? `${rowId}-issue`
                            : undefined
                        }
                        onChange={(event) =>
                          editField(field, {
                            wallTime: event.target.value,
                            disambiguation: undefined,
                          })
                        }
                      />
                    </Field>
                    <details>
                      <summary>
                        {t(
                          "Different timezone for this field",
                          "منطقه زمانی متفاوت برای این مورد",
                        )}
                      </summary>
                      <Field
                        label={t(
                          "Field timezone override",
                          "منطقه زمانی این مورد",
                        )}
                        hint={t(
                          "Leave empty to use the original timezone above.",
                          "برای استفاده از منطقه زمانی بالا، خالی بگذارید.",
                        )}
                      >
                        <input
                          dir="ltr"
                          value={edit.timeZone}
                          list={`${id}-zones`}
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={100}
                          onChange={(event) =>
                            editField(field, {
                              timeZone: event.target.value,
                              disambiguation: undefined,
                            })
                          }
                        />
                      </Field>
                    </details>
                    {resolution.status !== "unique" && (
                      <p
                        id={`${rowId}-issue`}
                        className={
                          resolution.status === "ambiguous"
                            ? "muted"
                            : "legacy-timezone-error"
                        }
                      >
                        {issue(resolution.status)}
                      </p>
                    )}
                    {resolution.status === "ambiguous" && (
                      <Field
                        label={t(
                          "Clock change occurrence",
                          "نوبت زمان هنگام تغییر ساعت",
                        )}
                      >
                        <select
                          value={edit.disambiguation ?? ""}
                          onChange={(event) =>
                            editField(field, {
                              disambiguation: event.target.value
                                ? (event.target.value as "earlier" | "later")
                                : undefined,
                            })
                          }
                        >
                          <option value="">
                            {t("Choose an occurrence", "انتخاب نوبت زمان")}
                          </option>
                          <option value="earlier">
                            {t("Earlier occurrence", "نوبت زودتر")}
                          </option>
                          <option value="later">
                            {t("Later occurrence", "نوبت دیرتر")}
                          </option>
                        </select>
                      </Field>
                    )}
                    {resolution.status === "ambiguous" && !candidate && (
                      <ul className="legacy-timezone-candidates">
                        {resolution.candidates.map((item, index) => (
                          <li key={item.iso}>
                            <span>
                              {index === 0
                                ? t("Earlier", "زودتر")
                                : t("Later", "دیرتر")}
                            </span>
                            <bdi dir="ltr">{item.iso}</bdi>
                          </li>
                        ))}
                      </ul>
                    )}
                    {candidate && (
                      <div className="legacy-timezone-preview">
                        <span>{t("Corrected instant", "زمان اصلاح‌شده")}</span>
                        <bdi dir="ltr">{candidate.iso}</bdi>
                        <span>{localPreview(candidate.iso, zone)}</span>
                        <bdi dir="ltr">{zone}</bdi>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    {t(
                      "This original value will be kept unchanged.",
                      "مقدار اصلی این مورد بدون تغییر باقی می‌ماند.",
                    )}
                  </p>
                )}
              </fieldset>
            );
          })}
      </div>
      {pageCount > 1 && (
        <nav
          className="legacy-timezone-actions"
          aria-label={t("Timezone review pages", "صفحه‌های بررسی منطقه زمانی")}
        >
          <button
            type="button"
            className="button secondary"
            disabled={disabled || page === 0}
            onClick={() => setPage(page - 1)}
          >
            {t("Previous times", "زمان‌های قبلی")}
          </button>
          <span role="status">
            {t(
              `Page ${number(page + 1)} of ${number(pageCount)}`,
              `صفحه ${number(page + 1)} از ${number(pageCount)}`,
            )}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={disabled || page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            {t("Next times", "زمان‌های بعدی")}
          </button>
        </nav>
      )}
      <p role="status" className="legacy-timezone-status">
        {reviewed === "original"
          ? t(
              "Review confirmed. Original times will be kept unchanged.",
              "بررسی تأیید شد. زمان‌های اصلی بدون تغییر باقی می‌مانند.",
            )
          : reviewed === "corrected"
            ? t(
                "Review confirmed. Selected times will be corrected when you import.",
                "بررسی تأیید شد. زمان‌های انتخاب‌شده هنگام ورود اصلاح می‌شوند.",
              )
            : unresolved.length
              ? t(
                  `${number(unresolved.length)} selected times need attention before correction can be confirmed.`,
                  `${number(unresolved.length)} زمان انتخاب‌شده پیش از تأیید اصلاح نیاز به بررسی دارد.`,
                )
              : t(
                  "Confirm your choice below before importing.",
                  "پیش از ورود، انتخاب خود را در پایین تأیید کنید.",
                )}
      </p>
      <div className="legacy-timezone-actions">
        <button
          type="button"
          className="button secondary"
          disabled={disabled}
          onClick={() => {
            setReviewed("original");
            onReview([]);
          }}
        >
          {t("Keep original times", "حفظ زمان‌های اصلی")}
        </button>
        <button
          type="button"
          className="button"
          disabled={disabled || selected.length === 0 || unresolved.length > 0}
          onClick={() => {
            const choices: LegacyTimezoneChoice[] = selected.map(
              ({ field, edit, zone }) => ({
                fieldId: field.id,
                timeZone: zone,
                wallTime: edit.wallTime,
                disambiguation: edit.disambiguation,
              }),
            );
            setReviewed("corrected");
            onReview(choices);
          }}
        >
          {t("Apply reviewed times", "تأیید زمان‌های بررسی‌شده")}
        </button>
      </div>
    </section>
  );
}
