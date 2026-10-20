import { useEffect, useState } from "react";
import {
  Check,
  RotateCcw,
  ShieldCheck,
  Play,
  Pause,
  Plus,
  ArrowLeftRight,
  Timer,
} from "lucide-react";
import type { Match, Tournament, Outcome, MatchResult } from "../domain/types";
import { uid } from "../domain/types";
import { getCorrectionImpact, recordResult } from "../engine";
import { Field, Notice, ErrorText, Modal } from "../components/ui";
import { useI18n } from "../i18n";

export function MatchControl({
  tournament: doc,
  match,
  onChange,
  onClose,
  busy = false,
}: {
  tournament: Tournament;
  match: Match;
  onChange: (t: Tournament, action: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const entrants = match.slots.map((s) =>
    doc.participants.find((p) => p.id === s.participantId),
  );
  const [scores, setScores] = useState(
    match.result?.scores ?? match.liveScores ?? match.slots.map(() => 0),
  );
  const [outcome, setOutcome] = useState<Outcome>(
    match.result?.outcome ?? "played",
  );
  const [winner, setWinner] = useState(match.result?.winnerIds[0] ?? "");
  const [sets, setSets] = useState(
    (match.result?.sets ?? []).map((s) => s.join(":")).join("\n"),
  );
  const [notes, setNotes] = useState(match.notes ?? "");
  const [referee, setReferee] = useState(match.referee ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState<MatchResult>();
  const [detailed, setDetailed] = useState(false);
  const lowScore =
    doc.rules.scoring === "low" ||
    doc.rules.scoring === "time" ||
    doc.stages.find((s) => s.id === match.stageId)?.format === "time-trial";
  const impact = getCorrectionImpact(doc, match.id).filter(
    (m) => m.result || m.status === "live",
  );
  function commit(result: MatchResult, confirmed = false) {
    try {
      const next = recordResult(doc, match.id, result, confirmed);
      const target = next.matches.find((m) => m.id === match.id)!;
      target.notes = notes;
      target.referee = referee;
      onChange(next, t("Record match result", "ثبت نتیجه دیدار"));
      onClose();
    } catch (e) {
      setError(e);
    }
  }
  function save() {
    try {
      const setScores = sets.trim()
        ? sets
            .trim()
            .split(/\n/)
            .map((line) => line.split(":").map(Number))
        : undefined;
      if (
        setScores?.some(
          (s) =>
            s.length !== entrants.length ||
            s.some((n) => !Number.isFinite(n) || n < 0),
        )
      )
        throw new Error(
          t(
            "Enter each set as scores separated by a colon, for example 21:18.",
            "امتیاز هر ست را با دونقطه جدا کنید، مانند ۲۱:۱۸.",
          ),
        );
      let winnerIds: string[] = [];
      if (outcome !== "draw") {
        if (winner) winnerIds = [winner];
        else if (doc.rules.scoring === "sets" && setScores?.length) {
          const totals = scores.map(
            (_, i) =>
              setScores.filter(
                (s) =>
                  s[i] === Math.max(...s) &&
                  s.filter((v) => v === s[i]).length === 1,
              ).length,
          );
          const best = Math.max(...totals);
          winnerIds = entrants
            .filter((_, i) => totals[i] === best)
            .map((p) => p!.id);
        } else {
          const best = lowScore ? Math.min(...scores) : Math.max(...scores);
          winnerIds = entrants
            .filter((_, i) => scores[i] === best)
            .map((p) => p!.id);
        }
      }
      const isMulti = entrants.length > 2;
      if (winnerIds.length > 1 && !isMulti && outcome !== "draw")
        throw new Error(
          t(
            "Scores are tied. Select a draw where allowed or choose a winner using the agreed tiebreak rule.",
            "امتیازها برابر است. در صورت مجاز بودن تساوی را انتخاب کنید یا طبق قانون رفع تساوی برنده را تعیین کنید.",
          ),
        );
      const result: MatchResult = {
        scores,
        winnerIds,
        outcome,
        sets: setScores,
        recordedAt: new Date().toISOString(),
      };
      if (isMulti) {
        result.placements = scores.map(
          (score) =>
            1 + scores.filter((s) => (lowScore ? s < score : s > score)).length,
        );
      }
      if (match.result && impact.length) setPending(result);
      else commit(result);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Modal wide title={t("Match control", "کنترل دیدار")} onClose={onClose}>
      <fieldset
        className="match-control-fieldset"
        disabled={busy}
        aria-busy={busy}
      >
        <div className="match-modal-subtitle">
          {match.label} · {t("Round", "دور")} {match.round}
          {match.group && ` · ${match.group}`}
        </div>
        <ErrorText error={error} />
        {doc.sport === "gol-ya-pooch" && (
          <div className="segmented">
            <button
              className={!detailed ? "selected" : ""}
              onClick={() => setDetailed(false)}
            >
              {t("Quick scorekeeping", "امتیازدهی سریع")}
            </button>
            <button
              className={detailed ? "selected" : ""}
              onClick={() => setDetailed(true)}
            >
              <ShieldCheck size={15} />
              {t("Referee mode", "حالت داور")}
            </button>
          </div>
        )}
        {detailed ? (
          <RefereeMode
            tournament={doc}
            match={match}
            onChange={onChange}
            onScores={setScores}
          />
        ) : null}
        <div
          className={`score-entry ${entrants.length > 2 ? "score-entry-multi" : ""}`}
        >
          {entrants.map((p, i) => (
            <div className="score-side" key={i}>
              <span className="avatar large">{p?.name.slice(0, 2) ?? "?"}</span>
              <bdi>{p?.name ?? t("Awaiting qualifier", "در انتظار صعود")}</bdi>
              <input
                aria-label={`${t("Score", "امتیاز")} ${p?.name ?? i + 1}`}
                type="number"
                min={0}
                max={1000000}
                step="any"
                value={scores[i] ?? 0}
                onChange={(e) =>
                  setScores(
                    scores.map((s, j) =>
                      j === i ? Number(e.target.value) : s,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
        <div className="two-columns">
          <Field label={t("Result type", "نوع نتیجه")}>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome)}
            >
              {[
                ["played", "Played", "بازی شده"],
                ["draw", "Draw", "تساوی"],
                ["forfeit", "Forfeit", "انصراف"],
                ["walkover", "Walkover", "برد بدون بازی"],
                ["no-show", "No-show", "عدم حضور"],
                ["disqualified", "Disqualified", "محرومیت"],
              ]
                .filter(([id]) => id !== "draw" || doc.rules.allowDraws)
                .map(([id, en, fa]) => (
                  <option key={id} value={id}>
                    {t(en, fa)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("Winner decision", "تعیین برنده")}>
            <select value={winner} onChange={(e) => setWinner(e.target.value)}>
              <option value="">
                {t("Calculate from scores", "محاسبه از امتیازها")}
              </option>
              {entrants.filter(Boolean).map((p) => (
                <option key={p!.id} value={p!.id}>
                  {p!.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <details className="details-box">
          <summary>
            {t(
              "Sets, referee, and private notes",
              "ست‌ها، داور و یادداشت خصوصی",
            )}
          </summary>
          <div className="form-stack">
            <Field
              label={t(
                "Set scores (one set per line)",
                "امتیاز ست‌ها (هر ست در یک خط)",
              )}
            >
              <textarea
                rows={3}
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                placeholder="21:18"
              />
            </Field>
            <Field label={t("Referee", "داور")}>
              <input
                maxLength={180}
                value={referee}
                onChange={(e) => setReferee(e.target.value)}
              />
            </Field>
            <Field
              label={t("Private organizer notes", "یادداشت خصوصی برگزارکننده")}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
              />
            </Field>
          </div>
        </details>
        {pending && (
          <div className="correction-warning">
            <Notice danger>
              <b>
                {t(
                  "This correction affects played matches.",
                  "این اصلاح بر دیدارهای انجام شده اثر دارد.",
                )}
              </b>
              <p>
                {t(
                  "The following results will be cleared. The saved previous revision remains recoverable from History.",
                  "نتایج زیر پاک می‌شوند. نسخه قبلی ذخیره شده از تاریخچه قابل بازیابی است.",
                )}
              </p>
              <ul>
                {impact.map((m) => (
                  <li key={m.id}>{m.label}</li>
                ))}
              </ul>
            </Notice>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setPending(undefined)}
              >
                {t("Keep current result", "حفظ نتیجه فعلی")}
              </button>
              <button
                className="button danger"
                onClick={() => commit(pending, true)}
              >
                {t(
                  "Confirm correction and reset dependents",
                  "تأیید اصلاح و بازنشانی وابسته‌ها",
                )}
              </button>
            </div>
          </div>
        )}
        {!pending && (
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setScores(match.result?.scores ?? match.slots.map(() => 0));
                setWinner(match.result?.winnerIds[0] ?? "");
              }}
            >
              <RotateCcw size={16} />
              {t("Reset form", "بازنشانی فرم")}
            </button>
            <button
              className="button primary"
              disabled={entrants.some((p) => !p) || match.status === "bye"}
              onClick={save}
            >
              <Check size={17} />
              {t("Confirm result", "تأیید نتیجه")}
            </button>
          </div>
        )}
      </fieldset>
    </Modal>
  );
}

function RefereeMode({
  tournament: doc,
  match,
  onChange,
  onScores,
}: {
  tournament: Tournament;
  match: Match;
  onChange: (t: Tournament, a: string) => void;
  onScores: (s: number[]) => void;
}) {
  const { t } = useI18n();
  const ids = match.slots.map((s) => s.participantId!).filter(Boolean);
  const [concealing, setConcealing] = useState(ids[0] ?? "");
  const [secret, setSecret] = useState(match.private?.concealedPosition ?? "");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [awarded, setAwarded] = useState(ids[0] ?? "");
  const [points, setPoints] = useState(doc.rules.gol.handPoints);
  const [card, setCard] = useState("");
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);
  function hand() {
    try {
      if (
        ids.length !== 2 ||
        !ids.includes(concealing) ||
        !ids.includes(awarded)
      )
        throw new Error(
          t(
            "Assign two teams before recording a hand.",
            "پیش از ثبت دست، دو تیم را تعیین کنید.",
          ),
        );
      if (!Number.isFinite(points) || points < 0 || points > 100)
        throw new Error(
          t(
            "Hand points must be between 0 and 100.",
            "امتیاز دست باید بین ۰ و ۱۰۰ باشد.",
          ),
        );
      const definition = doc.rules.gol.cards.find((c) => c.id === card);
      if (
        definition &&
        (match.hands ?? []).filter(
          (h) => h.cardId === card && h.awardedToId === awarded,
        ).length >= definition.limit
      )
        throw new Error(
          t(
            "This team has reached the card use limit.",
            "این تیم به سقف استفاده از کارت رسیده است.",
          ),
        );
      const next = structuredClone(doc);
      const m = next.matches.find((m) => m.id === match.id)!;
      if (m.result)
        throw new Error(
          t(
            "The hand log is locked after confirmation. Correct official scores through quick scorekeeping.",
            "گزارش دست‌ها پس از تأیید قفل می‌شود. امتیاز رسمی را از امتیازدهی سریع اصلاح کنید.",
          ),
        );
      m.private = { ...m.private, concealedPosition: secret };
      m.status = "live";
      next.status = "in-progress";
      m.hands = [
        ...(m.hands ?? []),
        {
          id: uid(),
          at: new Date().toISOString(),
          concealingTeamId: concealing,
          guessingTeamId: ids.find((id) => id !== concealing) ?? "",
          awardedToId: awarded,
          points: points + (definition?.points ?? 0),
          action: definition?.name ?? t("Hand result", "نتیجه دست"),
          cardId: card || undefined,
        },
      ];
      m.liveScores = ids.map((id) =>
        m
          .hands!.filter((h) => h.awardedToId === id)
          .reduce((sum, h) => sum + h.points, 0),
      );
      onScores(m.liveScores);
      onChange(next, t("Record referee hand", "ثبت دست توسط داور"));
      setError(undefined);
    } catch (e) {
      setError(e);
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
          <Timer size={16} />
          <b>
            {Math.floor(elapsed / 60)
              .toString()
              .padStart(2, "0")}
            :{(elapsed % 60).toString().padStart(2, "0")}
          </b>
          <button
            className="icon-button"
            onClick={() => setRunning(!running)}
            aria-label={
              running
                ? t("Pause timer", "توقف زمان")
                : t("Start timer", "شروع زمان")
            }
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      </div>
      <Notice>
        {t(
          "The concealed position and hand log are excluded from spectator projections. The local timer resets when this dialog closes.",
          "مکان گل و گزارش دست‌ها از نمای تماشاگر حذف می‌شوند. زمان‌سنج محلی با بستن پنجره بازنشانی می‌شود.",
        )}
      </Notice>
      <ErrorText error={error} />
      <div className="two-columns">
        <Field label={t("Concealing team", "تیم پنهان‌کننده")}>
          <select
            value={concealing}
            onChange={(e) => setConcealing(e.target.value)}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {doc.participants.find((p) => p.id === id)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Concealed position (private)", "مکان گل (خصوصی)")}>
          <input
            type="password"
            autoComplete="off"
            maxLength={100}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </Field>
      </div>
      <div className="two-columns">
        <Field label={t("Award points to", "امتیاز برای")}>
          <select value={awarded} onChange={(e) => setAwarded(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {doc.participants.find((p) => p.id === id)?.name}
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
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </Field>
      </div>
      {doc.rules.gol.cards.length > 0 && (
        <Field label={t("Special card", "کارت ویژه")}>
          <select value={card} onChange={(e) => setCard(e.target.value)}>
            <option value="">{t("No card", "بدون کارت")}</option>
            {doc.rules.gol.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.limit})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="button-row">
        <button
          className="button secondary"
          onClick={() =>
            setConcealing(ids.find((id) => id !== concealing) ?? concealing)
          }
        >
          <ArrowLeftRight size={15} />
          {t("Switch possession", "تعویض مالکیت")}
        </button>
        <button
          className="button primary"
          disabled={Boolean(match.result)}
          onClick={hand}
        >
          <Plus size={15} />
          {t("Record hand", "ثبت دست")}
        </button>
      </div>
      {!!match.hands?.length && (
        <ol className="hand-log">
          {match.hands.map((h, i) => (
            <li key={h.id}>
              <span>
                {t("Hand", "دست")} {i + 1}
              </span>
              <bdi>
                {doc.participants.find((p) => p.id === h.awardedToId)?.name}
              </bdi>
              <strong>+{h.points}</strong>
              <button
                className="text-button"
                disabled={Boolean(match.result)}
                onClick={() => {
                  const next = structuredClone(doc);
                  const m = next.matches.find((x) => x.id === match.id)!;
                  if (m.result) return;
                  m.hands = m.hands?.filter((x) => x.id !== h.id);
                  m.liveScores = ids.map((id) =>
                    (m.hands ?? [])
                      .filter((x) => x.awardedToId === id)
                      .reduce((s, x) => s + x.points, 0),
                  );
                  onScores(m.liveScores);
                  onChange(
                    next,
                    t("Correct referee hand", "اصلاح دست توسط داور"),
                  );
                }}
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
