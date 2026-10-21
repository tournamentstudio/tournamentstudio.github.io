import { useEffect, useRef, useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n, generatedMatchLabel } from "../i18n";
import {
  freezePrediction,
  predictionRows,
  predictionStarted,
  scopedMatches,
  type Prediction,
  type PredictionChoices,
  type PredictionChoice,
} from "./predictions";

export function PredictionBuilder({
  tournament,
  onFreeze,
}: {
  tournament: Tournament;
  onFreeze: (prediction: Prediction) => void;
}) {
  const { t, locale } = useI18n();
  const stages = tournament.stages.filter((stage) =>
    tournament.matches.some((match) => match.stageId === stage.id),
  );
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<PredictionChoices>({});
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const current = useRef(tournament);
  current.current = tournament;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  let rows: ReturnType<typeof predictionRows> = [];
  let structureError: unknown;
  let started = false;
  let round: number | undefined;
  if (stageId)
    try {
      const scope = scopedMatches(tournament, stageId).scope;
      round = scope.kind === "round" ? scope.round : undefined;
      rows = predictionRows(tournament, stageId, picks);
      started = predictionStarted(tournament, stageId);
    } catch (failure) {
      structureError = failure;
    }
  const required = rows.filter((row) => !row.automatic);
  const complete = required.length > 0 && required.every((row) => row.pick);
  const visible = rows.slice(page * 32, (page + 1) * 32);
  const participantName = (id: string) =>
    tournament.participants.find((participant) => participant.id === id)
      ?.name ?? id;
  function change(matchId: string, choice: PredictionChoice) {
    const changed = { ...picks, [matchId]: choice };
    const validRows = predictionRows(tournament, stageId, changed);
    const normalized: PredictionChoices = {};
    for (const row of validRows) {
      if (row.placement && changed[row.match.id])
        normalized[row.match.id] = changed[row.match.id];
      else if (row.pick?.outcome === "winner")
        normalized[row.match.id] = row.pick.winnerId;
      else if (row.pick?.outcome === "draw")
        normalized[row.match.id] = { outcome: "draw" };
    }
    setPicks(normalized);
  }
  async function freeze() {
    setBusy(true);
    setError(undefined);
    try {
      const packet = await freezePrediction(tournament, stageId, name, picks);
      if (!mounted.current || current.current !== tournament)
        throw new Error(
          t(
            "The tournament changed while preparing this prediction. Review the current draw and try again.",
            "هنگام آماده‌سازی پیش‌بینی، مسابقات تغییر کرد. قرعه فعلی را بررسی و دوباره تلاش کنید.",
          ),
        );
      onFreeze(packet);
      setPicks({});
      setName("");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  if (!stages.length)
    return (
      <Notice>
        {t(
          "Generate a stage to create predictions.",
          "برای ساخت پیش‌بینی، یک مرحله ایجاد کنید.",
        )}
      </Notice>
    );
  return (
    <section className="panel prediction-builder">
      <h4>{t("Build a prediction bracket", "ساخت جدول پیش‌بینی")}</h4>
      <div className="two-columns">
        <Field label={t("Prediction stage", "مرحله پیش‌بینی")}>
          <select
            disabled={busy}
            value={stageId}
            onChange={(event) => {
              setStageId(event.target.value);
              setPicks({});
              setPage(0);
            }}
          >
            {stages.map((stage) => (
              <option value={stage.id} key={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Prediction entry name", "نام پیش‌بینی")}>
          <input
            disabled={busy}
            value={name}
            maxLength={180}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>
      <ErrorText error={error ?? structureError} />
      {round !== undefined && (
        <Notice>
          {t(
            `This entry covers generated round ${round} only. Later pairings need a separate prediction and leaderboard.`,
            `این پیش‌بینی فقط دور ایجادشده ${round.toLocaleString("fa")} را پوشش می‌دهد. قرعه‌های بعدی به پیش‌بینی و رتبه‌بندی جداگانه نیاز دارند.`,
          )}
        </Notice>
      )}
      {started ? (
        <Notice>
          {t(
            "This stage has started. New predictions cannot be frozen for this scope; existing entries can still be compared with actual results.",
            "این مرحله یا دور شروع شده است. پیش‌بینی تازه برای این محدوده نهایی نمی‌شود؛ پیش‌بینی‌های موجود همچنان با نتایج واقعی مقایسه می‌شوند.",
          )}
        </Notice>
      ) : (
        <>
          <p>
            {t(
              "Predict winners, permitted draws, or every entrant's finishing rank. Tied ranks use competition numbering such as 1, 1, 3. Earlier picks determine bracket paths. A reset is predicted only when the losers finalist wins the first final.",
              "برنده، تساوی مجاز یا رتبه پایان همه شرکت‌کنندگان را پیش‌بینی کنید. رتبه‌های مساوی به شکل ۱، ۱، ۳ ثبت می‌شوند. انتخاب‌های قبلی مسیر جدول را تعیین می‌کنند. فینال مجدد فقط با پیروزی نماینده جدول بازنده‌ها پیش‌بینی می‌شود.",
            )}
          </p>
          <div className="two-columns">
            {visible.map((row) => {
              const label = generatedMatchLabel(row.match, locale);
              if (row.placement) {
                const choice = picks[row.match.id];
                const ranks =
                  typeof choice === "object" && choice.outcome === "placements"
                    ? choice.ranks
                    : [];
                return (
                  <fieldset className="panel" key={row.match.id}>
                    <legend>{label}</legend>
                    {row.entrants.map((id) => (
                      <Field key={id} label={participantName(id)}>
                        <input
                          type="number"
                          min={1}
                          max={row.entrants.length}
                          step={1}
                          disabled={busy || row.waiting || row.automatic}
                          aria-label={t(
                            `Predicted rank for ${participantName(id)} in ${label}`,
                            `رتبه پیش‌بینی‌شده ${participantName(id)} در ${label}`,
                          )}
                          value={
                            ranks.find((entry) => entry.participantId === id)
                              ?.rank ?? ""
                          }
                          onChange={(event) =>
                            change(row.match.id, {
                              outcome: "placements",
                              ranks: [
                                ...ranks.filter(
                                  (entry) => entry.participantId !== id,
                                ),
                                ...(event.target.value
                                  ? [
                                      {
                                        participantId: id,
                                        rank: Number(event.target.value),
                                      },
                                    ]
                                  : []),
                              ],
                            })
                          }
                        />
                      </Field>
                    ))}
                    {!row.pick && (
                      <p className="muted">
                        {t(
                          "Enter a valid rank for every entrant, including ties.",
                          "برای همه شرکت‌کنندگان رتبه معتبر وارد کنید؛ رتبه مساوی مجاز است.",
                        )}
                      </p>
                    )}
                  </fieldset>
                );
              }
              if (row.pick?.outcome === "not-played")
                return (
                  <div className="panel" key={row.match.id}>
                    <strong>{label}</strong>
                    <p>
                      {t(
                        "Predicted reset: not needed",
                        "پیش‌بینی فینال مجدد: نیاز نیست",
                      )}
                    </p>
                  </div>
                );
              return (
                <Field key={row.match.id} label={label}>
                  <select
                    aria-label={t(
                      `Prediction for ${label}`,
                      `پیش‌بینی برای ${label}`,
                    )}
                    disabled={
                      row.automatic ||
                      row.waiting ||
                      row.entrants.length !== 2 ||
                      busy
                    }
                    value={
                      row.pick?.outcome === "draw"
                        ? "draw"
                        : row.winnerId
                          ? `entrant:${row.winnerId}`
                          : ""
                    }
                    onChange={(event) =>
                      change(
                        row.match.id,
                        event.target.value === "draw"
                          ? { outcome: "draw" }
                          : event.target.value.slice(8),
                      )
                    }
                  >
                    <option value="">
                      {row.entrants.length === 2
                        ? t(
                            "Choose predicted winner",
                            "انتخاب برنده پیش‌بینی‌شده",
                          )
                        : t(
                            "Waiting for earlier picks",
                            "در انتظار انتخاب‌های قبلی",
                          )}
                    </option>
                    {row.entrants.map((id) => (
                      <option key={id} value={`entrant:${id}`}>
                        {participantName(id)}
                      </option>
                    ))}
                    {row.allowDraw && (
                      <option value="draw">{t("Draw", "تساوی")}</option>
                    )}
                  </select>
                </Field>
              );
            })}
          </div>
          {rows.length > 32 && (
            <div className="button-row">
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                {t("Previous prediction matches", "دیدارهای پیش‌بینی قبلی")}
              </button>
              <span>
                {t(
                  `Page ${page + 1} of ${Math.ceil(rows.length / 32)}`,
                  `صفحه ${(page + 1).toLocaleString("fa")} از ${Math.ceil(rows.length / 32).toLocaleString("fa")}`,
                )}
              </span>
              <button
                className="button secondary"
                disabled={(page + 1) * 32 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                {t("Next prediction matches", "دیدارهای پیش‌بینی بعدی")}
              </button>
            </div>
          )}
          <button
            className="button primary"
            disabled={busy || !name.trim() || !complete || !!structureError}
            onClick={() => void freeze()}
          >
            {t(
              "Freeze prediction before play",
              "نهایی کردن پیش‌بینی پیش از بازی",
            )}
          </button>
        </>
      )}
    </section>
  );
}
