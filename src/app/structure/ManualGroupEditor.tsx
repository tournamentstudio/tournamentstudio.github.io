import { useMemo, useState } from "react";
import type { Stage, Tournament } from "../../domain/types";
import { previewGroupDraw } from "../../engine";
import { ErrorText, Field, Notice } from "../../components/ui";
import { Pagination, usePagination } from "../../components/Pagination";
import { useI18n } from "../../i18n";
import { manualGroupConfig } from "./manual-config";

export function ManualGroupEditor({
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
  const { t, number } = useI18n();
  const [draft, setDraft] = useState<{ groups: string[][]; basis: string }>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>();
  const basis = JSON.stringify([
    stage,
    tournament.participants,
    tournament.revision,
  ]);
  const preview = useMemo(
    () => previewGroupDraw(tournament, stage.id),
    [tournament, stage.id],
  );
  const groups = draft?.groups ?? preview.groups;
  const stale = !!draft && draft.basis !== basis;
  const entrants = tournament.participants.filter(
    (participant) =>
      groups.flat().includes(participant.id) &&
      participant.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const { visible, pagination } = usePagination(entrants, search);
  const blocked = locked || !!stage.config.draw || !preview.ready || stale;
  function apply(clear = false) {
    try {
      onEdit({
        config: manualGroupConfig(
          tournament,
          stage.id,
          clear ? undefined : groups,
        ),
      });
      setDraft(undefined);
      setError(undefined);
    } catch (error) {
      setError(error);
    }
  }
  return (
    <details className="panel manual-group-editor">
      <summary>{t("Manual group composition", "چیدمان دستی گروه‌ها")}</summary>
      <p>
        {t(
          "Assign every entrant to one nonempty group, then apply the draft before generating matches. GSL groups require exactly four entrants.",
          "هر شرکت‌کننده را در یک گروه غیرخالی قرار دهید؛ سپس پیش از ساخت دیدارها پیش‌نویس را اعمال کنید. هر گروه GSL باید دقیقاً چهار شرکت‌کننده داشته باشد.",
        )}
      </p>
      {!!stage.config.draw && (
        <Notice>
          {t(
            "Saved pot restrictions are active. Apply the standard draw in Group draw studio before choosing manual groups.",
            "محدودیت‌های گلدانی ذخیره‌شده فعال هستند. پیش از انتخاب گروه‌های دستی، قرعه معمول را در استودیوی قرعه گروهی اعمال کنید.",
          )}
        </Notice>
      )}
      {stale && (
        <Notice danger>
          {t(
            "Saved inputs changed. Discard this draft before editing again.",
            "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید.",
          )}
        </Notice>
      )}
      <ErrorText error={error} />
      <fieldset disabled={blocked} className="draw-fields">
        <Field
          label={t(
            "Find entrant for manual groups",
            "جستجوی شرکت‌کننده برای گروه‌بندی دستی",
          )}
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <div className="draw-assignment-list">
          {visible.map((participant) => (
            <Field key={participant.id} label={participant.name}>
              <select
                value={groups.findIndex((group) =>
                  group.includes(participant.id),
                )}
                onChange={(event) => {
                  const selected = Number(event.target.value);
                  setDraft({
                    basis: draft?.basis ?? basis,
                    groups: groups.map((group, index) => [
                      ...group.filter((id) => id !== participant.id),
                      ...(index === selected ? [participant.id] : []),
                    ]),
                  });
                }}
              >
                {groups.map((_, index) => (
                  <option key={index} value={index}>
                    {t("Group", "گروه")} {number(index + 1)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <p>
          {groups
            .map(
              (group, index) =>
                `${t("Group", "گروه")} ${number(index + 1)}: ${number(group.length)}`,
            )
            .join(" · ")}
        </p>
        <Pagination
          pagination={pagination}
          label={t(
            "Manual group entrant pages",
            "صفحه‌های شرکت‌کنندگان گروه دستی",
          )}
        />
        <button
          type="button"
          className="button primary"
          disabled={!draft}
          onClick={() => apply()}
        >
          {t("Apply manual groups", "اعمال گروه‌های دستی")}
        </button>
        {stage.config.groups !== undefined && (
          <button
            type="button"
            className="button secondary"
            onClick={() => apply(true)}
          >
            {t(
              "Restore automatic group composition",
              "بازگردانی چیدمان خودکار گروه‌ها",
            )}
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
          {t("Discard group draft", "کنار گذاشتن پیش‌نویس گروه‌ها")}
        </button>
      )}
    </details>
  );
}
