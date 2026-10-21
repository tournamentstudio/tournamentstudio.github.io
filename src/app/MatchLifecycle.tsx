import { useState } from "react";
import type { Match, Tournament } from "../domain/types";
import { changeMatchState, getCorrectionImpact } from "../engine";
import { tournamentMatchEvidence } from "../engine/match-evidence";
import { ErrorText, Field, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";

export function MatchLifecycle({
  tournament,
  match,
  onChange,
  onClose,
}: {
  tournament: Tournament;
  match: Match;
  onChange: (doc: Tournament, action: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [state, setState] =
    useState<Parameters<typeof changeMatchState>[2]>("ready");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>();
  const affected = [match, ...getCorrectionImpact(tournament, match.id)].filter(
    tournamentMatchEvidence(tournament),
  );
  function apply(confirmed = false) {
    setError(undefined);
    if (match.result && !confirmed) {
      setConfirm(true);
      return;
    }
    try {
      onChange(
        changeMatchState(tournament, match.id, state, confirmed),
        t("Change match status", "تغییر وضعیت دیدار"),
      );
      onClose();
    } catch (failure) {
      setError(failure);
    }
  }
  if (["pending", "bye"].includes(match.status)) return null;
  return (
    <details className="panel compact-panel">
      <summary>
        {t("Reopen or change match status", "بازگشایی یا تغییر وضعیت دیدار")}
      </summary>
      <p className="muted">
        {t(
          "Reopening removes the official result after confirmation. Abandoned matches wait for a referee ruling and do not advance entrants.",
          "بازگشایی پس از تأیید، نتیجه رسمی را حذف می‌کند. دیدار رهاشده تا رأی داور منتظر می‌ماند و شرکت‌کننده‌ای را صعود نمی‌دهد.",
        )}
      </p>
      <Field label={t("Operating status", "وضعیت اجرایی")}>
        <select
          value={state}
          onChange={(event) => {
            setState(event.target.value as typeof state);
            setConfirm(false);
          }}
        >
          {(
            [
              ["ready", "Ready / reopen", "آماده / بازگشایی"],
              ["live", "In progress", "در حال انجام"],
              ["postponed", "Postponed", "به تعویق افتاده"],
              ["contested", "Contested result", "نتیجه مورد اعتراض"],
              [
                "abandoned",
                "Abandoned, awaiting ruling",
                "رهاشده، در انتظار رأی",
              ],
              ["canceled", "Canceled without a result", "لغوشده بدون نتیجه"],
            ] as const
          ).map(([id, en, fa]) => (
            <option key={id} value={id}>
              {t(en, fa)}
            </option>
          ))}
        </select>
      </Field>
      {confirm && (
        <Notice danger>
          <p>
            {t(
              "These results or live matches will be reopened. A recovery record and saved revision retain the previous state.",
              "این نتایج یا دیدارهای زنده بازگشایی می‌شوند. سابقه بازیابی و نسخه ذخیره‌شده وضعیت قبلی را نگه می‌دارند.",
            )}
          </p>
          <ul>
            {affected.map((item) => (
              <li key={item.id}>{generatedMatchLabel(item, locale)}</li>
            ))}
          </ul>
        </Notice>
      )}
      <ErrorText error={error} />
      <div className="button-row">
        <button
          type="button"
          className={confirm ? "button danger" : "button secondary"}
          onClick={() => apply(confirm)}
        >
          {confirm
            ? t(
                "Confirm status and reopen dependents",
                "تأیید وضعیت و بازگشایی وابسته‌ها",
              )
            : t("Apply match status", "اعمال وضعیت دیدار")}
        </button>
        {confirm && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            {t("Keep results", "حفظ نتایج")}
          </button>
        )}
      </div>
    </details>
  );
}
