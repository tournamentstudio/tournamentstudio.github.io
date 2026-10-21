import { useMemo, useState } from "react";
import type { EditorProps } from "../app/Participants";
import { ErrorText, Field, Notice } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { downloadText } from "../export";
import { generatedMatchLabel, useI18n } from "../i18n";
import {
  playerEventIssue,
  playerTotals,
  readPlayerStatistics,
  savePlayerMetric,
  type PlayerEvent,
  type PlayerMetric,
} from "./model";
import { playerMetricTemplates } from "./templates";
import { playerStatisticsCSV } from "./export";
import { PlayerEventEditor } from "./PlayerEventEditor";
import { PlayerMetricEditor } from "./PlayerMetricEditor";
import "./players.css";

export function PlayerStatisticsStudio(props: EditorProps) {
  try {
    readPlayerStatistics(props.tournament);
  } catch (e) {
    return <ErrorText error={e} />;
  }
  return <PlayerStatisticsContent {...props} />;
}
function PlayerStatisticsContent({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const data = useMemo(() => readPlayerStatistics(doc), [doc]);
  const [eventEditor, setEventEditor] = useState<PlayerEvent | "new">();
  const [metricEditor, setMetricEditor] = useState<PlayerMetric | "new">();
  const [player, setPlayer] = useState("");
  const [matchId, setMatchId] = useState("");
  const [eventStatus, setEventStatus] = useState("all");
  const [error, setError] = useState<unknown>();
  const [exportReady, setExportReady] = useState(false);
  const [teamId, playerId] = player ? (JSON.parse(player) as string[]) : [];
  const totals = useMemo(
    () => playerTotals(doc, { teamId, playerId, matchId }),
    [doc, teamId, playerId, matchId],
  );
  const playerChoices = useMemo(
    () => [
      ...new Map(
        data.events.map((e) => [
          JSON.stringify([e.teamId, e.playerId]),
          { name: e.playerName, team: e.teamName },
        ]),
      ).entries(),
    ],
    [data],
  );
  const matchOrder = useMemo(
    () => new Map(doc.matches.map((m, index) => [m.id, index])),
    [doc.matches],
  );
  const filtered = useMemo(
    () =>
      data.events
        .filter(
          (e) =>
            (!teamId || (e.teamId === teamId && e.playerId === playerId)) &&
            (!matchId || e.matchId === matchId) &&
            (eventStatus === "all" ||
              (playerEventIssue(doc, e) && e.status === "active"
                ? "quarantined"
                : e.status) === eventStatus),
        )
        .sort((a, b) =>
          a.matchId === b.matchId
            ? (a.elapsedSeconds ?? Infinity) - (b.elapsedSeconds ?? Infinity) ||
              a.createdAt.localeCompare(b.createdAt)
            : (matchOrder.get(a.matchId) ?? Infinity) -
                (matchOrder.get(b.matchId) ?? Infinity) ||
              a.matchId.localeCompare(b.matchId),
        ),
    [data, doc, teamId, playerId, matchId, eventStatus, matchOrder],
  );
  const { visible, pagination } = usePagination(
    filtered,
    JSON.stringify([doc.id, player, matchId, eventStatus]),
  );
  const { visible: visibleTotals, pagination: totalPagination } = usePagination(
    totals,
    JSON.stringify([doc.id, player, matchId]),
  );
  const reviewCount = data.events.filter(
    (e) =>
      e.status === "quarantined" ||
      (e.status === "active" && playerEventIssue(doc, e)),
  ).length;
  function templates() {
    try {
      let next = doc;
      for (const metric of playerMetricTemplates(doc.sport))
        if (!data.metrics.some((m) => m.id === metric.id))
          next = savePlayerMetric(next, metric);
      onChange(next, "Added player metric templates");
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  const metricName = (id: string) => {
    const m = data.metrics.find((entry) => entry.id === id);
    return m ? (locale === "fa" ? m.fa || m.label : m.label) : id;
  };
  const statusName = (status: PlayerEvent["status"]) =>
    status === "active"
      ? t("Counted", "محاسبه شده")
      : status === "deleted"
        ? t("Removed", "حذف شده")
        : t("Needs review", "نیازمند بازبینی");
  return (
    <section
      className="panel-content player-statistics-studio"
      aria-labelledby="player-statistics-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {t("Recorded observations", "مشاهده‌های ثبت شده")}
          </p>
          <h2 id="player-statistics-heading">
            {t("Player statistics", "آمار بازیکنان")}
          </h2>
          <p>
            {t(
              "Record roster-player events and review each player's match timeline. Totals use only entered observations and never change official team scores.",
              "رویدادهای بازیکنان را ثبت کنید و روند هر دیدار را ببینید. آمار فقط از مشاهده‌های وارد شده محاسبه می‌شود و امتیاز رسمی تیم را تغییر نمی‌دهد.",
            )}
          </p>
        </div>
      </div>
      <Notice>
        {t(
          "Roster identities, player observations, and notes are excluded from spectator links, public files, presentations, and public update packets. A full private backup includes them. Entrant names remain public, including individual competitors.",
          "هویت اعضای فهرست تیم، آمار بازیکنان و یادداشت‌ها در پیوند تماشاگر، فایل عمومی، نمایش و بسته به‌روزرسانی عمومی قرار نمی‌گیرند. پشتیبان کامل خصوصی آن‌ها را نگه می‌دارد. نام شرکت‌کنندگان، از جمله رقابت‌کنندگان انفرادی، عمومی می‌ماند.",
        )}
      </Notice>
      {reviewCount > 0 && (
        <p className="player-review-warning" role="status">
          {t(
            `${reviewCount.toLocaleString(locale)} events need review after a match or roster change. They are excluded from totals.`,
            `${reviewCount.toLocaleString(locale)} رویداد پس از تغییر دیدار یا فهرست بازیکنان نیازمند بازبینی است و در آمار محاسبه نمی‌شود.`,
          )}
        </p>
      )}
      <div className="button-row">
        <button
          className="button primary"
          onClick={() => setEventEditor("new")}
          disabled={!data.metrics.some((m) => !m.archived)}
        >
          {t("Record player event", "ثبت رویداد بازیکن")}
        </button>
        <button className="button secondary" onClick={templates}>
          {t("Add sport metrics", "افزودن شاخص‌های ورزش")}
        </button>
        <button
          className="button secondary"
          onClick={() => setMetricEditor("new")}
        >
          {t("Add player metric", "افزودن شاخص بازیکن")}
        </button>
        <button
          className="button secondary"
          disabled={!data.events.length}
          onClick={() => setExportReady(!exportReady)}
        >
          {t("Export player CSV", "خروجی CSV بازیکنان")}
        </button>
      </div>
      {exportReady && (
        <div className="panel">
          <p>
            {t(
              "This CSV includes player identities, private notes, and excluded events with their status. Share it only with people who should have this information.",
              "این فایل CSV شامل هویت بازیکن، یادداشت خصوصی و رویدادهای کنار گذاشته شده با وضعیت آن‌ها است. آن را فقط با افراد مجاز به این اطلاعات به اشتراک بگذارید.",
            )}
          </p>
          <button
            className="button primary"
            onClick={() => {
              downloadText(
                `${doc.slug || "tournament"}-players-private.csv`,
                playerStatisticsCSV(doc, locale),
                "text/csv;charset=utf-8",
              );
              setExportReady(false);
            }}
          >
            {t("Download private player CSV", "دریافت CSV خصوصی بازیکنان")}
          </button>
        </div>
      )}
      <ErrorText error={error} />
      <details className="player-metric-list">
        <summary>
          {t("Player metric definitions", "تعریف شاخص‌های بازیکن")} (
          {data.metrics.length.toLocaleString(locale)})
        </summary>
        {!data.metrics.length && (
          <p>
            {t(
              "Add the sport defaults or define a numeric metric to begin.",
              "برای شروع شاخص‌های پیش‌فرض ورزش یا یک شاخص عددی اضافه کنید.",
            )}
          </p>
        )}
        <ul>
          {data.metrics.map((m) => (
            <li key={m.id}>
              <span>
                <bdi>{metricName(m.id)}</bdi>{" "}
                {m.archived && t("(archived)", "(بایگانی شده)")}
              </span>
              <button
                className="button secondary small"
                onClick={() => setMetricEditor(m)}
                aria-label={t(
                  `Edit metric ${m.label}`,
                  `ویرایش شاخص ${m.fa || m.label}`,
                )}
              >
                {t("Edit", "ویرایش")}
              </button>
            </li>
          ))}
        </ul>
      </details>
      <div className="form-grid player-filters">
        <Field label={t("Player history", "تاریخچه بازیکن")}>
          <select value={player} onChange={(e) => setPlayer(e.target.value)}>
            <option value="">{t("All players", "همه بازیکنان")}</option>
            {playerChoices.map(([id, p]) => (
              <option key={id} value={id}>
                {p.name} / {p.team}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Match history", "تاریخچه دیدار")}>
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            <option value="">{t("All matches", "همه دیدارها")}</option>
            {doc.matches
              .filter((m) => data.events.some((e) => e.matchId === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {generatedMatchLabel(m, locale)}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t("Event status", "وضعیت رویداد")}>
          <select
            value={eventStatus}
            onChange={(e) => setEventStatus(e.target.value)}
          >
            <option value="all">{t("All events", "همه رویدادها")}</option>
            {(["active", "quarantined", "deleted"] as const).map((status) => (
              <option key={status} value={status}>
                {statusName(status)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h3>{t("Player totals", "آمار تجمیعی بازیکنان")}</h3>
      {!totals.length ? (
        <p>
          {t(
            "No counted player observations for this selection. Missing values are not assumed to be zero.",
            "برای این انتخاب مشاهده‌ای محاسبه نشده است. داده‌های ثبت نشده صفر فرض نمی‌شوند.",
          )}
        </p>
      ) : (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t("Player totals table", "جدول آمار بازیکنان")}
          >
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    t("Player", "بازیکن"),
                    t("Team", "تیم"),
                    t("Metric", "شاخص"),
                    t("Value", "مقدار"),
                    t("Events", "رویدادها"),
                    t("Observed matches", "دیدارهای ثبت شده"),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTotals.map((row) => (
                  <tr
                    key={JSON.stringify([
                      row.teamId,
                      row.playerId,
                      row.metricId,
                    ])}
                  >
                    <td>
                      <bdi>{row.playerName}</bdi>
                    </td>
                    <td>
                      <bdi>{row.teamName}</bdi>
                    </td>
                    <td>
                      <bdi>{metricName(row.metricId)}</bdi>
                    </td>
                    <td>
                      {row.value.toLocaleString(locale, {
                        maximumFractionDigits: 4,
                      })}{" "}
                      {data.metrics.find((m) => m.id === row.metricId)?.unit}
                    </td>
                    <td>{row.eventCount.toLocaleString(locale)}</td>
                    <td>{row.matchCount.toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            pagination={totalPagination}
            label={t("Player totals pages", "صفحه‌های آمار بازیکنان")}
          />
        </>
      )}
      <h3>{t("Player event timeline", "روند رویدادهای بازیکن")}</h3>
      {!filtered.length && (
        <p>
          {t(
            "No player events have been recorded for this selection.",
            "برای این انتخاب رویدادی ثبت نشده است.",
          )}
        </p>
      )}
      <ol className="player-timeline">
        {visible.map((event) => {
          const status =
            event.status === "active" && playerEventIssue(doc, event)
              ? "quarantined"
              : event.status;
          return (
            <li key={event.id}>
              <div className="player-event-heading">
                <strong>
                  <bdi>{event.playerName}</bdi> / <bdi>{event.teamName}</bdi>
                </strong>
                <span className="badge">{statusName(status)}</span>
              </div>
              <p>
                <bdi>{metricName(event.metricId)}</bdi>:{" "}
                <strong>{event.value.toLocaleString(locale)}</strong>{" "}
                {data.metrics.find((m) => m.id === event.metricId)?.unit}
              </p>
              <p>
                {doc.matches.find((m) => m.id === event.matchId)
                  ? generatedMatchLabel(
                      doc.matches.find((m) => m.id === event.matchId)!,
                      locale,
                    )
                  : event.matchLabel}
                {event.period && (
                  <>
                    {" "}
                    / <bdi>{event.period}</bdi>
                  </>
                )}
                {event.elapsedSeconds !== undefined && (
                  <>
                    {" "}
                    / {event.elapsedSeconds.toLocaleString(locale)}{" "}
                    {t("seconds", "ثانیه")}
                  </>
                )}
              </p>
              {event.notes && (
                <p className="player-private-note">
                  <bdi>{event.notes}</bdi>
                </p>
              )}
              <button
                className="button secondary small"
                onClick={() => setEventEditor(event)}
                aria-label={t(
                  `Review event for ${event.playerName}`,
                  `بازبینی رویداد ${event.playerName}`,
                )}
              >
                {t("Review or correct", "بازبینی یا اصلاح")}
              </button>
            </li>
          );
        })}
      </ol>
      <Pagination
        pagination={pagination}
        label={t("Player event pages", "صفحه‌های رویداد بازیکنان")}
      />
      {eventEditor && (
        <PlayerEventEditor
          tournament={doc}
          event={eventEditor === "new" ? undefined : eventEditor}
          onSave={onChange}
          onClose={() => setEventEditor(undefined)}
        />
      )}
      {metricEditor && (
        <PlayerMetricEditor
          tournament={doc}
          metric={metricEditor === "new" ? undefined : metricEditor}
          onSave={onChange}
          onClose={() => setMetricEditor(undefined)}
        />
      )}
    </section>
  );
}
