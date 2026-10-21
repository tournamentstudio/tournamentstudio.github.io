import { useMemo, useState } from "react";
import type { Stage, Tournament } from "../../domain/types";
import { previewAdvancement } from "../../engine";
import { Confirm, ErrorText, Notice } from "../../components/ui";
import { Pagination, usePagination } from "../../components/Pagination";
import { useI18n } from "../../i18n";
import { manualQualifierConfig } from "./manual-config";

export function ManualQualifierEditor({
  tournament,
  stage,
  locked,
  onEdit,
}: {
  tournament: Tournament;
  stage: Stage;
  locked: boolean;
  onEdit: (patch: Partial<Stage>) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<{ ids: string[]; basis: string }>();
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const basis = JSON.stringify([stage, tournament.revision]);
  const preview = useMemo(() => {
    const copy = structuredClone(tournament);
    delete copy.stages.find((item) => item.id === stage.id)!.config
      .manualQualifiers;
    return previewAdvancement(copy, stage.id);
  }, [tournament, stage.id]);
  const ids =
    draft?.ids ??
    (stage.config.manualQualifiers as string[] | undefined) ??
    preview.participantIds;
  const fixed = new Set(preview.participantIds);
  const candidates = new Set(
    preview.sources.flatMap((source) =>
      source.candidates.map((candidate) => candidate.participantId),
    ),
  );
  const entrants = tournament.participants.filter((participant) =>
    candidates.has(participant.id),
  );
  const stale = !!draft && draft.basis !== basis;
  const { visible, pagination } = usePagination(entrants, stage.id);
  function validate() {
    try {
      manualQualifierConfig(tournament, stage.id, ids);
      setError(undefined);
      setConfirm(true);
    } catch (error) {
      setError(error);
    }
  }
  function apply(clear = false) {
    try {
      onEdit({
        config: manualQualifierConfig(
          tournament,
          stage.id,
          clear ? undefined : ids,
        ),
      });
      setDraft(undefined);
      setConfirm(false);
      setError(undefined);
    } catch (error) {
      setError(error);
      setConfirm(false);
    }
  }
  return (
    <details className="panel manual-qualifier-editor">
      <summary>
        {t("Resolve qualification ties manually", "تعیین دستی صعود در تساوی")}
      </summary>
      <p>
        {t(
          "Keep every clear qualifier selected and choose only among tied entrants at the cutoff. Source matches must be complete. The engine validates the decision before it is saved.",
          "همه صعودکنندگان قطعی را انتخاب‌شده نگه دارید و فقط از میان نفرات مساوی در مرز صعود انتخاب کنید. دیدارهای مرحله مبدأ باید کامل باشند. موتور مسابقات پیش از ذخیره تصمیم را بررسی می‌کند.",
        )}
      </p>
      {stale && (
        <Notice danger>
          {t(
            "Saved inputs changed. Discard this draft before editing again.",
            "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید.",
          )}
        </Notice>
      )}
      <ErrorText error={error} />
      <fieldset disabled={locked || stale} className="draw-fields">
        {visible.map((participant) => (
          <label className="check-row" key={participant.id}>
            <input
              type="checkbox"
              checked={ids.includes(participant.id)}
              disabled={fixed.has(participant.id)}
              onChange={(event) =>
                setDraft({
                  basis: draft?.basis ?? basis,
                  ids: event.target.checked
                    ? [...ids, participant.id]
                    : ids.filter((id) => id !== participant.id),
                })
              }
            />
            <bdi>{participant.name}</bdi>
            {fixed.has(participant.id) && (
              <span className="badge">{t("Clear qualifier", "صعود قطعی")}</span>
            )}
          </label>
        ))}
        <Pagination
          pagination={pagination}
          label={t("Qualifier pages", "صفحه‌های صعودکنندگان")}
        />
        {!entrants.length && (
          <p>
            {t(
              "Complete source results to see eligible entrants.",
              "برای دیدن شرکت‌کنندگان واجد شرایط، نتایج مرحله مبدأ را کامل کنید.",
            )}
          </p>
        )}
        <button
          type="button"
          className="button primary"
          disabled={!draft}
          onClick={validate}
        >
          {t("Review manual qualifiers", "بررسی صعودکنندگان دستی")}
        </button>
        {stage.config.manualQualifiers !== undefined && (
          <button
            type="button"
            className="button secondary"
            onClick={() => apply(true)}
          >
            {t("Clear manual decision", "حذف تصمیم دستی")}
          </button>
        )}
      </fieldset>
      {draft && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDraft(undefined);
            setError(undefined);
          }}
        >
          {t("Discard qualifier draft", "کنار گذاشتن پیش‌نویس صعود")}
        </button>
      )}
      {confirm && (
        <Confirm
          title={t("Confirm qualification decision?", "تأیید تصمیم صعود؟")}
          message={
            t(
              "These entrants will qualify. The saved revision preserves the earlier decision:",
              "این شرکت‌کنندگان صعود می‌کنند. تصمیم قبلی در نسخه ذخیره‌شده باقی می‌ماند:",
            ) +
            " " +
            entrants
              .filter((participant) => ids.includes(participant.id))
              .map((participant) => participant.name)
              .join(", ")
          }
          onConfirm={() => apply()}
          onClose={() => setConfirm(false)}
        />
      )}
    </details>
  );
}
