import { useMemo, useState } from "react";
import type { Tournament } from "../domain/types";
import { useI18n, generatedMatchLabel } from "../i18n";
import { ErrorText, Field, Notice } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { csvCell, downloadText } from "../export";
import type { EventCollection } from "./model";
import { aggregateRankings, seasonMovement } from "./rankings";
import { eventConflicts, eventSchedule } from "./schedule";
import { eventHTML, publicEvent } from "./public";
import { EventPresentation } from "./EventPresentation";

export function CollectionResults({
  collection,
  documents,
  onSave,
  onOpen,
}: {
  collection: EventCollection;
  documents: Tournament[];
  onSave: (c: EventCollection) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const { t, number, date, locale } = useI18n();
  const [divisionId, setDivision] = useState(collection.divisions[0].id);
  const [tab, setTab] = useState("rankings");
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState("");
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState("");
  const [movement, setMovement] = useState<{
    promote: string[];
    relegate: string[];
  }>();
  const [present, setPresent] = useState(false);
  const rankings = useMemo(
    () => aggregateRankings(collection, documents, divisionId),
    [collection, documents, divisionId],
  );
  const slots = useMemo(
    () => eventSchedule(collection, documents),
    [collection, documents],
  );
  const conflicts = useMemo(() => eventConflicts(slots), [slots]);
  const { visible, pagination } = usePagination(slots);
  const rankingPage = usePagination(rankings.rows, divisionId);
  const displayName = (id: string) =>
    collection.directory.find((p) => p.id === id)?.name ?? id;
  const label = (tournamentId: string, matchId: string) => {
    const match = documents
      .find((d) => d.id === tournamentId)
      ?.matches.find((m) => m.id === matchId);
    return match ? generatedMatchLabel(match, locale) : matchId;
  };
  return (
    <div className="panel event-results">
      {present && (
        <EventPresentation
          value={publicEvent(collection, documents)}
          onClose={() => setPresent(false)}
        />
      )}
      <div className="section-heading">
        <h3>{t("Event scoreboard", "تابلوی رویداد")}</h3>
        <div className="button-row">
          <button className="button secondary" onClick={() => setPresent(true)}>
            {t("Present event", "نمایش رویداد")}
          </button>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                "event-print.html",
                eventHTML(collection, documents, locale),
                "text/html",
              )
            }
          >
            {t("Download printable event", "دریافت رویداد قابل چاپ")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      <nav
        className="button-row"
        aria-label={t("Event display", "نمایش رویداد")}
      >
        {[
          ["rankings", "Season standings", "جدول فصل"],
          ["schedule", "Shared schedule", "برنامه مشترک"],
        ].map(([id, en, fa]) => (
          <button
            className={`button ${tab === id ? "primary" : "secondary"}`}
            key={id}
            onClick={() => setTab(id)}
          >
            {t(en, fa)}
          </button>
        ))}
      </nav>
      {tab === "rankings" ? (
        <>
          <Field label={t("Ranking division", "دسته رتبه‌بندی")}>
            <select
              value={divisionId}
              onChange={(e) => {
                setDivision(e.target.value);
                setMovement(undefined);
              }}
            >
              {collection.divisions.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          {rankings.pending.length > 0 && (
            <Notice>
              {t(
                `${rankings.pending.length} linked competitions are incomplete, locked, missing or still group-only. Their points are excluded.`,
                `${number(rankings.pending.length)} مسابقات پیوندشده ناقص، قفل، مفقود یا فقط گروهی هستند. امتیاز آن‌ها محاسبه نشده است.`,
              )}
            </Notice>
          )}
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t(
              "Scrollable season standings",
              "جدول فصل قابل پیمایش",
            )}
          >
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    t("Rank", "رتبه"),
                    t("Participant", "شرکت‌کننده"),
                    t("Events", "رویدادها"),
                    t("Wins", "برد"),
                    t("Adjustment", "تعدیل"),
                    t("Points", "امتیاز"),
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingPage.visible.map((r) => (
                  <tr key={r.directoryId}>
                    <td>
                      {number(r.rank)}
                      {r.tied ? t(" (tied)", " (برابر)") : ""}
                    </td>
                    <td>
                      <bdi>{r.name}</bdi>
                    </td>
                    <td>{number(r.starts)}</td>
                    <td>{number(r.wins)}</td>
                    <td>{number(r.adjustment)}</td>
                    <td>
                      <strong>
                        {number(Math.round(r.points * 1000) / 1000)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            pagination={rankingPage.pagination}
            label={t("Season ranking pages", "صفحه‌های جدول فصل")}
          />
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() =>
                downloadText(
                  "season-rankings.csv",
                  [
                    ["rank", "name", "events", "wins", "adjustment", "points"],
                    ...rankings.rows.map((r) => [
                      r.rank,
                      r.name,
                      r.starts,
                      r.wins,
                      r.adjustment,
                      r.points,
                    ]),
                  ]
                    .map((row) => row.map(csvCell).join(","))
                    .join("\r\n"),
                  "text/csv",
                )
              }
            >
              {t("Export rankings CSV", "صدور CSV رتبه‌بندی")}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                try {
                  setMovement(
                    seasonMovement(collection, documents, divisionId),
                  );
                  setError(undefined);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("Preview promotion and relegation", "پیش‌نمایش صعود و سقوط")}
            </button>
          </div>
          {movement && (
            <div className="panel inset-panel" role="status">
              <h4>{t("Season movement plan", "برنامه جابه‌جایی فصل")}</h4>
              <p>
                {t("Promote", "صعود")}:{" "}
                {movement.promote.map(displayName).join(" · ") ||
                  t("None", "هیچ‌کدام")}
              </p>
              <p>
                {t("Relegate", "سقوط")}:{" "}
                {movement.relegate.map(displayName).join(" · ") ||
                  t("None", "هیچ‌کدام")}
              </p>
              <p>
                {t(
                  "This is a reviewed plan. Tournament rosters are not changed by this preview.",
                  "این پیش‌نمایش برنامه است. فهرست شرکت‌کنندگان مسابقات را تغییر نمی‌دهد.",
                )}
              </p>
            </div>
          )}
          <details className="event-private">
            <summary>
              {t("Points adjustments and penalties", "تعدیل امتیاز و جریمه‌ها")}
            </summary>
            <div className="event-grid">
              <Field label={t("Adjustment recipient", "دریافت‌کننده تعدیل")}>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">
                    {t("Choose participant", "انتخاب شرکت‌کننده")}
                  </option>
                  {collection.directory
                    .filter((p) => p.divisionId === divisionId)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("Points adjustment", "مقدار تعدیل امتیاز")}>
                <input
                  type="number"
                  value={points}
                  min={-100000}
                  max={100000}
                  onChange={(e) => setPoints(Number(e.target.value))}
                />
              </Field>
              <Field label={t("Adjustment reason", "دلیل تعدیل")}>
                <input
                  value={reason}
                  maxLength={180}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>
            <button
              className="button secondary"
              disabled={!selected || !reason.trim() || !Number.isFinite(points)}
              onClick={async () => {
                try {
                  await onSave({
                    ...collection,
                    adjustments: [
                      ...collection.adjustments,
                      {
                        id: crypto.randomUUID(),
                        directoryId: selected,
                        points,
                        reason,
                      },
                    ],
                  });
                  setReason("");
                  setPoints(0);
                  setMovement(undefined);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("Record points adjustment", "ثبت تعدیل امتیاز")}
            </button>
            <ul>
              {collection.adjustments.map((a) => (
                <li key={a.id}>
                  {displayName(a.directoryId)}: {number(a.points)} · {a.reason}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
          <p>
            {t(
              "Shared identities and venue names must be linked explicitly in event configuration. Potential future entrants are included in conflict checks. Times use your device's timezone.",
              "هویت و نام مکان مشترک را در تنظیمات رویداد پیوند دهید. شرکت‌کنندگان احتمالی آینده در بررسی تداخل لحاظ می‌شوند. زمان‌ها بر اساس منطقه زمانی دستگاه است.",
            )}
          </p>
          <Notice>
            {t(
              `${conflicts.length}${conflicts.length >= 1000 ? "+" : ""} conflicts across competitions`,
              `${number(conflicts.length)}${conflicts.length >= 1000 ? "+" : ""} تداخل بین مسابقات`,
            )}
          </Notice>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t(
              "Scrollable event schedule",
              "برنامه رویداد قابل پیمایش",
            )}
          >
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    t("Competition", "مسابقات"),
                    t("Match", "دیدار"),
                    t("Starts", "شروع"),
                    t("Shared venue", "مکان مشترک"),
                    t("Open", "باز کردن"),
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={`${s.tournamentId}:${s.matchId}`}>
                    <td>{s.title}</td>
                    <td>{label(s.tournamentId, s.matchId)}</td>
                    <td>{date(new Date(s.starts).toISOString())}</td>
                    <td>{s.venue || t("Separate venue", "مکان جداگانه")}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onOpen(s.tournamentId)}
                      >
                        {t("Open competition", "باز کردن مسابقات")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            pagination={pagination}
            label={t("Event schedule pages", "صفحه‌های برنامه رویداد")}
          />
          <details>
            <summary>
              {t("Review schedule conflicts", "بررسی تداخل برنامه")}
            </summary>
            {conflicts.slice(0, 100).map((c, i) => (
              <p key={i}>
                {c.left.title} / {label(c.left.tournamentId, c.left.matchId)} ·{" "}
                {c.right.title} / {label(c.right.tournamentId, c.right.matchId)}
                :{" "}
                {c.reasons
                  .map((r) =>
                    r === "venue"
                      ? t("venue", "مکان")
                      : r === "referee"
                        ? t("referee", "داور")
                        : t("entrant/rest", "شرکت‌کننده/استراحت"),
                  )
                  .join(", ")}
              </p>
            ))}
            {conflicts.length > 100 && (
              <p>
                {t(
                  "Showing the first 100 conflicts. Resolve these and check again.",
                  "۱۰۰ تداخل اول نمایش داده شده است. پس از رفع دوباره بررسی کنید.",
                )}
              </p>
            )}
          </details>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                "event-schedule.csv",
                [
                  ["competition", "match", "starts", "ends", "sharedVenue"],
                  ...slots.map((s) => [
                    s.title,
                    label(s.tournamentId, s.matchId),
                    new Date(s.starts).toISOString(),
                    new Date(s.ends).toISOString(),
                    s.venue,
                  ]),
                ]
                  .map((row) => row.map(csvCell).join(","))
                  .join("\r\n"),
                "text/csv",
              )
            }
          >
            {t("Export event schedule CSV", "صدور CSV برنامه رویداد")}
          </button>
        </>
      )}
    </div>
  );
}
