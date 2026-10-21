import { useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Modal, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";
import {
  deletePlayerEvent,
  readPlayerStatistics,
  rosterPlayers,
  savePlayerEvent,
  type PlayerEvent,
} from "./model";

export function PlayerEventEditor({
  tournament: doc,
  event,
  onSave,
  onClose,
}: {
  tournament: Tournament;
  event?: PlayerEvent;
  onSave: (doc: Tournament, action: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const matches = doc.matches.filter(
    (m) =>
      ["ready", "live", "completed", "contested"].includes(m.status) &&
      m.slots.length >= 1 &&
      m.slots.every((s) => s.participantId),
  );
  const first = matches.find((m) => m.id === event?.matchId) ?? matches[0];
  const [matchId, setMatchId] = useState(first?.id ?? "");
  const [teamId, setTeamId] = useState(
    event?.teamId ?? first?.slots[0]?.participantId ?? "",
  );
  const [playerId, setPlayerId] = useState(event?.playerId ?? "");
  const metrics = readPlayerStatistics(doc).metrics.filter((m) => !m.archived);
  const [metricId, setMetricId] = useState(
    event?.metricId ?? metrics[0]?.id ?? "",
  );
  const [value, setValue] = useState(String(event?.value ?? 1));
  const [elapsed, setElapsed] = useState(
    event?.elapsedSeconds === undefined ? "" : String(event.elapsedSeconds),
  );
  const [period, setPeriod] = useState(event?.period ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>();
  const match = matches.find((m) => m.id === matchId),
    metric = metrics.find((m) => m.id === metricId);
  const players = rosterPlayers(doc, teamId);
  function submit(remove = false) {
    try {
      if (!remove && !value.trim())
        throw new Error(
          t("Enter a recorded value.", "مقدار ثبت شده را وارد کنید."),
        );
      const next =
        remove && event
          ? deletePlayerEvent(doc, event.id, reason)
          : savePlayerEvent(
              doc,
              {
                matchId,
                teamId,
                playerId,
                metricId,
                value: Number(value),
                ...(elapsed.trim() ? { elapsedSeconds: Number(elapsed) } : {}),
                period,
                notes,
              },
              event?.id,
              reason,
            );
      onSave(
        next,
        remove
          ? "Removed player event"
          : event
            ? "Corrected player event"
            : "Recorded player event",
      );
      onClose();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Modal
      title={
        event
          ? t("Review player event", "بازبینی رویداد بازیکن")
          : t("Record player event", "ثبت رویداد بازیکن")
      }
      onClose={onClose}
      wide
    >
      <form
        className="player-event-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Notice>
          {t(
            "Player events are separate observations. Saving them does not change official match scores. These records and roster identities are excluded from public snapshots. Entrant names remain public.",
            "رویدادهای بازیکن مشاهده‌های جداگانه هستند و ثبت آن‌ها نتیجه رسمی دیدار را تغییر نمی‌دهد. این سوابق و هویت اعضای فهرست تیم در نسخه عمومی قرار نمی‌گیرند. نام شرکت‌کنندگان عمومی می‌ماند.",
          )}
        </Notice>
        {event?.status !== undefined && event.status !== "active" && (
          <p role="status">
            {t(
              "This event is excluded from totals until you review and save it again.",
              "این رویداد تا زمان بازبینی و ذخیره دوباره در آمار محاسبه نمی‌شود.",
            )}
          </p>
        )}
        <div className="form-grid">
          <Field label={t("Event match", "دیدار رویداد")}>
            <select
              value={matchId}
              required
              onChange={(e) => {
                const id = e.target.value;
                setMatchId(id);
                setTeamId(
                  matches.find((m) => m.id === id)?.slots[0]?.participantId ??
                    "",
                );
                setPlayerId("");
              }}
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {generatedMatchLabel(m, locale)}:{" "}
                  {m.slots
                    .map(
                      (s) =>
                        doc.participants.find((p) => p.id === s.participantId)
                          ?.name,
                    )
                    .join(" / ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Event team", "تیم رویداد")}>
            <select
              required
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setPlayerId("");
              }}
            >
              {match?.slots.map((s) => (
                <option key={s.participantId} value={s.participantId}>
                  {doc.participants.find((p) => p.id === s.participantId)?.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Roster player", "بازیکن فهرست تیم")}>
            <select
              required
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              <option value="">{t("Choose a player", "انتخاب بازیکن")}</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Player metric", "شاخص بازیکن")}>
            <select
              required
              value={metricId}
              onChange={(e) => setMetricId(e.target.value)}
            >
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {locale === "fa" ? m.fa || m.label : m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Recorded value", "مقدار ثبت شده")}>
            <input
              required
              type="number"
              step={metric?.type === "integer" ? 1 : "any"}
              min={metric?.min}
              max={metric?.max}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field
            label={t(
              "Elapsed seconds (optional)",
              "زمان سپری شده به ثانیه (اختیاری)",
            )}
          >
            <input
              type="number"
              min="0"
              max="604800"
              step="any"
              value={elapsed}
              onChange={(e) => setElapsed(e.target.value)}
            />
          </Field>
          <Field label={t("Period or round", "بخش یا دور")}>
            <input
              maxLength={80}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
          <Field label={t("Private event notes", "یادداشت خصوصی رویداد")}>
            <textarea
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        {!players.length && (
          <Notice>
            {t(
              "Add players to this team in Participants before recording an event. Coaches are not selectable as players.",
              "پیش از ثبت رویداد در بخش شرکت‌کنندگان بازیکنان تیم را اضافه کنید. مربی به عنوان بازیکن قابل انتخاب نیست.",
            )}
          </Notice>
        )}
        {event && (
          <Field
            label={t("Reason for correction or removal", "علت اصلاح یا حذف")}
          >
            <input
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        <ErrorText error={error} />
        <div className="button-row">
          <button
            className="button primary"
            disabled={!matches.length || !metrics.length}
          >
            {event
              ? t("Save reviewed event", "ذخیره رویداد بازبینی شده")
              : t("Save player event", "ذخیره رویداد بازیکن")}
          </button>
          {event && event.status !== "deleted" && (
            <button
              type="button"
              className="button danger"
              onClick={() => submit(true)}
            >
              {t("Remove from totals", "حذف از آمار")}
            </button>
          )}
        </div>
        {event && (
          <details>
            <summary>
              {t("Event audit history", "تاریخچه تغییرات رویداد")}
            </summary>
            <p>
              {t(
                "The latest 30 edits are retained here. Tournament revisions and private backups provide earlier recovery points.",
                "۳۰ ویرایش آخر اینجا نگهداری می‌شود. نسخه‌های مسابقات و پشتیبان خصوصی امکان بازیابی قدیمی‌تر را فراهم می‌کنند.",
              )}
            </p>
            {event.history.length ? (
              <ol>
                {[...event.history].reverse().map((h, index) => (
                  <li key={index}>
                    <time>{new Date(h.at).toLocaleString(locale)}</time>
                    <p>
                      <bdi>{h.before.playerName}</bdi>:{" "}
                      {h.before.value.toLocaleString(locale)}.{" "}
                      <bdi>{h.reason}</bdi>
                    </p>
                    {h.before.notes && (
                      <p>
                        <bdi>{h.before.notes}</bdi>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{t("No corrections recorded.", "اصلاحی ثبت نشده است.")}</p>
            )}
          </details>
        )}
      </form>
    </Modal>
  );
}
