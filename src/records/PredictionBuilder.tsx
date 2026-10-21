import { useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n, generatedMatchLabel } from "../i18n";
import {
  freezePrediction,
  predictionRows,
  type Prediction,
} from "./predictions";

export function PredictionBuilder({
  tournament,
  onFreeze,
}: {
  tournament: Tournament;
  onFreeze: (prediction: Prediction) => void;
}) {
  const { t, locale } = useI18n();
  const stages = tournament.stages.filter(
    (stage) =>
      stage.format === "single-elimination" &&
      tournament.matches.some((match) => match.stageId === stage.id),
  );
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  let rows: ReturnType<typeof predictionRows> = [];
  let structureError: unknown;
  if (stageId)
    try {
      rows = predictionRows(tournament, stageId, picks);
    } catch (failure) {
      structureError = failure;
    }
  const started = tournament.matches.some(
    (match) =>
      match.stageId === stageId &&
      ((match.result && match.status !== "bye") ||
        ["live", "contested"].includes(match.status)),
  );
  const required = rows.filter((row) => !row.automatic);
  const complete = required.length > 0 && required.every((row) => row.winnerId);
  const visible = rows.slice(page * 32, (page + 1) * 32);
  async function freeze() {
    setBusy(true);
    setError(undefined);
    try {
      onFreeze(await freezePrediction(tournament, stageId, name, picks));
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
          "Generate a single-elimination stage to create a prediction bracket. Predictions for dynamic Swiss or elimination formats are not supported.",
          "برای ساخت جدول پیش‌بینی، مرحله تک‌حذفی ایجاد کنید. پیش‌بینی قالب‌های پویای سوئیسی یا حذفی دیگر پشتیبانی نمی‌شود.",
        )}
      </Notice>
    );
  return (
    <section className="panel">
      <h4>{t("Build a prediction bracket", "ساخت جدول پیش‌بینی")}</h4>
      <div className="two-columns">
        <Field label={t("Prediction stage", "مرحله پیش‌بینی")}>
          <select
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
            value={name}
            maxLength={180}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>
      <ErrorText error={error ?? structureError} />
      {started ? (
        <Notice>
          {t(
            "This stage has started. New predictions cannot be frozen locally; existing entries can still be compared with actual results.",
            "این مرحله شروع شده است. پیش‌بینی تازه به‌صورت محلی نهایی نمی‌شود؛ پیش‌بینی‌های موجود همچنان با نتایج واقعی مقایسه می‌شوند.",
          )}
        </Notice>
      ) : (
        <>
          <p>
            {t(
              "Choose each winner to populate later rounds. Changing an earlier pick clears any downstream choice that no longer fits. BYEs advance automatically.",
              "برنده هر دیدار را برای پر شدن دور بعد انتخاب کنید. تغییر انتخاب قبلی، انتخاب نامعتبر دور بعد را حذف می‌کند. استراحت خودکار صعود می‌کند.",
            )}
          </p>
          <div className="two-columns">
            {visible.map((row) => (
              <Field
                key={row.match.id}
                label={generatedMatchLabel(row.match, locale)}
              >
                <select
                  aria-label={t(
                    `Prediction for ${generatedMatchLabel(row.match, locale)}`,
                    `پیش‌بینی برای ${generatedMatchLabel(row.match, locale)}`,
                  )}
                  disabled={row.automatic || row.entrants.length !== 2 || busy}
                  value={row.winnerId ?? ""}
                  onChange={(event) => {
                    const changed = {
                      ...picks,
                      [row.match.id]: event.target.value,
                    };
                    setPicks(
                      Object.fromEntries(
                        predictionRows(tournament, stageId, changed)
                          .filter((value) => !value.automatic && value.winnerId)
                          .map((value) => [value.match.id, value.winnerId!]),
                      ),
                    );
                  }}
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
                    <option key={id} value={id}>
                      {tournament.participants.find(
                        (participant) => participant.id === id,
                      )?.name ?? id}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
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
                  `صفحه ${page + 1} از ${Math.ceil(rows.length / 32)}`,
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
            disabled={busy || !name.trim() || !complete}
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
