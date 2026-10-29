import { useState } from "react";
import type { Match, MatchResult, Outcome, Tournament } from "../domain/types";
import {
  aggregateAwayScores,
  aggregateAwayWinner,
  aggregateScores,
} from "../domain/aggregate";
import { getCorrectionImpact, recordResult } from "../engine";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { saveAggregateProgress } from "../engine/aggregate";
import { ErrorText, Field, Modal, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";
import { MatchLifecycle } from "./MatchLifecycle";
import { MatchEditConflictNotice } from "./MatchEditConflictNotice";

export interface MatchControlProps {
  tournament: Tournament;
  match: Match;
  onChange: (doc: Tournament, action: string) => void;
  onClose: () => void;
  busy?: boolean;
  externalRevision?: number;
  stale?: boolean;
}

export function AggregateMatchControl({
  tournament: doc,
  match,
  onChange,
  onClose,
  busy = false,
  stale = false,
}: MatchControlProps) {
  const { t, locale } = useI18n();
  const policy = doc.stages.find((stage) => stage.id === match.stageId)!.config
    .aggregate!;
  const [legs, setLegs] = useState<number[][]>(
    match.result?.legs ?? match.aggregateProgress ?? [[0, 0]],
  );
  const [winner, setWinner] = useState(
    match.result?.aggregateTiebreakWinnerId ?? match.result?.winnerIds[0] ?? "",
  );
  const [outcome, setOutcome] = useState<Outcome>(
    match.result?.outcome ?? "played",
  );
  const [notes, setNotes] = useState(match.notes ?? "");
  const [referee, setReferee] = useState(match.referee ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState<MatchResult>();
  const entrants = match.slots.map((slot) =>
    doc.participants.find(
      (participant) => participant.id === slot.participantId,
    ),
  );
  const manual = outcome !== "played";
  let total: number[] = [],
    regulationTied = false;
  try {
    total = aggregateScores(legs);
    const sums = aggregateScores(legs.slice(0, policy.legs));
    regulationTied = sums[0] === sums[1];
  } catch {
    /* Validation is shown when saving. */
  }
  let awayWinner: string | undefined;
  try {
    awayWinner = aggregateAwayWinner(
      policy,
      entrants.map((entrant) => entrant?.id ?? ""),
      legs,
    );
  } catch {
    /* Saving reports invalid values. */
  }
  const maximum =
    policy.legs +
    (policy.tieBreak === "extra-leg" && regulationTied && !awayWinner ? 1 : 0);
  const tied = total.length === 2 && total[0] === total[1];
  const impact = getCorrectionImpact(doc, match.id).filter(
    tournamentMatchEvidence(doc),
  );
  function commit(result: MatchResult, confirmed = false) {
    try {
      const next = recordResult(doc, match.id, result, confirmed);
      const target = next.matches.find((item) => item.id === match.id)!;
      target.notes = notes;
      target.referee = referee;
      onChange(next, t("Record aggregate result", "ثبت نتیجه مجموع"));
      onClose();
    } catch (failure) {
      setError(failure);
    }
  }
  function save() {
    setError(undefined);
    try {
      const scores = manual ? [0, 0] : aggregateScores(legs);
      const index =
        doc.rules.scoring === "low"
          ? scores[0] < scores[1]
            ? 0
            : 1
          : scores[0] > scores[1]
            ? 0
            : 1;
      const result: MatchResult = {
        scores,
        winnerIds:
          !manual && awayWinner
            ? [awayWinner]
            : manual || tied
              ? winner
                ? [winner]
                : []
              : [entrants[index]!.id],
        outcome,
        recordedAt: new Date().toISOString(),
        ...(match.result?.fairPlay ? { fairPlay: match.result.fairPlay } : {}),
        ...(match.result?.metrics ? { metrics: match.result.metrics } : {}),
        ...(!manual
          ? {
              legs,
              ...(tied && winner && !awayWinner
                ? { aggregateTiebreakWinnerId: winner }
                : {}),
            }
          : {}),
      };
      if (match.result && impact.length) setPending(result);
      else commit(result);
    } catch (failure) {
      setError(failure);
    }
  }
  function progress() {
    try {
      const next = saveAggregateProgress(doc, match.id, legs);
      const target = next.matches.find((item) => item.id === match.id)!;
      target.notes = notes;
      target.referee = referee;
      onChange(
        next,
        t("Save aggregate leg progress", "ذخیره پیشرفت بازی‌های رفت و برگشت"),
      );
      onClose();
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <Modal
      wide
      title={t("Aggregate match control", "کنترل دیدار رفت و برگشت")}
      onClose={onClose}
    >
      {stale && <MatchEditConflictNotice />}
      <fieldset
        className="match-control-fieldset"
        disabled={busy || stale}
        aria-busy={busy}
      >
        <h3>{generatedMatchLabel(match, locale)}</h3>
        <Notice>
          {t(
            "Each row is one leg. Entrant columns stay in the same order in every leg. Scores are added. Saving progress does not advance a winner.",
            "هر ردیف یک بازی است. ترتیب ستون شرکت‌کنندگان در همه بازی‌ها ثابت می‌ماند. امتیازها جمع می‌شوند. ذخیره پیشرفت باعث صعود برنده نمی‌شود.",
          )}
        </Notice>
        <p>
          {policy.awayGoals
            ? t(
                "Away-goal tiebreak is enabled for regulation legs only. The first entrant hosts odd legs; the second hosts even legs. Away goals decide a tied regulation total before any extra leg.",
                "رفع تساوی با گل خارج از خانه فقط برای بازی‌های اصلی فعال است. شرکت‌کننده اول میزبان بازی‌های فرد و شرکت‌کننده دوم میزبان بازی‌های زوج است. در تساوی مجموع اصلی، گل خارج از خانه پیش از بازی اضافه تعیین‌کننده است.",
              )
            : t(
                "Away goals have no special weight.",
                "گل خارج از خانه وزن ویژه ندارد.",
              )}
        </p>
        {policy.awayGoals && total.length === 2 && (
          <p>
            {t(
              "Regulation away scores",
              "امتیاز خارج از خانه در بازی‌های اصلی",
            )}
            :{" "}
            {aggregateAwayScores(legs, policy.legs)
              .map((value) => new Intl.NumberFormat(locale).format(value))
              .join(" : ")}
            {awayWinner && (
              <>
                {" "}
                · {entrants.find((entrant) => entrant?.id === awayWinner)?.name}
              </>
            )}
          </p>
        )}
        <p>
          {policy.tieBreak === "extra-leg"
            ? t(
                "A tied regulation total requires one extra leg. If it is still tied, select the agreed tiebreak winner.",
                "تساوی مجموع بازی‌های اصلی به یک بازی اضافه نیاز دارد. اگر باز هم مساوی شد، برنده رفع تساوی توافق‌شده را انتخاب کنید.",
              )
            : t(
                "A tied total needs an explicit winner from the agreed tiebreak ruling.",
                "تساوی مجموع امتیاز به تعیین صریح برنده طبق رأی رفع تساوی توافق‌شده نیاز دارد.",
              )}
        </p>
        <Field label={t("Result ruling", "نوع رأی نتیجه")}>
          <select
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value as Outcome);
              setPending(undefined);
            }}
          >
            {(
              [
                ["played", "Played", "انجام‌شده"],
                ["forfeit", "Forfeit", "باخت انصرافی"],
                ["walkover", "Walkover", "برد بدون بازی"],
                ["no-show", "No-show", "عدم حضور"],
                ["disqualified", "Disqualified", "سلب صلاحیت"],
              ] as const
            ).map(([id, en, fa]) => (
              <option key={id} value={id}>
                {t(en, fa)}
              </option>
            ))}
          </select>
        </Field>
        {!manual && (
          <div>
            {legs.map((leg, index) => (
              <fieldset key={index} className="panel compact-panel">
                <legend>
                  {t("Leg", "بازی")}{" "}
                  {new Intl.NumberFormat(locale).format(index + 1)}
                </legend>
                <div className="two-columns">
                  {leg.map((score, side) => (
                    <Field
                      key={side}
                      label={`${entrants[side]?.name ?? t("Pending", "در انتظار")} / ${t("Leg", "بازی")} ${index + 1}`}
                    >
                      <input
                        type="number"
                        step="any"
                        min={-1e9}
                        max={1e9}
                        value={score}
                        onChange={(event) => {
                          setLegs(
                            legs.map((row, rowIndex) =>
                              rowIndex === index
                                ? row.map((value, column) =>
                                    column === side
                                      ? Number(event.target.value)
                                      : value,
                                  )
                                : row,
                            ),
                          );
                          setPending(undefined);
                        }}
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                disabled={legs.length >= maximum}
                onClick={() => setLegs([...legs, [0, 0]])}
              >
                {t("Add next leg", "افزودن بازی بعدی")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={legs.length <= 1}
                onClick={() => setLegs(legs.slice(0, -1))}
              >
                {t("Remove last leg", "حذف بازی آخر")}
              </button>
            </div>
            <p aria-live="polite">
              <b>
                {t("Aggregate", "مجموع")}:{" "}
                {total
                  .map((score) => new Intl.NumberFormat(locale).format(score))
                  .join(" : ")}
              </b>
            </p>
          </div>
        )}
        {(manual || (tied && !awayWinner)) && (
          <Field label={t("Ruling winner", "برنده طبق رأی")}>
            <select
              value={winner}
              onChange={(event) => {
                setWinner(event.target.value);
                setPending(undefined);
              }}
            >
              <option value="">{t("Choose winner", "انتخاب برنده")}</option>
              {entrants.map(
                (entrant) =>
                  entrant && (
                    <option key={entrant.id} value={entrant.id}>
                      {entrant.name}
                    </option>
                  ),
              )}
            </select>
          </Field>
        )}
        <Field label={t("Referee", "داور")}>
          <input
            value={referee}
            maxLength={240}
            onChange={(event) => setReferee(event.target.value)}
          />
        </Field>
        <Field label={t("Private match notes", "یادداشت خصوصی دیدار")}>
          <textarea
            value={notes}
            maxLength={10000}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <ErrorText error={error} />
        {pending ? (
          <Notice danger>
            <p>
              {t(
                "Confirm reopening these dependent results. The previous revision remains recoverable.",
                "بازگشایی نتایج وابسته زیر را تأیید کنید. نسخه قبلی قابل بازیابی می‌ماند.",
              )}
            </p>
            <ul>
              {impact.map((item) => (
                <li key={item.id}>{generatedMatchLabel(item, locale)}</li>
              ))}
            </ul>
            <div className="button-row">
              <button
                className="button danger"
                onClick={() => commit(pending, true)}
              >
                {t(
                  "Confirm correction and reset dependents",
                  "تأیید اصلاح و بازنشانی وابسته‌ها",
                )}
              </button>
              <button
                className="button secondary"
                onClick={() => setPending(undefined)}
              >
                {t("Keep current result", "حفظ نتیجه فعلی")}
              </button>
            </div>
          </Notice>
        ) : (
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={!!match.result || manual}
              onClick={progress}
            >
              {t("Save leg progress", "ذخیره پیشرفت بازی")}
            </button>
            <button
              className="button primary"
              disabled={
                entrants.some((entrant) => !entrant) ||
                match.status === "bye" ||
                match.status === "canceled"
              }
              onClick={save}
            >
              {t("Confirm aggregate result", "تأیید نتیجه مجموع")}
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
