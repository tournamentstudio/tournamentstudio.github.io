import { useState } from "react";
import { uid, type Tournament } from "../domain/types";
import { ErrorText, Field, Modal } from "../components/ui";
import { useI18n } from "../i18n";
import { savePlayerMetric, type PlayerMetric } from "./model";

export function PlayerMetricEditor({
  tournament,
  metric,
  onSave,
  onClose,
}: {
  tournament: Tournament;
  metric?: PlayerMetric;
  onSave: (doc: Tournament, action: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<PlayerMetric>(
    metric ?? {
      id: uid(),
      label: "",
      fa: "",
      unit: "",
      type: "integer",
      aggregation: "sum",
      min: 0,
      max: 1000000,
      archived: false,
    },
  );
  const [error, setError] = useState<unknown>();
  function save() {
    try {
      onSave(savePlayerMetric(tournament, value), "Configured player metric");
      onClose();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Modal
      title={
        metric
          ? t("Edit player metric", "ویرایش شاخص بازیکن")
          : t("Add player metric", "افزودن شاخص بازیکن")
      }
      onClose={onClose}
    >
      <form
        className="player-metric-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="form-grid">
          <Field label={t("Metric name", "نام شاخص")}>
            <input
              required
              maxLength={160}
              value={value.label}
              onChange={(e) => setValue({ ...value, label: e.target.value })}
            />
          </Field>
          <Field label={t("Persian metric name", "نام فارسی شاخص")}>
            <input
              maxLength={160}
              value={value.fa ?? ""}
              onChange={(e) => setValue({ ...value, fa: e.target.value })}
            />
          </Field>
          <Field label={t("Metric unit", "واحد شاخص")}>
            <input
              maxLength={40}
              value={value.unit}
              onChange={(e) => setValue({ ...value, unit: e.target.value })}
            />
          </Field>
          <Field label={t("Metric value type", "نوع مقدار شاخص")}>
            <select
              value={value.type}
              onChange={(e) =>
                setValue({
                  ...value,
                  type: e.target.value as PlayerMetric["type"],
                })
              }
            >
              <option value="integer">{t("Whole number", "عدد صحیح")}</option>
              <option value="decimal">
                {t("Decimal number", "عدد اعشاری")}
              </option>
            </select>
          </Field>
          <Field label={t("Player aggregation", "روش محاسبه بازیکن")}>
            <select
              value={value.aggregation}
              onChange={(e) =>
                setValue({
                  ...value,
                  aggregation: e.target.value as PlayerMetric["aggregation"],
                })
              }
            >
              <option value="sum">
                {t("Sum of recorded values", "جمع مقادیر ثبت شده")}
              </option>
              <option value="average">
                {t("Mean of recorded values", "میانگین مقادیر ثبت شده")}
              </option>
              <option value="min">
                {t("Lowest recorded value", "کمترین مقدار ثبت شده")}
              </option>
              <option value="max">
                {t("Highest recorded value", "بیشترین مقدار ثبت شده")}
              </option>
            </select>
          </Field>
          <Field label={t("Metric minimum", "کمینه شاخص")}>
            <input
              required
              type="number"
              step="any"
              min="-1000000000"
              max="1000000000"
              value={value.min}
              onChange={(e) =>
                setValue({ ...value, min: Number(e.target.value) })
              }
            />
          </Field>
          <Field label={t("Metric maximum", "بیشینه شاخص")}>
            <input
              required
              type="number"
              step="any"
              min="-1000000000"
              max="1000000000"
              value={value.max}
              onChange={(e) =>
                setValue({ ...value, max: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.archived}
            onChange={(e) => setValue({ ...value, archived: e.target.checked })}
          />
          {t(
            "Archive metric (keep existing records)",
            "بایگانی شاخص (حفظ سوابق)",
          )}
        </label>
        <p>
          {t(
            "Metrics describe observations, not official scores. An average uses only recorded values, never assumed zeroes. Type, unit, and aggregation are locked after use.",
            "شاخص‌ها مشاهده‌ها را توصیف می‌کنند و امتیاز رسمی نیستند. میانگین فقط از مقدارهای ثبت شده محاسبه می‌شود، نه صفرهای فرضی. نوع، واحد و روش محاسبه پس از استفاده قفل می‌شوند.",
          )}
        </p>
        <ErrorText error={error} />
        <button className="button primary">
          {t("Save player metric", "ذخیره شاخص بازیکن")}
        </button>
      </form>
    </Modal>
  );
}
