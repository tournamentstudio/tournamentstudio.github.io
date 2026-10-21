import { useState } from "react";
import { Check, Eye, Layers, Plus, RotateCcw } from "lucide-react";
import {
  type GroupDrawConfig,
  type GroupDrawPreview,
  type Participant,
  type Stage,
  type Tournament,
} from "../../domain/types";
import {
  groupDrawIssueText,
  previewAdvancement,
  previewGroupDraw,
} from "../../engine";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { DrawPots } from "./DrawPots";
import { DrawCeremony } from "./DrawCeremony";
import "./draw.css";

interface Props {
  tournament: Tournament;
  stage: Stage;
  value: GroupDrawConfig | null;
  dirty: boolean;
  stale: boolean;
  locked: boolean;
  onDraft: (value: GroupDrawConfig | null) => void;
  onDiscard: () => void;
  onApply: () => void;
}

export function groupDrawBasis(stage: Stage) {
  return JSON.stringify({
    format: stage.format,
    config: stage.config,
    sources: stage.sources,
    participantIds: stage.participantIds,
  });
}

export function withGroupDraw(
  stage: Stage,
  value: GroupDrawConfig | null,
): Stage {
  const config = { ...stage.config };
  if (value) {
    config.draw = structuredClone(value);
    delete config.groups;
  } else delete config.draw;
  return { ...stage, config };
}

