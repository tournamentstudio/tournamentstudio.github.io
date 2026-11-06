import { useState } from "react";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import type { Outcome, MatchResult } from "../domain/types";
import { RefereeMode } from "./gol/RefereeMode";
import { RunTimer } from "../timing/RunTimer";
import { MatchMetricsEditor } from "../scoring/MatchMetricsEditor";
import {
  validateMetrics,
  weightedScores,
  type MetricValues,
} from "../scoring/metrics";
import { getCorrectionImpact, recordResult } from "../engine";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { Field, Notice, ErrorText, Modal } from "../components/ui";
import { useI18n, generatedMatchLabel, groupLabel } from "../i18n";
import { getTheme, themeStyle } from "../themes";
import { GameIdentity } from "../themes/ThemeMotif";
import { GameIcon } from "../themes/GameIcon";
import "./game-experience.css";
import {
  AggregateMatchControl,
  type MatchControlProps,
} from "./AggregateMatchControl";
import { MatchLifecycle } from "./MatchLifecycle";
import { MatchEditConflictNotice } from "./MatchEditConflictNotice";

export function MatchControl(props: MatchControlProps) {
  const [editing, setEditing] = useState(() => ({
    tournament: props.tournament,
    match: props.match,
    externalRevision: props.externalRevision,
  }));
  const stale = editing.externalRevision !== props.externalRevision;
  if (
    !stale &&
    (editing.tournament !== props.tournament || editing.match !== props.match)
  )
    setEditing({
      tournament: props.tournament,
      match: props.match,
      externalRevision: props.externalRevision,
    });
  // Keep the draft's entrant names and scoring policy together after an
  // external reload. Local referee writes keep the same editing session.
  const current = stale
    ? { ...props, tournament: editing.tournament, match: editing.match, stale }
    : props;
  return current.tournament.stages.find(
    (stage) => stage.id === current.match.stageId,
  )?.config.aggregate ? (
    <AggregateMatchControl {...current} />
  ) : (
    <StandardMatchControl {...current} />
  );
}

