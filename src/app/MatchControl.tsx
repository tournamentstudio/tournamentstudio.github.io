import { useState } from "react";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import type { Match, Tournament, Outcome, MatchResult } from "../domain/types";
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
import { GameIdentity, ThemeMotif } from "../themes/ThemeMotif";
import "./game-experience.css";
import {
  AggregateMatchControl,
  type MatchControlProps,
} from "./AggregateMatchControl";
import { MatchLifecycle } from "./MatchLifecycle";

export function MatchControl(props: MatchControlProps) {
  return props.tournament.stages.find(
    (stage) => stage.id === props.match.stageId,
  )?.config.aggregate ? (
    <AggregateMatchControl {...props} />
  ) : (
    <StandardMatchControl {...props} />
  );
}

function StandardMatchControl({
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
  const { t, locale } = useI18n();
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
  let displayScores = scores;
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
  const impact = getCorrectionImpact(doc, match.id).filter(tournamentMatchEvidence(doc));
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
            "Scores are tied. Select a draw where allowed or choose a winner using the agreed tiebreak rule.",
            "امتیازها برابر است. در صورت مجاز بودن تساوی را انتخاب کنید یا طبق قانون رفع تساوی برنده را تعیین کنید.",
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
    <Modal wide title={t("Match control", "کنترل دیدار")} onClose={onClose}>
      <fieldset
        className="match-control-fieldset game-match-control"
        disabled={busy}
        aria-busy={busy}
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
                  <ThemeMotif preset={doc.theme.preset} variant="emblem" />
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
                readOnly={calculated}
                onChange={(e) =>
                  setScores(
                    scores.map((s, j) =>
                      j === i ? Number(e.target.value) : s,
                    ),
                  )
                }
              />
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
                  <span>
                    {scores[i] ?? 0} / {doc.rules.targetScore}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
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
                setMetrics(match.result?.metrics ?? {});
                setFairPlay(match.result?.fairPlay ?? match.slots.map(() => 0));
                setRecordFairPlay(
                  Boolean(match.result?.fairPlay) ||
                    doc.rules.tieBreakers.includes("fair-play"),
                );
              }}
            >
              <RotateCcw size={16} />
              {t("Reset form", "بازنشانی فرم")}
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
              {t("Confirm result", "تأیید نتیجه")}
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
