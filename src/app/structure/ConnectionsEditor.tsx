import { useState } from "react";
import { Check, Link2, Plus, RotateCcw } from "lucide-react";
import type {
  Advancement,
  AdvancementPreview,
  Stage,
  Tournament,
} from "../../domain/types";
import { previewAdvancement, validateGraph } from "../../engine";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { SourceRule } from "./SourceRule";
import { QualifierPreview } from "./QualifierPreview";

interface Props {
  tournament: Tournament;
  stage: Stage;
  sources: Advancement[];
  locked: boolean;
  dirty: boolean;
  onDraft: (sources: Advancement[]) => void;
  onApply: () => void;
  onDiscard: () => void;
}

export function ConnectionsEditor({
  tournament,
  stage,
  sources,
  locked,
  dirty,
  onDraft,
  onApply,
  onDiscard,
}: Props) {
  const { t } = useI18n();
  const available = tournament.stages.filter((item) => item.id !== stage.id);
  const [sourceId, setSourceId] = useState(available[0]?.id ?? "");
  const chosenSource = available.some((item) => item.id === sourceId)
    ? sourceId
    : (available[0]?.id ?? "");
  const draftStage = {
    ...stage,
    sources,
    participantIds: sources.length ? [] : stage.participantIds,
  };
  const draft = {
    ...tournament,
    stages: tournament.stages.map((item) =>
      item.id === stage.id ? draftStage : item,
    ),
  };
  const graphIssues = validateGraph(draft);
  let preview: AdvancementPreview | undefined;
  let previewError: string | undefined;
  if (sources.length) {
    try {
      preview = previewAdvancement(draft, stage.id);
    } catch (error) {
      previewError = error instanceof Error ? error.message : String(error);
    }
  }
  return (
    <section
      className="structure-connections"
      aria-label={t("Stage connections", "اتصال‌های مرحله")}
    >
      <div className="section-heading">
        <div>
          <h3>
            <Link2 size={19} />
            {t("Entrants and connections", "ورودی‌ها و اتصال‌ها")}
          </h3>
          <p>
            {t(
              "Combine sources, select exact places, or compare wildcard candidates.",
              "مبدأها را ترکیب کنید، جایگاه دقیق انتخاب کنید یا نامزدهای سهمیه آزاد را مقایسه کنید.",
            )}
          </p>
        </div>
        {dirty && (
          <span className="badge">
            {t("Unsaved connection draft", "پیش‌نویس اتصال ذخیره‌نشده")}
          </span>
        )}
      </div>
      {locked && (
        <Notice>
          {t(
            "Connections are locked while this stage or a later stage has a draw. Reset an eligible unplayed draw first, or duplicate the tournament to redesign it.",
            "تا زمانی که این مرحله یا مرحله بعدی قرعه دارد، اتصال‌ها قفل هستند. ابتدا قرعه بدون نتیجه را بازنشانی کنید یا برای طراحی دوباره مسابقات را تکثیر کنید.",
          )}
        </Notice>
      )}
      <fieldset disabled={locked} className="structure-connections-fields">
        {!sources.length && (
          <Notice>
            {t(
              "This stage uses its assigned participants directly. Add a source to qualify entrants from earlier stages.",
              "این مرحله از شرکت‌کنندگان تعیین‌شده استفاده می‌کند. برای صعود از مراحل دیگر، یک مبدأ اضافه کنید.",
            )}
          </Notice>
        )}
        {sources.map((source, index) => (
          <SourceRule
            key={index}
            tournament={tournament}
            destination={stage}
            source={source}
            index={index}
            onChange={(value) =>
              onDraft(
                sources.map((entry, position) =>
                  position === index ? value : entry,
                ),
              )
            }
            onRemove={() =>
              onDraft(sources.filter((_, position) => position !== index))
            }
          />
        ))}
        {!!available.length && (
          <div className="structure-add-connection">
            <Field label={t("New connection source", "مبدأ اتصال جدید")}>
              <select
                value={chosenSource}
                onChange={(event) => setSourceId(event.target.value)}
              >
                {available.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="button secondary"
              onClick={() =>
                onDraft([
                  ...sources,
                  { stageId: chosenSource, count: 1, perGroup: false },
                ])
              }
            >
              <Plus size={16} />
              {t("Add connection", "افزودن اتصال")}
            </button>
          </div>
        )}
        {!!sources.length && (
          <button className="text-button" onClick={() => onDraft([])}>
            {t(
              "Use all active participants instead",
              "استفاده از همه شرکت‌کنندگان فعال",
            )}
          </button>
        )}
      </fieldset>
      <div className="structure-connection-actions">
        <button
          className="button primary"
          disabled={locked || !dirty || graphIssues.length > 0}
          onClick={onApply}
        >
          <Check size={16} />
          {t("Apply connections", "اعمال اتصال‌ها")}
        </button>
        <button
          className="button secondary"
          disabled={!dirty}
          onClick={onDiscard}
        >
          <RotateCcw size={16} />
          {t("Discard connection edits", "کنار گذاشتن تغییرات اتصال")}
        </button>
      </div>
      {!!graphIssues.length && (
        <Notice danger>
          <ul>
            {graphIssues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </Notice>
      )}
      {previewError && <Notice danger>{previewError}</Notice>}
      {preview && (
        <QualifierPreview
          tournament={tournament}
          stage={draftStage}
          preview={preview}
        />
      )}
    </section>
  );
}
