import { useState } from "react";
import type { Tournament } from "../domain/types";
import type { TournamentPatch } from "../sharing";
import {
  previewSelectivePatch,
  type PatchReview,
  type SelectivePatchPreview,
} from "../sharing/merge";
import { ErrorText, Notice } from "../components/ui";
import { Bracket } from "../components/Bracket";
import { generatedMatchLabel, useI18n } from "../i18n";

export interface MergeSelection {
  selected: number[];
  expectedHash: string;
  confirmInvalidate: boolean;
}

export function PatchMergeReview({
  current,
  base,
  packet,
  review,
  forkProtected,
  onBack,
  onMerge,
  onFork,
}: {
  current: Tournament;
  base: Tournament;
  packet: TournamentPatch;
  review: PatchReview;
  forkProtected: boolean;
  onBack: () => void;
  onMerge: (selection: MergeSelection) => Promise<void>;
  onFork: (target: Tournament) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<SelectivePatchPreview>();
  const [confirm, setConfirm] = useState(false);
  const [conflictsConfirmed, setConflictsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(review.entries.length / 25));
  const hasConflicts = selected.some(
    (index) => review.entries[index].status === "conflict",
  );
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  const reason = (code: string) => {
    if (code === "local-history")
      return t("Keep local history and state", "حفظ تاریخچه و وضعیت محلی");
    if (code === "derived-match" || code === "derived-stage")
      return t(
        "Calculated from selected results",
        "محاسبه از نتایج انتخاب‌شده",
      );
    if (code === "played-rules")
      return t(
        "Rules for played matches must be reviewed separately",
        "قوانین دیدارهای انجام‌شده نیاز به بررسی جداگانه دارد",
      );
    return t(
      "Structure or result removal requires a separate fork",
      "تغییر ساختار یا حذف نتیجه به کپی جداگانه نیاز دارد",
    );
  };
  const summarize = (value: unknown) => {
    const text = JSON.stringify(value, null, 2) ?? "";
    return text.length > 4000 ? `${text.slice(0, 4000)}\n...` : text;
  };
  return (
    <section className="panel-content">
      <h3>{t("Review divergent update", "بررسی به‌روزرسانی متفاوت")}</h3>
      <Notice>
        {t(
          "Select each incoming change to keep. Unselected changes stay local. The sender's original target can also be saved as a separate fork. A merge creates a new local revision, so future updates may need another review.",
          "هر تغییر ورودی را که می‌خواهید انتخاب کنید. تغییرهای انتخاب‌نشده محلی می‌مانند. نسخه فرستنده را می‌توان به‌صورت کپی جداگانه ذخیره کرد. ادغام نسخه محلی تازه‌ای می‌سازد و به‌روزرسانی بعدی ممکن است دوباره نیاز به بررسی داشته باشد.",
        )}
      </Notice>
      <ErrorText error={error} />
      {forkProtected && (
        <Notice>
          {t(
            "A fork will use the current vault secret, or the transfer secret when this local copy is unprotected.",
            "کپی جداگانه از رمز گاوصندوق فعلی استفاده می‌کند؛ اگر نسخه محلی بدون محافظت باشد، رمز انتقال به کار می‌رود.",
          )}
        </Notice>
      )}
      <p className="muted">
        {t(
          "Applying selected changes preserves this local copy's current storage mode and vault secret.",
          "اعمال تغییرهای انتخاب‌شده، حالت ذخیره‌سازی و رمز گاوصندوق فعلی نسخه محلی را حفظ می‌کند.",
        )}
      </p>
      {!preview ? (
        <>
          <div className="panel-content">
            {review.entries.slice(page * 25, (page + 1) * 25).map((entry) => (
              <details key={entry.index} className="panel">
                <summary>
                  <label
                    className="check-row"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      disabled={
                        busy ||
                        entry.status === "blocked" ||
                        entry.status === "unchanged"
                      }
                      checked={selected.includes(entry.index)}
                      aria-label={`${t("Select change", "انتخاب تغییر")} ${entry.path}`}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...selected, entry.index]
                            : selected.filter((index) => index !== entry.index),
                        );
                        setConflictsConfirmed(false);
                      }}
                    />
                    <bdi>{entry.path}</bdi>
                    <span className="badge">
                      {entry.status === "conflict"
                        ? t("Conflict", "تعارض")
                        : entry.status === "compatible"
                          ? t("Compatible", "سازگار")
                          : entry.status === "unchanged"
                            ? t("Already matches", "از قبل یکسان")
                            : t("Keep local", "حفظ محلی")}
                    </span>
                  </label>
                </summary>
                {entry.reason && <p>{reason(entry.reason)}</p>}
                <div className="two-columns">
                  <div>
                    <h4>{t("Local value", "مقدار محلی")}</h4>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        maxHeight: 240,
                        overflow: "auto",
                      }}
                    >
                      {summarize(entry.local)}
                    </pre>
                  </div>
                  <div>
                    <h4>{t("Incoming value", "مقدار ورودی")}</h4>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        maxHeight: 240,
                        overflow: "auto",
                      }}
                    >
                      {summarize(entry.incoming)}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
          {pageCount > 1 && (
            <div
              className="button-row"
              aria-label={t("Change pages", "صفحه‌های تغییرها")}
            >
              <button
                className="button secondary"
                disabled={page === 0 || busy}
                onClick={() => setPage(page - 1)}
              >
                {t("Previous changes", "تغییرهای قبلی")}
              </button>
              <span>
                {t(
                  `Page ${page + 1} of ${pageCount}`,
                  `صفحه ${page + 1} از ${pageCount}`,
                )}
              </span>
              <button
                className="button secondary"
                disabled={page + 1 === pageCount || busy}
                onClick={() => setPage(page + 1)}
              >
                {t("Next changes", "تغییرهای بعدی")}
              </button>
            </div>
          )}
          {hasConflicts && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={conflictsConfirmed}
                onChange={(event) =>
                  setConflictsConfirmed(event.target.checked)
                }
              />
              {t(
                "Replace the selected conflicting local values with the incoming values",
                "جایگزینی مقدارهای محلی متعارض انتخاب‌شده با مقدارهای ورودی",
              )}
            </label>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={onBack}
            >
              {t("Keep local copy", "حفظ نسخه محلی")}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => work(() => onFork(review.target))}
            >
              {t("Fork sender's version", "کپی نسخه فرستنده")}
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !selected.length ||
                (hasConflicts && !conflictsConfirmed)
              }
              onClick={() =>
                work(async () => {
                  const next = await previewSelectivePatch(
                    current,
                    base,
                    packet,
                    selected,
                  );
                  if (next.currentHash !== review.currentHash)
                    throw new Error(
                      t(
                        "The local tournament changed. Close this dialog and review the update again.",
                        "مسابقات محلی تغییر کرده است. پنجره را ببندید و به‌روزرسانی را دوباره بررسی کنید.",
                      ),
                    );
                  setPreview(next);
                  setConfirm(false);
                })
              }
            >
              {t("Preview selected changes", "پیش‌نمایش تغییرهای انتخاب‌شده")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="import-bracket">
            <Bracket tournament={preview.tournament} locale={locale} readOnly />
          </div>
          {!!preview.affected.length && (
            <Notice>
              <p>
                {t(
                  "These matches have recorded activity affected by the selected changes. Dependent results may reopen, and player events affected by a result or roster change need review before they count again. The previous saved revision remains in History.",
                  "این دیدارها فعالیت ثبت‌شده‌ای دارند که تغییرهای انتخابی بر آن اثر می‌گذارد. نتیجه‌های وابسته ممکن است بازگشایی شوند و رویدادهای بازیکن پس از تغییر نتیجه یا ترکیب تیم تا بازبینی دوباره در آمار محاسبه نمی‌شوند. نسخه قبلی در تاریخچه می‌ماند.",
                )}
              </p>
              <ul>
                {preview.affected.map((match) => (
                  <li key={match.id}>{generatedMatchLabel(match, locale)}</li>
                ))}
              </ul>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(event) => setConfirm(event.target.checked)}
                />
                {t(
                  "Confirm affected match changes",
                  "تأیید تغییر دیدارهای وابسته",
                )}
              </label>
            </Notice>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              {t("Back to changes", "بازگشت به تغییرها")}
            </button>
            <button
              className="button primary"
              disabled={busy || (!!preview.affected.length && !confirm)}
              onClick={() =>
                work(() =>
                  onMerge({
                    selected,
                    expectedHash: preview.currentHash,
                    confirmInvalidate: confirm,
                  }),
                )
              }
            >
              {t("Apply selected changes", "اعمال تغییرهای انتخاب‌شده")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
