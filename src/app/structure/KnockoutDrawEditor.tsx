import { useState } from "react";
import { Check, Eye, GitBranch, Plus, RotateCcw } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
  Participant,
  Stage,
  Tournament,
} from "../../domain/types";
import {
  knockoutDrawIssueText,
  previewAdvancement,
  previewKnockoutDraw,
} from "../../engine";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { DrawPots } from "./DrawPots";
import "./draw.css";

interface Props {
  tournament: Tournament;
  stage: Stage;
  value: KnockoutDrawConfig | null;
  dirty: boolean;
  stale: boolean;
  locked: boolean;
  onDraft: (value: KnockoutDrawConfig | null) => void;
  onDiscard: () => void;
  onApply: () => void;
}

export function withKnockoutDraw(
  stage: Stage,
  value: KnockoutDrawConfig | null,
): Stage {
  const config = { ...stage.config };
  if (value) config.knockoutDraw = structuredClone(value);
  else delete config.knockoutDraw;
  return { ...stage, config };
}

export function KnockoutDrawEditor({
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
    result: KnockoutDrawPreview;
  }>();
  const draftDocument: Tournament = {
    ...tournament,
    stages: tournament.stages.map((item) =>
      item.id === stage.id ? withKnockoutDraw(item, value) : item,
    ),
  };
  const key = JSON.stringify(draftDocument);
  const currentPreview = preview?.key === key ? preview.result : undefined;
  const sourcePreview = stage.sources.length
    ? previewAdvancement(tournament, stage.id)
    : undefined;
  const entrantIds = sourcePreview?.participantIds ?? stage.participantIds;
  const names = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  );
  const entrants = entrantIds
    .map((id) => names.get(id))
    .filter(
      (participant): participant is Participant =>
        !!participant && participant.status === "active",
    );
  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, entrants.length)));
  const byeCount = bracketSize - entrants.length;
  return (
    <section
      className="knockout-draw-editor"
      aria-label={t("Knockout draw and restrictions", "قرعه حذفی و محدودیت‌ها")}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("Draw studio", "استودیوی قرعه")}</span>
          <h3>
            <GitBranch size={18} />
            {t("Shape the opening round", "رویارویی‌های دور نخست")}
          </h3>
          <p>
            {t(
              "Separate seed pots, regions, or organizations in the first round of the winners bracket.",
              "در دور نخست جدول برندگان، شرکت‌کنندگان یک گلدان، منطقه یا سازمان را از هم جدا کنید.",
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
                "The standard bracket follows your seeding method and source slots. Configure rules to restrict its opening pairings.",
                "جدول معمول از روش سیدبندی و جایگاه‌های ورودی شما پیروی می‌کند. برای محدود کردن رویارویی‌های آغازین، قوانین را تنظیم کنید.",
              )}
            </p>
            <button
              className="button secondary"
              onClick={() =>
                onDraft({
                  version: 1,
                  pots: [],
                  restrictions: [],
                  protectedSeeds: 0,
                })
              }
            >
              <Plus size={16} />
              {t("Configure knockout draw", "تنظیم قرعه حذفی")}
            </button>
          </div>
        ) : (
          <>
            <Notice>
              {t(
                "These rules apply to the first round only. Entrants can meet again in later rounds or in the losers bracket. No restriction is relaxed automatically.",
                "این قوانین فقط برای دور نخست هستند. شرکت‌کنندگان ممکن است در دورهای بعد یا جدول بازندگان با هم روبه‌رو شوند. هیچ محدودیتی خودکار کنار گذاشته نمی‌شود.",
              )}
            </Notice>
            <p className="muted">
              {t(
                "Each opening match accepts at most one entrant from a pot. Assign every active entrant to one pot, or leave all pots empty to use region and organization rules alone.",
                "هر دیدار آغازین حداکثر یک شرکت‌کننده از هر گلدان دارد. همه شرکت‌کنندگان فعال را در یک گلدان قرار دهید؛ برای استفاده فقط از محدودیت منطقه و سازمان، همه گلدان‌ها را حذف کنید.",
              )}
            </p>
            <DrawPots
              value={value}
              entrants={entrants}
              groupCount={bracketSize / 2}
              summaryLabel={t("Opening matches", "دیدارهای آغازین")}
              sourcesReady={!sourcePreview || sourcePreview.ready}
              onChange={onDraft}
            />
            <h4>{t("Opening-round restrictions", "محدودیت‌های دور نخست")}</h4>
            <p className="muted">
              {t(
                "Enter region and organization in Participants. Use consistent labels and fill blank values before previewing a restricted draw.",
                "منطقه و سازمان را در بخش شرکت‌کنندگان وارد کنید. پیش از پیش‌نمایش قرعه محدودشده، نام‌ها را یکسان و مقادیر خالی را تکمیل کنید.",
              )}
            </p>
            {(["region", "organization"] as const).map((field) => (
              <div className="draw-restriction" key={field}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={value.restrictions.includes(field)}
                    onChange={(event) =>
                      onDraft({
                        ...value,
                        restrictions: [
                          ...value.restrictions.filter(
                            (item) => item !== field,
                          ),
                          ...(event.target.checked ? [field] : []),
                        ],
                      })
                    }
                  />
                  {field === "region"
                    ? t(
                        "Separate the same region",
                        "جدا کردن شرکت‌کنندگان هم‌منطقه",
                      )
                    : t(
                        "Separate the same organization",
                        "جدا کردن شرکت‌کنندگان هم‌سازمان",
                      )}
                </label>
              </div>
            ))}
            <Field
              label={t("Protected seed positions", "جایگاه‌های سید محافظت‌شده")}
            >
              <input
                type="number"
                min={0}
                max={entrants.length || 512}
                value={value.protectedSeeds}
                onChange={(event) => {
                  const count = Number(event.target.value);
                  if (Number.isInteger(count) && count >= 0 && count <= 512)
                    onDraft({ ...value, protectedSeeds: count });
                }}
              />
            </Field>
            <p className="muted">
              {t(
                "Protect the first N entrants in the selected seeding order at their standard bracket positions. Other entrants may move to satisfy restrictions. Fixed slots from stage connections always stay fixed.",
                "جایگاه استاندارد N شرکت‌کننده نخست در ترتیب سیدبندی انتخاب‌شده را حفظ کنید. دیگران ممکن است برای رعایت محدودیت‌ها جابه‌جا شوند. جایگاه‌های ثابت اتصال‌های مراحل همیشه حفظ می‌شوند.",
              )}
            </p>
            {entrants.length > 1 && (
              <Notice>
                {t("Automatic BYEs", "استراحت‌های خودکار")}:{" "}
                {byeCount.toLocaleString(locale)}.{" "}
                {t(
                  "BYEs go to the first entrants in the selected seeding order. Their positions can move unless protected or fixed. No extra BYEs are added to avoid a restriction.",
                  "استراحت به شرکت‌کنندگان نخست در ترتیب سیدبندی انتخاب‌شده می‌رسد. جایگاه آن‌ها در صورت ثابت یا محافظت‌شده نبودن قابل جابه‌جایی است. برای دور زدن محدودیت، استراحت اضافه ساخته نمی‌شود.",
                )}
              </Notice>
            )}
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
              result: previewKnockoutDraw(draftDocument, stage.id),
            })
          }
        >
          <Eye size={16} />
          {t("Preview knockout draw", "پیش‌نمایش قرعه حذفی")}
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
        <div className="knockout-draw-preview" aria-live="polite">
          <h4>
            {currentPreview.ready
              ? t("Draw preview is ready", "پیش‌نمایش قرعه آماده است")
              : t("Draw needs attention", "قرعه به بررسی نیاز دارد")}
          </h4>
          {currentPreview.issueDetails.map((issue, index) => (
            <Notice danger key={index}>
              {knockoutDrawIssueText(issue, locale)}
            </Notice>
          ))}
          <div className="draw-group-grid">
            {Array.from(
              { length: currentPreview.slots.length / 2 },
              (_, index) => (
                <section className="draw-preview-pair" key={index}>
                  <h5>
                    {t("Opening match", "دیدار آغازین")}{" "}
                    {(index + 1).toLocaleString(locale)}
                  </h5>
                  <ol>
                    {currentPreview.slots
                      .slice(index * 2, index * 2 + 2)
                      .map((id, offset) => {
                        const slot = index * 2 + offset + 1;
                        const participant = id ? names.get(id) : undefined;
                        return (
                          <li key={slot} data-participant-id={id ?? ""}>
                            <small className="draw-slot-label">
                              {t("Slot", "جایگاه")}{" "}
                              {slot.toLocaleString(locale)}
                              {currentPreview.fixedSlots.some(
                                (fixed) => fixed.slot === slot,
                              ) && (
                                <span className="badge">
                                  {t("Fixed slot", "جایگاه ثابت")}
                                </span>
                              )}
                            </small>
                            <bdi>
                              {participant?.name ?? id ?? t("BYE", "استراحت")}
                            </bdi>
                            {participant && (
                              <small>
                                <bdi>
                                  {[
                                    value?.pots.find((pot) =>
                                      pot.participantIds.includes(
                                        participant.id,
                                      ),
                                    )?.name,
                                    participant.region,
                                    participant.organization,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </bdi>
                              </small>
                            )}
                          </li>
                        );
                      })}
                  </ol>
                </section>
              ),
            )}
          </div>
          {currentPreview.ready && (
            <p className="muted">
              {t(
                "The same entrants, rules, source slots, and draw seed produce these pairings again.",
                "با شرکت‌کنندگان، قوانین، جایگاه‌های ورودی و بذر یکسان، همین رویارویی‌ها دوباره ساخته می‌شوند.",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