function StandardMatchControl({
  tournament: doc,
  match,
  onChange,
  onClose,
  busy = false,
  stale = false,
}: MatchControlProps) {
  const { t, locale, number } = useI18n();
  const entrants = match.slots.map((s) =>
    doc.participants.find((p) => p.id === s.participantId),
  );
  const [scores, setScores] = useState(
    match.result?.scores ?? match.liveScores ?? match.slots.map(() => 0),
  );
  const [outcome, setOutcome] = useState<Outcome>(
    match.result?.outcome ?? "played",
  );
  const savedManualWinner =
    doc.rules.scoring === "manual" ||
    ["forfeit", "walkover", "no-show", "disqualified"].includes(
      match.result?.outcome ?? "",
    )
      ? (match.result?.winnerIds[0] ?? "")
      : "";
  const [winner, setWinner] = useState(savedManualWinner);
  const [sets, setSets] = useState(
    (match.result?.sets ?? []).map((s) => s.join(":")).join("\n"),
  );
  const [notes, setNotes] = useState(match.notes ?? "");
  const [referee, setReferee] = useState(match.referee ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState<MatchResult>();
  const [detailed, setDetailed] = useState(false);
  const [recordFairPlay, setRecordFairPlay] = useState(
    Boolean(match.result?.fairPlay) ||
      doc.rules.tieBreakers.includes("fair-play"),
  );
  const [fairPlay, setFairPlay] = useState(
    match.result?.fairPlay ?? match.slots.map(() => 0),
  );
  const [metrics, setMetrics] = useState<MetricValues>(
    match.result?.metrics ?? {},
  );
  const manualOutcome = [
    "forfeit",
    "walkover",
    "no-show",
    "disqualified",
  ].includes(outcome);
  const calculated = doc.rules.scoring === "weighted" && !manualOutcome;
  const setScoring = doc.rules.scoring === "sets" && !manualOutcome;
  let displayScores = scores;
  if (setScoring) {
    const enteredSets = sets
      .trim()
      .split(/\n/)
      .map((line) => line.split(":").map(Number));
    displayScores = entrants.map(
      (_, index) =>
        enteredSets.filter(
          (set) =>
            set.length === entrants.length &&
            set.every((value) => Number.isFinite(value) && value >= 0) &&
            set[index] === Math.max(...set) &&
            set.filter((value) => value === set[index]).length === 1,
        ).length,
    );
  }
  if (calculated) {
    try {
      displayScores = weightedScores(
        doc.rules.metricDefinitions ?? [],
        metrics,
        entrants.length,
      );
    } catch {
      displayScores = [];
    }
  }
  const lowScore =
    (doc.rules.scoring === "weighted" &&
      doc.rules.weightedDirection === "low") ||
    doc.rules.scoring === "low" ||
    doc.rules.scoring === "time" ||
    doc.stages.find((s) => s.id === match.stageId)?.format === "time-trial";
  const impact = getCorrectionImpact(doc, match.id).filter(
    tournamentMatchEvidence(doc),
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
      const values = validateMetrics(
        doc.rules.metricDefinitions ?? [],
        metrics,
        entrants.length,
      );
      const officialScores = calculated
        ? weightedScores(
            doc.rules.metricDefinitions ?? [],
            values,
            entrants.length,
          )
        : scores;
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
          const best = lowScore
            ? Math.min(...officialScores)
            : Math.max(...officialScores);
          winnerIds = entrants
            .filter((_, i) => officialScores[i] === best)
            .map((p) => p!.id);
        }
      }
      const isMulti = entrants.length > 2;
      if (winnerIds.length > 1 && !isMulti && outcome !== "draw")
        throw new Error(
          t(
            "Scores are tied. Choose Draw if allowed, or enter the scores after the tiebreak.",
            "امتیازها برابر است. اگر تساوی مجاز است، آن را انتخاب کنید؛ در غیر این صورت امتیازهای پس از رفع تساوی را وارد کنید.",
          ),
        );
      const result: MatchResult = {
        scores: officialScores,
        ...(recordFairPlay ? { fairPlay } : {}),
        ...(Object.keys(values).length ? { metrics: values } : {}),
        winnerIds,
        outcome,
        sets: setScores,
        recordedAt: new Date().toISOString(),
      };
      if (isMulti) {
        result.placements = officialScores.map(
          (score) =>
            1 +
            officialScores.filter((s) => (lowScore ? s < score : s > score))
              .length,
        );
      }
      if (match.result && impact.length) setPending(result);
      else commit(result);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Modal
      wide
      title={
        match.result
          ? t("Edit result", "ویرایش نتیجه")
          : t("Enter result", "ثبت نتیجه")
      }
      onClose={onClose}
    >
      {stale && <MatchEditConflictNotice />}
      <fieldset
        className="match-control-fieldset game-match-control"
        disabled={busy || stale}
        aria-busy={busy}
        onChange={() => setPending(undefined)}
        data-sport={doc.sport}
        style={themeStyle(doc.theme)}
      >
        <div
          className="game-match-banner themed"
          data-pattern={getTheme(doc.theme.preset).pattern}
        >
          <GameIdentity
            sport={doc.sport}
            preset={doc.theme.preset}
            locale={locale}
            compact
          />
          {doc.sport === "gol-ya-pooch" && (
            <span className="game-target">
              {t("Target", "امتیاز هدف")}{" "}
              <strong>{doc.rules.targetScore}</strong>
            </span>
          )}
        </div>
        <div className="match-modal-subtitle">
          {generatedMatchLabel(match, locale)} · {t("Round", "دور")}{" "}
          {match.round}
          {match.group && ` · ${groupLabel(match.group, locale)}`}
        </div>
        <ErrorText error={error} />
        {doc.sport === "gol-ya-pooch" && (
          <div className="segmented">
            <button
              className={!detailed ? "selected" : ""}
              aria-pressed={!detailed}
              onClick={() => setDetailed(false)}
            >
              {t("Quick scorekeeping", "امتیازدهی سریع")}
            </button>
            <button
              className={detailed ? "selected" : ""}
              aria-pressed={detailed}
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
        {doc.stages.find((s) => s.id === match.stageId)?.format ===
          "time-trial" && (
          <RunTimer
            tournament={doc}
            match={match}
            onChange={onChange}
            onScores={setScores}
          />
        )}
        <div
          className={`score-entry ${entrants.length > 2 ? "score-entry-multi" : ""}`}
        >
          {entrants.map((p, i) => (
            <div className="score-side" key={i}>
              <span className="avatar large">
                {doc.sport === "gol-ya-pooch" ? (
                  <GameIcon sport={doc.sport} size={44} />
                ) : (
                  (p?.name.slice(0, 2) ?? "?")
                )}
              </span>
              <bdi>{p?.name ?? t("Awaiting qualifier", "در انتظار صعود")}</bdi>
              <input
                aria-label={`${t("Score", "امتیاز")} ${p?.name ?? i + 1}`}
                type="number"
                min={-1000000000}
                max={1000000000}
                step="any"
                value={displayScores[i] ?? ""}
                readOnly={calculated || setScoring}
                onChange={(e) => {
                  if (!manualOutcome && doc.rules.scoring !== "manual")
                    setWinner("");
                  setScores(
                    scores.map((s, j) =>
                      j === i ? Number(e.target.value) : s,
                    ),
                  );
                }}
              />
              {setScoring && (
                <span className="score-unit">
                  {t("Sets won", "ست‌های برده")}
                </span>
              )}
              {doc.sport === "gol-ya-pooch" && (
                <div className="gol-target-track">
                  <progress
                    aria-label={`${p?.name ?? i + 1}: ${t("Progress toward target", "پیشرفت تا امتیاز هدف")}`}
                    max={Math.max(1, doc.rules.targetScore)}
                    value={Math.min(
                      Math.max(0, scores[i] ?? 0),
                      Math.max(1, doc.rules.targetScore),
                    )}
                  />
                  <span dir="ltr">
                    {number(scores[i] ?? 0)} / {number(doc.rules.targetScore)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        {setScoring && (
          <div className="primary-set-entry">
            <Field
              label={t(
                "Set scores (one set per line)",
                "امتیاز ست‌ها (هر ست در یک خط)",
              )}
            >
              <textarea
                rows={3}
                value={sets}
                dir="ltr"
                onChange={(event) => {
                  setSets(event.target.value);
                  setWinner("");
                }}
                placeholder="21:18"
                aria-describedby="set-score-help"
              />
            </Field>
            <p className="muted" id="set-score-help">
              {t(
                "Use the participant order shown above. For example, 21:18 on one line and 21:16 on the next. Sets won are calculated for you.",
                "امتیازها را به ترتیب شرکت‌کنندگان بالا بنویسید؛ برای نمونه 21:18 در یک خط و 21:16 در خط بعد. تعداد ست‌های برده خودکار محاسبه می‌شود.",
              )}
            </p>
          </div>
        )}
        {calculated && (
          <Notice>
            {t(
              "Scores are calculated from the weighted inputs below. Missing inputs leave the score empty. Manual rulings may use a declared winner and awarded score.",
              "امتیازها از داده‌های وزن‌دار زیر محاسبه می‌شوند. با داده ناقص امتیاز خالی می‌ماند. حکم دستی می‌تواند برنده و امتیاز تعیین شده داشته باشد.",
            )}
          </Notice>
        )}
        {!!doc.rules.metricDefinitions?.length && (
          <MatchMetricsEditor
            definitions={doc.rules.metricDefinitions}
            values={metrics}
            onChange={setMetrics}
            names={entrants.map(
              (p) => p?.name ?? t("Awaiting qualifier", "در انتظار صعود"),
            )}
            locale={locale}
          />
        )}
        <div className="two-columns">
          <Field label={t("Result type", "نوع نتیجه")}>
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as Outcome);
                if (
                  doc.rules.scoring !== "manual" &&
                  ["played", "draw"].includes(e.target.value)
                )
                  setWinner("");
              }}
            >
              {[
                ["played", "Played normally", "بازی عادی"],
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
          <Field label={t("Winner", "برنده")}>
            <select
              value={winner}
              disabled={outcome === "draw"}
              onChange={(e) => setWinner(e.target.value)}
            >
              <option value="">
                {manualOutcome || doc.rules.scoring === "manual"
                  ? t("Choose winner", "انتخاب برنده")
                  : t("Calculate from scores", "محاسبه از امتیازها")}
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
            {setScoring
              ? t("Referee and private notes", "داور و یادداشت خصوصی")
              : t(
                  "Sets, referee, and private notes",
                  "ست‌ها، داور و یادداشت خصوصی",
                )}
          </summary>
          <div className="form-stack">
            <label className="check-row">
              <input
                type="checkbox"
                checked={recordFairPlay}
                onChange={(event) => setRecordFairPlay(event.target.checked)}
              />
              {t("Record fair-play penalties", "ثبت جریمه بازی جوانمردانه")}
            </label>
            {recordFairPlay && (
              <>
                <p>
                  {t(
                    "Enter the agreed penalty points for each entrant. Zero confirms no penalty. Values are public and lower totals rank first when this tiebreaker is enabled.",
                    "امتیاز جریمه توافق شده هر شرکت‌کننده را وارد کنید. صفر، نبود جریمه را تأیید می‌کند. مقدارها عمومی هستند و با فعال بودن این معیار، مجموع کمتر رتبه بهتری دارد.",
                  )}
                </p>
                <div className="two-columns">
                  {entrants.map((participant, index) => (
                    <Field
                      key={index}
                      label={`${t("Fair-play penalties", "جریمه بازی جوانمردانه")}: ${participant?.name ?? index + 1}`}
                    >
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        step="any"
                        value={fairPlay[index]}
                        onChange={(event) =>
                          setFairPlay(
                            fairPlay.map((value, i) =>
                              i === index ? event.target.valueAsNumber : value,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              </>
            )}
            {!setScoring && (
              <Field
                label={t(
                  "Set scores (one set per line)",
                  "امتیاز ست‌ها (هر ست در یک خط)",
                )}
              >
                <textarea
                  rows={3}
                  dir="ltr"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                  placeholder="21:18"
                />
              </Field>
            )}
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
                  "Later matches need to be cleared.",
                  "نتایج دیدارهای بعدی باید پاک شوند.",
                )}
              </b>
              <p>
                {t(
                  "Saving this correction clears the results and live progress listed below. You can restore the previous version from History.",
                  "با ذخیره این اصلاح، نتایج و پیشرفت زنده دیدارهای زیر پاک می‌شود. نسخه قبلی از تاریخچه قابل بازیابی است.",
                )}
              </p>
              <ul>
                {impact.map((m) => (
                  <li key={m.id}>{generatedMatchLabel(m, locale)}</li>
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
                  "Save correction and clear later matches",
                  "ذخیره اصلاح و پاک کردن دیدارهای بعدی",
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
                setScores(
                  match.result?.scores ??
                    match.liveScores ??
                    match.slots.map(() => 0),
                );
                setOutcome(match.result?.outcome ?? "played");
                setWinner(savedManualWinner);
                setSets(
                  (match.result?.sets ?? [])
                    .map((set) => set.join(":"))
                    .join("\n"),
                );
                setNotes(match.notes ?? "");
                setReferee(match.referee ?? "");
                setMetrics(match.result?.metrics ?? {});
                setFairPlay(match.result?.fairPlay ?? match.slots.map(() => 0));
                setRecordFairPlay(
                  Boolean(match.result?.fairPlay) ||
                    doc.rules.tieBreakers.includes("fair-play"),
                );
                setError(undefined);
              }}
            >
              <RotateCcw size={16} />
              {t("Discard edits", "لغو ویرایش‌ها")}
            </button>
            <button
              className="button primary"
              disabled={
                entrants.some((p) => !p) ||
                match.status === "bye" ||
                match.status === "canceled"
              }
              onClick={save}
            >
              <Check size={17} />
              {match.result
                ? t("Save changes", "ذخیره تغییرات")
                : t("Save result", "ذخیره نتیجه")}
            </button>
          </div>
        )}
        <MatchLifecycle
          tournament={doc}
          match={match}
          onChange={onChange}
          onClose={onClose}
        />
      </fieldset>
    </Modal>
  );
}
