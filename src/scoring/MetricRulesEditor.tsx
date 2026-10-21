import { Field, Notice } from "../components/ui";
import { uid, type Locale } from "../domain/types";
import { metricSuggestions, type MetricDefinition } from "./metrics";
import { useState } from "react";

function PlacementTable({
  points,
  onChange,
  label,
}: {
  points: number[];
  onChange: (points: number[]) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<{ serialized: string; raw: string }>();
  const serialized = JSON.stringify(points);
  return (
    <input
      aria-label={label}
      maxLength={6000}
      value={draft?.serialized === serialized ? draft.raw : points.join(", ")}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = raw
          .replace(/،/g, ",")
          .split(",")
          .map((part) => (part.trim() ? Number(part) : NaN));
        setDraft({ serialized: JSON.stringify(parsed), raw });
        onChange(parsed);
      }}
    />
  );
}

export function MetricRulesEditor({
  definitions,
  onChange,
  locale,
  sport,
  disabled = false,
}: {
  definitions: MetricDefinition[];
  onChange: (definitions: MetricDefinition[]) => void;
  locale: Locale;
  sport: string;
  disabled?: boolean;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const edit = (id: string, changes: Partial<MetricDefinition>) =>
    onChange(definitions.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  const add = (
    name: string,
    unit = "",
    max = 1000,
    aggregate: MetricDefinition["aggregate"] = "sum",
  ) =>
    onChange([
      ...definitions,
      { id: uid(), name, unit, max, min: 0, kind: "number", aggregate },
    ]);
  return (
    <fieldset className="panel inset-panel" disabled={disabled}>
      <legend>
        {t(
          "Sport statistics and scoring dimensions",
          "آمار ورزشی و ابعاد امتیازدهی",
        )}
      </legend>
      <Notice>
        {t(
          "These recorded statistics are public. Leave missing values empty. A nonzero weight includes a dimension in weighted scoring; no formulas or code are accepted. Judge means and weighted totals round to six decimal places.",
          "این آمار ثبت‌شده عمومی است. مقادیر ثبت‌نشده را خالی بگذارید. وزن غیرصفر یک بُعد را وارد امتیازدهی وزنی می‌کند؛ فرمول یا کد پذیرفته نمی‌شود. میانگین داوران و مجموع وزنی تا شش رقم اعشار گرد می‌شوند.",
        )}
      </Notice>
      {disabled && (
        <p>
          {t(
            "Recorded dimensions are locked to preserve existing scores and statistics.",
            "ابعاد ثبت‌شده برای حفظ امتیازها و آمار موجود قفل هستند.",
          )}
        </p>
      )}
      {definitions.map((d) => (
        <fieldset className="panel inset-panel" key={d.id}>
          <legend>{d.name}</legend>
          <div className="two-columns">
            <Field label={t("Dimension name", "نام بُعد")}>
              <input
                maxLength={120}
                value={d.name}
                onChange={(event) => edit(d.id, { name: event.target.value })}
              />
            </Field>
            <Field label={t("Unit", "واحد")}>
              <input
                maxLength={40}
                value={d.unit}
                onChange={(event) => edit(d.id, { unit: event.target.value })}
              />
            </Field>
            <Field label={t("Dimension type", "نوع بُعد")}>
              <select
                value={d.kind}
                onChange={(event) =>
                  edit(d.id, {
                    kind: event.target.value as MetricDefinition["kind"],
                    ...(event.target.value === "judges"
                      ? { judgeCount: 3, judgeMethod: "average" }
                      : { judgeCount: undefined, judgeMethod: undefined }),
                    ...(event.target.value === "placement"
                      ? {
                          min: 1,
                          max: 512,
                          placementPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
                        }
                      : { placementPoints: undefined }),
                  })
                }
              >
                <option value="number">
                  {t("One measured number", "یک مقدار اندازه‌گیری‌شده")}
                </option>
                <option value="judges">
                  {t("Panel of judges", "هیئت داوران")}
                </option>
                <option value="placement">
                  {t(
                    "Points from finishing place",
                    "امتیاز بر اساس رتبه پایان",
                  )}
                </option>
              </select>
            </Field>
            <Field
              label={t("Across-match statistic", "محاسبه آمار بین دیدارها")}
            >
              <select
                value={d.aggregate}
                onChange={(event) =>
                  edit(d.id, {
                    aggregate: event.target
                      .value as MetricDefinition["aggregate"],
                  })
                }
              >
                <option value="sum">{t("Sum", "مجموع")}</option>
                <option value="average">
                  {t("Average of recorded values", "میانگین مقادیر ثبت‌شده")}
                </option>
                <option value="min">{t("Minimum", "کمترین")}</option>
                <option value="max">{t("Maximum", "بیشترین")}</option>
              </select>
            </Field>
            {d.kind !== "placement" &&
              (["min", "max"] as const).map((key) => (
                <Field
                  key={key}
                  label={
                    key === "min"
                      ? t("Minimum allowed value", "کمترین مقدار مجاز")
                      : t("Maximum allowed value", "بیشترین مقدار مجاز")
                  }
                >
                  <input
                    type="number"
                    min={-1000000}
                    max={1000000}
                    value={d[key]}
                    onChange={(event) => {
                      if (Number.isFinite(event.currentTarget.valueAsNumber))
                        edit(d.id, {
                          [key]: event.currentTarget.valueAsNumber,
                        });
                    }}
                  />
                </Field>
              ))}
            {d.kind === "placement" && (
              <Field
                label={t(
                  "Points for first, second, third and later places",
                  "امتیاز رتبه اول، دوم، سوم و رتبه‌های بعد",
                )}
                hint={t(
                  "Enter finishing ranks during the match. Tied places share the average points for the positions they occupy. Places beyond this table receive zero.",
                  "در دیدار رتبه پایان را وارد کنید. رتبه‌های مساوی میانگین امتیاز جایگاه‌های اشغال‌شده را می‌گیرند. رتبه‌های پس از این جدول صفر امتیاز دارند.",
                )}
              >
                <PlacementTable
                  label={t("Placement points table", "جدول امتیاز رتبه‌ها")}
                  points={d.placementPoints ?? []}
                  onChange={(placementPoints) =>
                    edit(d.id, { placementPoints })
                  }
                />
              </Field>
            )}
            <Field
              label={t(
                "Scoring weight (empty means statistics only)",
                "وزن امتیازدهی (خالی یعنی فقط آمار)",
              )}
            >
              <input
                type="number"
                step="any"
                min={-1000}
                max={1000}
                value={d.weight ?? ""}
                onChange={(event) => {
                  if (!event.target.value) edit(d.id, { weight: undefined });
                  else if (Number.isFinite(event.currentTarget.valueAsNumber))
                    edit(d.id, { weight: event.currentTarget.valueAsNumber });
                }}
              />
            </Field>
            {d.kind === "judges" && (
              <>
                <Field label={t("Number of judges", "تعداد داوران")}>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={d.judgeCount ?? 3}
                    onChange={(event) =>
                      edit(d.id, {
                        judgeCount: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </Field>
                <Field label={t("Judge calculation", "محاسبه داوران")}>
                  <select
                    value={d.judgeMethod ?? "average"}
                    onChange={(event) =>
                      edit(d.id, {
                        judgeMethod: event.target
                          .value as MetricDefinition["judgeMethod"],
                      })
                    }
                  >
                    <option value="average">{t("Average", "میانگین")}</option>
                    <option value="sum">{t("Sum", "مجموع")}</option>
                    <option value="trimmed-mean">
                      {t(
                        "Drop one highest and lowest, average the rest",
                        "حذف یک بیشترین و یک کمترین، میانگین بقیه",
                      )}
                    </option>
                  </select>
                </Field>
              </>
            )}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange(definitions.filter((item) => item.id !== d.id))
            }
          >
            {t("Remove dimension", "حذف بُعد")}
          </button>
        </fieldset>
      ))}
      <div className="button-row">
        <button
          type="button"
          disabled={definitions.length >= 20}
          className="button secondary"
          onClick={() =>
            add(`${t("Metric", "معیار")} ${definitions.length + 1}`)
          }
        >
          {t("Add dimension", "افزودن بُعد")}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={definitions.length >= 20}
          onClick={() =>
            onChange([
              ...definitions,
              {
                id: uid(),
                name: t("Finishing place", "رتبه پایان"),
                unit: t("points", "امتیاز"),
                kind: "placement",
                aggregate: "sum",
                min: 1,
                max: 512,
                weight: 1,
                placementPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
              },
            ])
          }
        >
          {t("Add placement points", "افزودن امتیاز رتبه")}
        </button>
        {(metricSuggestions[sport] ?? []).map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            disabled={definitions.length >= 20}
            className="text-button"
            onClick={() =>
              add(
                t(suggestion.name, suggestion.fa),
                t(suggestion.unit, suggestion.unitFa),
                suggestion.max,
                suggestion.aggregate,
              )
            }
          >
            {t("Add", "افزودن")} {t(suggestion.name, suggestion.fa)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