export function GroupDrawEditor({
  tournament,
  stage,
  value,
  dirty,
  stale,
  locked,
  onDraft,
  onDiscard,
  onApply,
}: Props) {
  const { t, locale } = useI18n();
  const [preview, setPreview] = useState<{
    key: string;
    result: GroupDrawPreview;
  }>();
  const draftDocument: Tournament = {
    ...tournament,
    stages: tournament.stages.map((item) =>
      item.id === stage.id ? withGroupDraw(item, value) : item,
    ),
  };
  const key = JSON.stringify(draftDocument);
  const currentPreview = preview?.key === key ? preview.result : undefined;
  const sourcePreview = stage.sources.length
    ? previewAdvancement(tournament, stage.id)
    : undefined;
  const entrantIds = sourcePreview?.participantIds ?? stage.participantIds;
  const entrants = entrantIds
    .map((id) =>
      tournament.participants.find((participant) => participant.id === id),
    )
    .filter(
      (participant): participant is Participant =>
        !!participant && participant.status === "active",
    );
  const groupCount =
    stage.format === "gsl"
      ? Math.ceil(entrants.length / 4)
      : stage.config.groupCount;
  const changed = onDraft;
  const names = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  );
  return (
    <section
      className="group-draw-editor"
      aria-label={t("Pot draw and restrictions", "قرعه گلدانی و محدودیت‌ها")}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("Draw studio", "استودیوی قرعه")}</span>
          <h3>
            <Layers size={18} />
            {t("Pots & group balance", "گلدان‌ها و توازن گروه‌ها")}
          </h3>
          <p>
            {t(
              "Build seed pots and keep entrants from the same region or organization apart.",
              "گلدان‌های سیدبندی بسازید و شرکت‌کنندگان هم‌منطقه یا هم‌سازمان را از هم جدا کنید.",
            )}
          </p>
        </div>
        {dirty && (
          <span className="badge">
            {t("Unsaved draw draft", "پیش‌نویس ذخیره‌نشده قرعه")}
          </span>
        )}
      </div>
      {stale && (
        <Notice danger>
          {t(
            "This stage changed in another edit. Discard this draft and start from the saved rules.",
            "این مرحله در ویرایش دیگری تغییر کرده است. پیش‌نویس را کنار بگذارید و از قوانین ذخیره‌شده شروع کنید.",
          )}
        </Notice>
      )}
      {locked && (
        <Notice>
          {t(
            "The draw rules are locked. Apply or discard connection edits, or reset an unplayed draw before editing.",
            "قوانین قرعه قفل هستند. تغییرات اتصال را اعمال یا کنار بگذارید؛ برای ویرایش قرعه بدون نتیجه، ابتدا آن را بازنشانی کنید.",
          )}
        </Notice>
      )}
      <fieldset disabled={locked || stale} className="draw-fields">
        {!value ? (
          <div className="draw-intro">
            <p>
              {t(
                "The standard draw uses the selected seeding method. Turn on pot rules for a restricted group draw.",
                "قرعه معمول از روش سیدبندی انتخاب‌شده استفاده می‌کند. برای قرعه گروهی محدودشده، قوانین گلدان را فعال کنید.",
              )}
            </p>
            <button
              className="button secondary"
              onClick={() =>
                changed({ version: 1, pots: [], restrictions: [] })
              }
            >
              <Plus size={16} />
              {t("Configure pot draw", "تنظیم قرعه گلدانی")}
            </button>
          </div>
        ) : (
          <>
            <Notice>
              {t(
                "Each pot can have at most one entrant per group. Every active entrant must belong to one pot, or leave all pots empty to use restrictions alone. Previewing does not change matches.",
                "از هر گلدان حداکثر یک شرکت‌کننده وارد هر گروه می‌شود. همه شرکت‌کنندگان فعال باید در یک گلدان باشند؛ برای استفاده فقط از محدودیت‌ها، همه گلدان‌ها را حذف کنید. پیش‌نمایش دیدارها را تغییر نمی‌دهد.",
              )}
            </Notice>
            {!!stage.config.groups && (
              <Notice>
                {t(
                  "Applying these rules replaces the saved manual group assignments.",
                  "اعمال این قوانین، تقسیم‌بندی دستی ذخیره‌شده گروه‌ها را جایگزین می‌کند.",
                )}
              </Notice>
            )}
            <DrawPots
              value={value}
              entrants={entrants}
              groupCount={groupCount}
              sourcesReady={!sourcePreview || sourcePreview.ready}
              onChange={changed}
            />
            <h4>{t("Group restrictions", "محدودیت‌های گروه")}</h4>
            <p className="muted">
              {t(
                "Enter region and organization in Participants. Labels must be consistent; blank values must be filled before a restricted draw.",
                "منطقه و سازمان را در بخش شرکت‌کنندگان وارد کنید. نام‌ها باید یکسان باشند؛ پیش از قرعه محدودشده، مقادیر خالی را تکمیل کنید.",
              )}
            </p>
            {(["region", "organization"] as const).map((field) => {
              const restriction = value.restrictions.find(
                (item) => item.field === field,
              );
              const label =
                field === "region"
                  ? t(
                      "Limit entrants from the same region",
                      "محدودیت شرکت‌کنندگان هم‌منطقه",
                    )
                  : t(
                      "Limit entrants from the same organization",
                      "محدودیت شرکت‌کنندگان هم‌سازمان",
                    );
              return (
                <div className="draw-restriction" key={field}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={!!restriction}
                      onChange={(event) =>
                        changed({
                          ...value,
                          restrictions: [
                            ...value.restrictions.filter(
                              (item) => item.field !== field,
                            ),
                            ...(event.target.checked
                              ? [{ field, maxPerGroup: 1 }]
                              : []),
                          ],
                        })
                      }
                    />
                    {label}
                  </label>
                  {restriction && (
                    <Field
                      label={
                        field === "region"
                          ? t(
                              "Maximum from one region per group",
                              "حداکثر از یک منطقه در هر گروه",
                            )
                          : t(
                              "Maximum from one organization per group",
                              "حداکثر از یک سازمان در هر گروه",
                            )
                      }
                    >
                      <input
                        type="number"
                        min={1}
                        max={512}
                        value={restriction.maxPerGroup}
                        onChange={(event) => {
                          const count = Number(event.target.value);
                          if (
                            Number.isInteger(count) &&
                            count >= 1 &&
                            count <= 512
                          )
                            changed({
                              ...value,
                              restrictions: value.restrictions.map((item) =>
                                item.field === field
                                  ? { ...item, maxPerGroup: count }
                                  : item,
                              ),
                            });
                        }}
                      />
                    </Field>
                  )}
                </div>
              );
            })}
            <button className="text-button" onClick={() => onDraft(null)}>
              <RotateCcw size={15} />
              {t("Use standard draw", "استفاده از قرعه معمول")}
            </button>
          </>
        )}
      </fieldset>
      <div className="draw-actions">
        <button
          className="button secondary"
          disabled={locked || stale}
          onClick={() =>
            setPreview({
              key,
              result: previewGroupDraw(draftDocument, stage.id),
            })
          }
        >
          <Eye size={16} />
          {t("Preview group draw", "پیش‌نمایش قرعه گروهی")}
        </button>
        <button
          className="button primary"
          disabled={!dirty || locked || stale || !currentPreview?.ready}
          onClick={onApply}
        >
          <Check size={16} />
          {t("Apply draw rules", "اعمال قوانین قرعه")}
        </button>
        {dirty && (
          <button className="text-button" onClick={onDiscard}>
            {t("Discard draw edits", "کنار گذاشتن تغییرات قرعه")}
          </button>
        )}
      </div>
      {dirty && !currentPreview && (
        <p className="muted">
          {t(
            "Preview the current rules before applying them. Generate matches after the rules are saved.",
            "پیش از اعمال قوانین، پیش‌نمایش آن‌ها را ببینید. پس از ذخیره قوانین، دیدارها را بسازید.",
          )}
        </p>
      )}
      {currentPreview && (
        <div className="group-draw-preview" aria-live="polite">
          <h4>
            {currentPreview.ready
              ? t("Draw preview is ready", "پیش‌نمایش قرعه آماده است")
              : t("Draw needs attention", "قرعه به بررسی نیاز دارد")}
          </h4>
          {currentPreview.ready && (
            <DrawCeremony
              tournament={tournament}
              groups={currentPreview.groups}
              mode="group"
              seed={stage.config.seed}
              algorithm={currentPreview.algorithm}
            />
          )}
          {currentPreview.issueDetails.map((issue, index) => (
            <Notice danger key={index}>
              {groupDrawIssueText(issue, locale)}
            </Notice>
          ))}
          <div className="draw-group-grid">
            {currentPreview.groups.map((group, index) => (
              <section
                className="draw-preview-group"
                key={index}
                aria-label={`${t("Group", "گروه")} ${String.fromCharCode(65 + index)}`}
              >
                <h5>
                  {t("Group", "گروه")}{" "}
                  <bdi>{String.fromCharCode(65 + index)}</bdi>
                  <span>{group.length.toLocaleString(locale)}</span>
                </h5>
                <ol>
                  {group.map((id) => {
                    const participant = names.get(id);
                    return (
                      <li key={id}>
                        <bdi>{participant?.name ?? id}</bdi>
                        <small>
                          <bdi>
                            {[
                              value?.pots.find((pot) =>
                                pot.participantIds.includes(id),
                              )?.name,
                              participant?.region,
                              participant?.organization,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </bdi>
                        </small>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
          {currentPreview.ready && (
            <p className="muted">
              {t(
                "The same entrants, rules, and draw seed produce this draw again.",
                "با شرکت‌کنندگان، قوانین و بذر یکسان، همین قرعه دوباره ساخته می‌شود.",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
