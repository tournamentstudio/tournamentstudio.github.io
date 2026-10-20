import {
  ArrowDown,
  ArrowUp,
  Copy,
  Play,
  RotateCcw,
  Shuffle,
  Trash2,
} from "lucide-react";
import type { FormatId, Stage } from "../../domain/types";
import { formats } from "../../engine";
import { Field } from "../../components/ui";
import { formatName, useI18n } from "../../i18n";

interface Props {
  stage: Stage;
  locked: boolean;
  canReset: boolean;
  lockReason: string;
  hasDraft: boolean;
  onEdit: (patch: Partial<Stage>) => void;
  onReorder: (direction: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReset: () => void;
  onDraw: () => void;
  onAdvance: () => void;
  onRefreshEntrants: () => void;
}

export function StageSettings({
  stage,
  locked,
  canReset,
  lockReason,
  hasDraft,
  onEdit,
  onReorder,
  onDuplicate,
  onRemove,
  onReset,
  onDraw,
  onAdvance,
  onRefreshEntrants,
}: Props) {
  const { t, locale } = useI18n();
  return (
    <aside className="structure-settings">
      <div className="section-heading">
        <h3>{t("Stage settings", "تنظیمات مرحله")}</h3>
        <div className="button-row">
          <button
            className="icon-button"
            title={t("Move earlier", "جابجایی به قبل")}
            onClick={() => onReorder(-1)}
          >
            <ArrowUp size={16} />
          </button>
          <button
            className="icon-button"
            title={t("Move later", "جابجایی به بعد")}
            onClick={() => onReorder(1)}
          >
            <ArrowDown size={16} />
          </button>
          <button
            className="icon-button"
            title={t("Duplicate stage", "تکثیر مرحله")}
            onClick={onDuplicate}
          >
            <Copy size={16} />
          </button>
          <button
            className="icon-button"
            title={t("Remove stage", "حذف مرحله")}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <Field label={t("Stage name", "نام مرحله")}>
        <input
          key={stage.id + stage.name}
          defaultValue={stage.name}
          maxLength={180}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== stage.name) onEdit({ name });
          }}
        />
      </Field>
      <Field label={t("Format", "قالب")}>
        <select
          value={stage.format}
          disabled={locked || hasDraft}
          onChange={(event) =>
            onEdit({ format: event.target.value as FormatId })
          }
        >
          {formats.map((format) => (
            <option
              key={format.id}
              value={format.id}
              disabled={
                (!!stage.config.draw &&
                  format.id !== "groups" &&
                  format.id !== "gsl") ||
                (!!stage.config.knockoutDraw &&
                  format.id !== "single-elimination" &&
                  format.id !== "double-elimination")
              }
            >
              {formatName(format.id, locale)}
            </option>
          ))}
        </select>
      </Field>
      {!!stage.config.draw && (
        <p className="muted">
          {t(
            "To change to a non-group format, choose Use standard draw in Draw studio, preview it, and apply the rules first.",
            "برای تغییر به قالب غیرگروهی، ابتدا «استفاده از قرعه معمول» را در استودیوی قرعه انتخاب کنید، پیش‌نمایش را ببینید و قوانین را اعمال کنید.",
          )}
        </p>
      )}
      {!!stage.config.knockoutDraw && (
        <p className="muted">
          {t(
            "To change to another format family, choose Use standard draw in Draw studio, preview it, and apply the rules first.",
            "برای تغییر به خانواده دیگری از قالب‌ها، ابتدا «استفاده از قرعه معمول» را در استودیوی قرعه انتخاب کنید، پیش‌نمایش را ببینید و قوانین را اعمال کنید.",
          )}
        </p>
      )}
      {!stage.sources.length && (
        <button
          className="text-button"
          disabled={locked || hasDraft}
          onClick={onRefreshEntrants}
        >
          {t("Refresh entrant list", "به‌روز کردن فهرست ورودی")}
        </button>
      )}
      {locked && <p className="structure-lock-note">{lockReason}</p>}
      <div className="two-columns">
        {(
          [
            ["groupCount", t("Groups", "گروه‌ها"), 1, 128],
            ["meetings", t("Meetings", "تعداد رویارویی"), 1, 12],
            ["rounds", t("Rounds", "دورها"), 1, 100],
            ["capacity", t("Match capacity", "ظرفیت دیدار"), 2, 512],
          ] as const
        ).map(([key, label, min, max]) => (
          <Field key={key} label={label}>
            <input
              type="number"
              disabled={locked || hasDraft}
              min={min}
              max={max}
              value={stage.config[key]}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= min && value <= max)
                  onEdit({ config: { ...stage.config, [key]: value } });
              }}
            />
          </Field>
        ))}
      </div>
      <Field label={t("Draw seed", "بذر قرعه")}>
        <input
          disabled={locked || hasDraft}
          key={stage.id + stage.config.seed}
          defaultValue={stage.config.seed}
          maxLength={240}
          onBlur={(event) => {
            if (event.target.value !== stage.config.seed)
              onEdit({ config: { ...stage.config, seed: event.target.value } });
          }}
        />
      </Field>
      <Field label={t("Seeding", "سیدبندی")}>
        <select
          value={stage.config.seeding}
          disabled={locked || hasDraft}
          onChange={(event) =>
            onEdit({
              config: {
                ...stage.config,
                seeding: event.target.value as Stage["config"]["seeding"],
              },
            })
          }
        >
          {[
            ["ranked", "Ranked", "رتبه‌بندی"],
            ["random", "Random", "تصادفی"],
            ["snake", "Snake", "مارپیچی"],
            ["manual", "Manual order", "ترتیب دستی"],
          ].map(([id, en, fa]) => (
            <option value={id} key={id}>
              {t(en, fa)}
            </option>
          ))}
        </select>
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={locked || hasDraft}
          checked={stage.config.thirdPlace}
          onChange={(event) =>
            onEdit({
              config: { ...stage.config, thirdPlace: event.target.checked },
            })
          }
        />
        {t("Third-place match", "دیدار رده‌بندی")}
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={locked || hasDraft}
          checked={stage.config.grandFinalReset}
          onChange={(event) =>
            onEdit({
              config: {
                ...stage.config,
                grandFinalReset: event.target.checked,
              },
            })
          }
        />
        {t("Double elimination final reset", "بازنشانی فینال دو حذفی")}
      </label>
      <div className="form-stack">
        <button
          className="button primary"
          disabled={locked || hasDraft}
          onClick={onDraw}
        >
          <Shuffle size={16} />
          {t("Generate draw", "ساخت قرعه")}
        </button>
        <button
          className="button secondary"
          disabled={hasDraft}
          onClick={onAdvance}
        >
          <Play size={16} />
          {t("Advance / next round", "صعود / دور بعد")}
        </button>
        {canReset && (
          <button className="text-button" onClick={onReset}>
            <RotateCcw size={15} />
            {t("Reset unplayed draw", "بازنشانی قرعه بدون نتیجه")}
          </button>
        )}
      </div>
      {hasDraft && (
        <p className="muted">
          {t(
            "Apply or discard connection and draw edits before changing settings or generating matches.",
            "پیش از تغییر تنظیمات یا ساخت دیدارها، تغییرات اتصال و قرعه را اعمال یا کنار بگذارید.",
          )}
        </p>
      )}
    </aside>
  );
}
