import { useState } from "react";
import type { Stage, Tournament } from "../../domain/types";
import { ErrorText, Field, Notice } from "../../components/ui";
import { previewAdvancement } from "../../engine";
import { useI18n } from "../../i18n";
import { swissRestrictionConfig } from "./manual-config";

export function SwissRestrictionsEditor({
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
  const [draft, setDraft] = useState<string[][]>();
  const [draftBasis, setDraftBasis] = useState<string>();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<unknown>();
  const basis = JSON.stringify([stage, tournament.revision]);
  const stale = !!draft && draftBasis !== basis;
  const federation = !!stage.config.swiss?.federation;
  function change(pairs: string[][]) {
    setDraftBasis(draftBasis ?? basis);
    setDraft(pairs);
  }
  const pairs =
    draft ?? (stage.config.forbiddenPairs as string[][] | undefined) ?? [];
  const preview = previewAdvancement(tournament, stage.id);
  const entrants = tournament.participants.filter((participant) =>
    preview.participantIds.includes(participant.id),
  );
  function apply() {
    try {
      onEdit({ config: swissRestrictionConfig(tournament, stage.id, pairs) });
      setDraft(undefined);
      setDraftBasis(undefined);
      setError(undefined);
    } catch (error) {
      setError(error);
    }
  }
  return (
    <details className="panel swiss-restrictions-editor">
      <summary>
        {t("Swiss forbidden pairings", "رویارویی‌های ممنوع سوئیسی")}
      </summary>
      {federation ? (
        <Notice>
          {t(
            "Forbidden-pair rules are unavailable for FIDE Dutch. Switch to General Swiss in Pairing rules to edit these restrictions.",
            "قوانین رویارویی ممنوع در هلندی فیده در دسترس نیست. برای ویرایش این محدودیت‌ها، در مقررات زوج‌بندی سوئیسی عمومی را انتخاب کنید.",
          )}
        </Notice>
      ) : (
        <p>
          {t(
            "Set restrictions before generating the stage. First-round feasibility is checked when saving; later rounds may still need fewer restrictions. Existing results are preserved.",
            "محدودیت‌ها را پیش از ساخت مرحله تنظیم کنید. امکان جفت‌سازی دور اول هنگام ذخیره بررسی می‌شود؛ ممکن است دورهای بعد به محدودیت کمتری نیاز داشته باشند. نتایج موجود حفظ می‌شوند.",
          )}
        </p>
      )}
      <ErrorText error={error} />
      {stale && (
        <Notice danger>
          {t(
            "Saved inputs changed. Discard this draft before editing again.",
            "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید.",
          )}
        </Notice>
      )}
      <fieldset
        disabled={locked || !preview.ready || stale || federation}
        className="draw-fields"
      >
        <div className="two-columns">
          {[
            [first, setFirst, t("First entrant", "شرکت‌کننده اول")],
            [second, setSecond, t("Second entrant", "شرکت‌کننده دوم")],
          ].map(([value, setValue, label], index) => (
            <Field label={label as string} key={index}>
              <select
                value={value as string}
                onChange={(event) =>
                  (setValue as (value: string) => void)(event.target.value)
                }
              >
                <option value="">
                  {t("Choose entrant", "انتخاب شرکت‌کننده")}
                </option>
                {entrants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={
            !first ||
            !second ||
            first === second ||
            pairs.some((pair) => pair.includes(first) && pair.includes(second))
          }
          onClick={() => {
            change([...pairs, [first, second]]);
            setFirst("");
            setSecond("");
          }}
        >
          {t("Add forbidden pairing", "افزودن رویارویی ممنوع")}
        </button>
        <ul>
          {pairs.map((pair, index) => (
            <li key={JSON.stringify(pair)}>
              <bdi>
                {pair
                  .map(
                    (id) =>
                      tournament.participants.find(
                        (participant) => participant.id === id,
                      )?.name ?? id,
                  )
                  .join(" / ")}
              </bdi>{" "}
              <button
                type="button"
                className="text-button"
                aria-label={`${t("Remove pairing", "حذف رویارویی")} ${index + 1}`}
                onClick={() =>
                  change(pairs.filter((_, position) => position !== index))
                }
              >
                {t("Remove", "حذف")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="button primary"
          disabled={!draft}
          onClick={apply}
        >
          {t("Apply Swiss restrictions", "اعمال محدودیت‌های سوئیسی")}
        </button>
      </fieldset>
      {draft && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDraft(undefined);
            setDraftBasis(undefined);
            setError(undefined);
          }}
        >
          {t("Discard pairing draft", "کنار گذاشتن پیش‌نویس رویارویی‌ها")}
        </button>
      )}
    </details>
  );
}
