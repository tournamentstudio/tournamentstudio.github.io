import { useEffect, useState } from "react";
import { ArrowLeftRight, Pause, Play, ShieldCheck } from "lucide-react";
import type { Match, Tournament } from "../../domain/types";
import {
  finishGolClock,
  golClockElapsed,
  golDecision,
  golPolicy,
  golState,
  recordGolHand,
  setGolClock,
  setGolPossession,
  startGolOvertime,
  undoGolHand,
  type GolMatch,
} from "../../engine/gol";
import { ErrorText, Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { GolActionIcon } from "../../themes/GameIcon";

export function RefereeMode({
  tournament: doc,
  match,
  onChange,
  onScores,
}: {
  tournament: Tournament;
  match: Match;
  onChange: (t: Tournament, action: string) => void;
  onScores: (scores: number[]) => void;
}) {
  const { t, locale } = useI18n();
  const current = match as GolMatch,
    state = golState(current),
    policy = golPolicy(doc);
  const ids = match.slots.flatMap((s) =>
    s.participantId ? [s.participantId] : [],
  );
  const [secret, setSecret] = useState(match.private?.concealedPosition ?? ""),
    [awarded, setAwarded] = useState(ids[0] ?? ""),
    [points, setPoints] = useState(doc.rules.gol.handPoints),
    [card, setCard] = useState(""),
    [cardUser, setCardUser] = useState(ids[0] ?? ""),
    [error, setError] = useState<unknown>(),
    [now, setNow] = useState(Date.now());
  const concealing = state.concealingTeamId ?? ids[0] ?? "",
    running = Boolean(state.runningSince),
    elapsed = Math.floor(golClockElapsed(current, now) / 1000),
    decision = golDecision(doc, current, now),
    locked = Boolean(match.result);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  const name = (id: string) =>
    doc.participants.find((p) => p.id === id)?.name ?? "?";
  function change(
    action: () => Tournament,
    label: string,
    clearSecret = false,
  ) {
    try {
      const next = action(),
        updated = next.matches.find((m) => m.id === match.id)!;
      onScores(
        updated.result?.scores ?? updated.liveScores ?? ids.map(() => 0),
      );
      onChange(next, label);
      setNow(Date.now());
      setError(undefined);
      if (
        clearSecret ||
        (updated as GolMatch).golState?.concealingTeamId !== concealing
      )
        setSecret("");
    } catch (error) {
      setError(error);
    }
  }
  return (
    <div className="referee-panel">
      <div className="section-heading">
        <span className="badge">
          <ShieldCheck size={14} />
          {t("REFEREE ONLY", "فقط داور")}
        </span>
        <div className="referee-timer">
          <GolActionIcon action="bell" size={18} />
          <b
            role="timer"
            aria-label={t("Persisted match clock", "زمان‌سنج ذخیره‌شده دیدار")}
          >
            {Math.floor(elapsed / 60).toLocaleString(locale, {
              minimumIntegerDigits: 2,
            })}
            :
            {(elapsed % 60).toLocaleString(locale, { minimumIntegerDigits: 2 })}
          </b>
          <button
            type="button"
            className="icon-button"
            disabled={locked}
            aria-label={
              running
                ? t("Pause timer", "توقف زمان")
                : t("Start timer", "شروع زمان")
            }
            onClick={() =>
              change(
                () => setGolClock(doc, match.id, running ? "pause" : "start"),
                t("Change referee clock", "تغییر زمان‌سنج داور"),
              )
            }
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={locked || (!elapsed && !running)}
            onClick={() =>
              change(
                () => setGolClock(doc, match.id, "reset"),
                t("Reset referee clock", "بازنشانی زمان‌سنج داور"),
              )
            }
          >
            {t("Reset clock", "بازنشانی زمان")}
          </button>
        </div>
      </div>
      <Notice>
        {t(
          "The clock keeps running after closing this dialog until paused. Clock actions and possession are saved. Referee state, hand history and concealed positions are excluded from spectator packages.",
          "زمان‌سنج پس از بستن پنجره تا زمان توقف ادامه دارد. تغییرات زمان و مالکیت ذخیره می‌شوند. وضعیت داور، گزارش دست‌ها و مکان گل در بسته‌های تماشاگر قرار نمی‌گیرند.",
        )}
      </Notice>
      {policy.ending === "target" && (
        <Notice>
          {t(
            "The agreed target rule confirms the result automatically when the target and winning margin are reached.",
            "قانون هدف توافق‌شده با رسیدن به امتیاز هدف و اختلاف لازم، نتیجه را خودکار تأیید می‌کند.",
          )}
        </Notice>
      )}
      {policy.ending === "clock" && (
        <p>
          {t("Period limit", "زمان هر دوره")}:{" "}
          {(state.overtime === "extra-time"
            ? policy.overtimeSeconds
            : policy.clockSeconds
          ).toLocaleString(locale)}{" "}
          {t("seconds", "ثانیه")} ·{" "}
          {t("Overtime periods", "دوره‌های وقت اضافه")}:{" "}
          {state.period.toLocaleString(locale)}
        </p>
      )}
      {state.overtime === "sudden-death" && (
        <Notice>
          {t(
            "Sudden death: the next lead confirms the match result.",
            "تک‌امتیاز: اولین برتری بعدی نتیجه دیدار را تأیید می‌کند.",
          )}
        </Notice>
      )}
      <ErrorText error={error} />
      {policy.ending === "clock" && decision.expired && !locked && (
        <div className="button-row">
          <Notice>
            {t(
              "The period has ended. Recording hands is paused until this ruling.",
              "زمان دوره پایان یافته است. ثبت دست‌ها تا تعیین تکلیف متوقف است.",
            )}
          </Notice>
          {decision.winnerId && (
            <button
              type="button"
              className="button primary"
              onClick={() =>
                change(
                  () => finishGolClock(doc, match.id),
                  t("Finish timed Gol match", "پایان دیدار زمان‌دار گل یا پوچ"),
                )
              }
            >
              {t("Confirm timed result", "تأیید نتیجه زمان‌دار")}
            </button>
          )}
          {decision.tied && policy.overtime !== "manual" && (
            <button
              type="button"
              className="button primary"
              onClick={() =>
                change(
                  () => startGolOvertime(doc, match.id),
                  t("Start agreed overtime", "آغاز وقت اضافه توافق‌شده"),
                )
              }
            >
              {t("Start overtime", "آغاز وقت اضافه")}
            </button>
          )}
          {decision.tied && policy.overtime === "manual" && (
            <p>
              {t(
                "Use quick scorekeeping for the agreed tie ruling.",
                "برای تعیین تساوی طبق توافق از امتیازدهی سریع استفاده کنید.",
              )}
            </p>
          )}
        </div>
      )}
      <div className="two-columns">
        <Field label={t("Concealing team", "تیم پنهان‌کننده")}>
          <select
            value={concealing}
            disabled={locked}
            onChange={(event) => {
              setSecret("");
              change(
                () => setGolPossession(doc, match.id, event.target.value),
                t("Change possession", "تغییر مالکیت"),
              );
            }}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Concealed position (private)", "مکان گل (خصوصی)")}>
          <input
            type="password"
            autoComplete="off"
            maxLength={100}
            disabled={locked}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </Field>
      </div>
      <div className="two-columns">
        <Field label={t("Award points to", "امتیاز برای")}>
          <select
            value={awarded}
            disabled={locked}
            onChange={(event) => setAwarded(event.target.value)}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Hand points", "امتیاز دست")}>
          <input
            type="number"
            min={0}
            max={100}
            value={points}
            disabled={locked}
            onChange={(event) => setPoints(event.currentTarget.valueAsNumber)}
          />
        </Field>
      </div>
      {!!doc.rules.gol.cards.length && (
        <div className="two-columns">
          <Field label={t("Special card", "کارت ویژه")}>
            <select
              value={card}
              disabled={locked}
              onChange={(event) => setCard(event.target.value)}
            >
              <option value="">{t("No card", "بدون کارت")}</option>
              {doc.rules.gol.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.limit.toLocaleString(locale)})
                </option>
              ))}
            </select>
          </Field>
          {card && (
            <Field label={t("Team using the card", "تیم استفاده‌کننده کارت")}>
              <select
                value={cardUser}
                disabled={locked}
                onChange={(event) => setCardUser(event.target.value)}
              >
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          disabled={locked}
          onClick={() => {
            setSecret("");
            change(
              () =>
                setGolPossession(
                  doc,
                  match.id,
                  ids.find((id) => id !== concealing) ?? concealing,
                ),
              t("Switch possession", "تعویض مالکیت"),
            );
          }}
        >
          <ArrowLeftRight size={15} />
          {t("Switch possession", "تعویض مالکیت")}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={locked || (policy.ending === "clock" && decision.expired)}
          onClick={() =>
            change(
              () =>
                recordGolHand(doc, match.id, {
                  concealingTeamId: concealing,
                  awardedToId: awarded,
                  points,
                  cardId: card || undefined,
                  cardUsedById: card ? cardUser : undefined,
                  secret,
                }),
              t("Record referee hand", "ثبت دست توسط داور"),
            )
          }
        >
          <GolActionIcon action="hands" size={20} />
          {t("Record hand", "ثبت دست")}
        </button>
      </div>
      {!!match.hands?.length && (
        <ol className="hand-log">
          {match.hands.map((h, i) => (
            <li key={h.id}>
              <span>
                {t("Hand", "دست")} {(i + 1).toLocaleString(locale)}
              </span>
              <bdi>{name(h.awardedToId)}</bdi>
              <strong>
                {h.points.toLocaleString(locale, { signDisplay: "always" })}
              </strong>
              <button
                type="button"
                className="text-button"
                disabled={locked || i !== match.hands!.length - 1}
                aria-label={`${t("Undo hand", "واگرد دست")} ${(i + 1).toLocaleString(locale)}`}
                onClick={() =>
                  change(
                    () => undoGolHand(doc, match.id, h.id),
                    t("Correct referee hand", "اصلاح دست توسط داور"),
                    true,
                  )
                }
              >
                {t("Undo", "واگرد")}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
