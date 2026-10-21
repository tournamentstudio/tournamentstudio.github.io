import { useEffect, useRef, useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Notice, Confirm } from "../components/ui";
import { PacketInput } from "./PacketInput";
import { useI18n } from "../i18n";
import { downloadFile } from "../sharing";
import { PredictionBuilder } from "./PredictionBuilder";
import {
  decodePrediction,
  encodePrediction,
  predictionScore,
  predictionScopeKey,
  validatePrediction,
  type Prediction,
} from "./predictions";
import type { Records } from "./model";

export function PredictionsStudio({
  tournament,
  records,
  onChange,
}: {
  tournament: Tournament;
  records: Records;
  onChange: (records: Records, action: string) => void;
}) {
  const { t, date } = useI18n();
  const [code, setCode] = useState(""),
    [output, setOutput] = useState("");
  const [preview, setPreview] = useState<Prediction>();
  const [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [validIds, setValidIds] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const [checkedDocument, setCheckedDocument] = useState<Tournament>();
  const [selectedScope, setSelectedScope] = useState("");
  const [remove, setRemove] = useState<string>();
  const current = useRef({ tournament, code });
  current.current = { tournament, code };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all(
      records.predictions.map(async ({ packet }) => {
        try {
          await validatePrediction(tournament, packet);
          return packet.id;
        } catch {
          return "";
        }
      }),
    ).then((ids) => {
      if (active) {
        setValidIds(new Set(ids.filter(Boolean)));
        setChecked(true);
        setCheckedDocument(tournament);
      }
    });
    return () => {
      active = false;
    };
  }, [tournament, records.predictions]);
  async function work(action: () => Promise<void> | void) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  function add(packet: Prediction, imported: boolean) {
    if (!mounted.current || current.current.tournament !== tournament)
      throw new Error(
        t(
          "The tournament changed. Review this prediction again before saving.",
          "مسابقات تغییر کرد. پیش از ذخیره، پیش‌بینی را دوباره بررسی کنید.",
        ),
      );
    if (records.predictions.some((entry) => entry.packet.id === packet.id))
      throw new Error(
        t(
          "This prediction packet is already saved.",
          "این بسته پیش‌بینی از قبل ذخیره شده است.",
        ),
      );
    onChange(
      {
        ...records,
        predictions: [
          ...records.predictions,
          { packet, imported, receivedAt: new Date().toISOString() },
        ],
      },
      imported
        ? t("Import reviewed prediction", "ورود پیش‌بینی بررسی‌شده")
        : t("Freeze local prediction", "نهایی کردن پیش‌بینی محلی"),
    );
    setPreview(undefined);
    setCode("");
    setSelectedScope(predictionScopeKey(packet));
  }
  const valid = records.predictions.filter((entry) =>
    validIds.has(entry.packet.id),
  );
  const scopes = [
    ...new Map(
      valid.map((entry) => [predictionScopeKey(entry.packet), entry.packet]),
    ).entries(),
  ];
  const activeScope = scopes.some(([key]) => key === selectedScope)
    ? selectedScope
    : scopes[0]?.[0];
  function scopeLabel(packet: Prediction) {
    const name =
      tournament.stages.find((stage) => stage.id === packet.stageId)?.name ??
      packet.stageId;
    return `${name} · ${packet.version === 1 ? t("Legacy winner scoring", "امتیازدهی برنده قدیمی") : packet.scope.kind === "round" ? t(`Round ${packet.scope.round}`, `دور ${packet.scope.round.toLocaleString("fa")}`) : t("Whole generated stage", "تمام مرحله ایجادشده")}`;
  }
  const leaderboard = valid
    .filter((entry) => predictionScopeKey(entry.packet) === activeScope)
    .map((entry) => ({
      ...entry,
      score: predictionScore(tournament, entry.packet),
    }))
    .sort(
      (first, second) =>
        second.score.correct - first.score.correct ||
        first.packet.name.localeCompare(second.packet.name) ||
        first.packet.id.localeCompare(second.packet.id),
    );
  return (
    <section className="panel">
      <h3>
        {t(
          "Prediction brackets and local leaderboard",
          "جدول پیش‌بینی و رتبه‌بندی محلی",
        )}
      </h3>
      <Notice>
        {t(
          "Each exact match outcome earns one point: winner, draw, complete placement ranking, or an unneeded reset. Canceled matches and placement rulings without complete consistent ranks are void. Only entries with the same scope and scoring version share a leaderboard; equal totals share a rank. Frozen entries cannot be edited here. Sender identity and freeze times are unverified, including local device clocks.",
          "هر نتیجه دقیق یک امتیاز دارد: برنده، تساوی، رتبه‌بندی کامل یا بی‌نیازی از فینال مجدد. دیدار لغوشده و حکم رتبه‌بندی فاقد رتبه‌های کامل و سازگار بی‌امتیاز هستند. فقط پیش‌بینی‌های هم‌محدوده با نسخه امتیازدهی یکسان رتبه‌بندی می‌شوند؛ امتیاز برابر رتبه برابر دارد. پیش‌بینی نهایی‌شده ویرایش نمی‌شود. هویت فرستنده و زمان نهایی‌سازی، از جمله ساعت دستگاه محلی، تأیید نشده‌اند.",
        )}
      </Notice>
      <ErrorText error={error} />
      <PredictionBuilder
        tournament={tournament}
        onFreeze={(packet) => add(packet, false)}
      />
      {checked && checkedDocument === tournament && (
        <>
          {scopes.length > 0 && (
            <Field
              label={t(
                "Prediction leaderboard scope",
                "محدوده رتبه‌بندی پیش‌بینی",
              )}
            >
              <select
                value={activeScope ?? ""}
                onChange={(event) => setSelectedScope(event.target.value)}
              >
                {scopes.map(([key, packet]) => (
                  <option value={key} key={key}>
                    {scopeLabel(packet)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="table-scroll">
            <table className="data-table prediction-leaderboard">
              <thead>
                <tr>
                  <th>{t("Rank", "رتبه")}</th>
                  <th>{t("Entry", "پیش‌بینی")}</th>
                  <th>{t("Correct", "درست")}</th>
                  <th>{t("Incorrect", "نادرست")}</th>
                  <th>{t("Pending", "در انتظار")}</th>
                  <th>{t("Void", "بی‌امتیاز")}</th>
                  <th>{t("Claimed freeze", "زمان ادعایی نهایی‌سازی")}</th>
                  <th>{t("Actions", "عملیات")}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr key={entry.packet.id}>
                    <td>
                      {leaderboard.findIndex(
                        (value) => value.score.correct === entry.score.correct,
                      ) + 1}
                    </td>
                    <td>
                      <bdi>{entry.packet.name}</bdi>
                      {entry.imported && (
                        <span className="badge">
                          {t(
                            "Imported, timing unverified",
                            "واردشده، زمان تأییدنشده",
                          )}
                        </span>
                      )}
                    </td>
                    <td>{entry.score.correct}</td>
                    <td>{entry.score.incorrect}</td>
                    <td>{entry.score.pending}</td>
                    <td>{entry.score.voided ?? 0}</td>
                    <td>{date(entry.packet.frozenAt)}</td>
                    <td>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void work(async () =>
                              setOutput(await encodePrediction(entry.packet)),
                            )
                          }
                        >
                          {t("Export prediction", "صدور پیش‌بینی")}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setRemove(entry.packet.id)}
                        >
                          {t("Remove entry", "حذف پیش‌بینی")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!records.predictions.length && (
            <p className="muted">
              {t(
                "Freeze a complete bracket or import a reviewed packet to start this leaderboard.",
                "برای شروع رتبه‌بندی، جدول کامل را نهایی کنید یا بسته بررسی‌شده وارد کنید.",
              )}
            </p>
          )}
          {records.predictions
            .filter((entry) => !validIds.has(entry.packet.id))
            .map((entry) => (
              <Notice key={entry.packet.id}>
                <bdi>{entry.packet.name}</bdi>:{" "}
                {t(
                  "This saved prediction no longer matches the current draw. It is kept in storage and excluded from the leaderboard.",
                  "این پیش‌بینی ذخیره‌شده با قرعه فعلی همسان نیست. در ذخیره‌سازی نگهداری و از رتبه‌بندی حذف شده است.",
                )}
              </Notice>
            ))}
        </>
      )}
      {output && (
        <>
          <Field label={t("Prediction package code", "کد بسته پیش‌بینی")}>
            <textarea readOnly rows={3} dir="ltr" value={output} />
          </Field>
          <button
            className="button secondary"
            onClick={() =>
              downloadFile(
                output,
                `${tournament.slug}-prediction.txt`,
                "text/plain",
              )
            }
          >
            {t("Download prediction packet", "دریافت بسته پیش‌بینی")}
          </button>
        </>
      )}
      <PacketInput
        label={t("Import prediction code", "ورود کد پیش‌بینی")}
        value={code}
        onChange={(value) => {
          setCode(value);
          setPreview(undefined);
        }}
      />
      <button
        className="button secondary"
        disabled={busy || !code.trim()}
        onClick={() =>
          void work(async () => {
            const packet = await validatePrediction(
              tournament,
              await decodePrediction(code),
            );
            if (
              !mounted.current ||
              current.current.tournament !== tournament ||
              current.current.code !== code
            )
              throw new Error(
                t(
                  "The tournament changed. Review this prediction again before saving.",
                  "مسابقات تغییر کرد. پیش از ذخیره، پیش‌بینی را دوباره بررسی کنید.",
                ),
              );
            setPreview(packet);
            setAcknowledged(false);
          })
        }
      >
        {t("Preview prediction packet", "پیش‌نمایش بسته پیش‌بینی")}
      </button>
      {preview && (
        <section className="panel">
          <h4>
            <bdi>{preview.name}</bdi>
          </h4>
          <p>
            {scopeLabel(preview)} · {preview.picks.length}{" "}
            {t("predicted matches", "دیدار پیش‌بینی‌شده")} ·{" "}
            {t("Claimed freeze", "زمان ادعایی نهایی‌سازی")}:{" "}
            {date(preview.frozenAt)}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            {t(
              "Accept this imported entry with unverified identity and freeze time",
              "پذیرش پیش‌بینی واردشده با هویت و زمان نهایی‌سازی تأییدنشده",
            )}
          </label>
          <button
            className="button primary"
            disabled={busy || !acknowledged}
            onClick={() =>
              void work(async () =>
                add(await validatePrediction(tournament, preview), true),
              )
            }
          >
            {t("Add reviewed prediction", "افزودن پیش‌بینی بررسی‌شده")}
          </button>
        </section>
      )}
      {remove && (
        <Confirm
          title={t("Remove prediction entry", "حذف پیش‌بینی")}
          message={t(
            "Remove this entry from the current leaderboard? The previous saved revision keeps a recovery copy.",
            "این پیش‌بینی از رتبه‌بندی فعلی حذف شود؟ نسخه قبلی برای بازیابی نگهداری می‌شود.",
          )}
          onClose={() => setRemove(undefined)}
          onConfirm={() => {
            onChange(
              {
                ...records,
                predictions: records.predictions.filter(
                  (entry) => entry.packet.id !== remove,
                ),
              },
              t("Remove prediction entry", "حذف پیش‌بینی"),
            );
            setRemove(undefined);
          }}
        />
      )}
    </section>
  );
}
