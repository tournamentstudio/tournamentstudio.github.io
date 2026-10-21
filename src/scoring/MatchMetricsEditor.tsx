import type { Locale } from "../domain/types";
import type { MetricDefinition, MetricValues } from "./metrics";
import { Field } from "../components/ui";
import { useState } from "react";

function JudgeInput({
  value,
  count,
  onChange,
  label,
}: {
  value: number | number[] | null | undefined;
  count: number;
  onChange: (value: number[] | null) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<{ serialized: string; raw: string }>();
  const serialized = JSON.stringify(value),
    raw =
      draft && draft.serialized === serialized
        ? draft.raw
        : Array.isArray(value)
          ? value.join(", ")
          : "";
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder={Array.from({ length: count }, () => "0").join(", ")}
      maxLength={300}
      value={raw}
      onChange={(event) => {
        const raw = event.target.value,
          normalized = raw.replace(/،/g, ",");
        const parsed = normalized.trim()
          ? normalized
              .split(",")
              .map((part) => (part.trim() === "" ? NaN : Number(part)))
          : null;
        setDraft({ serialized: JSON.stringify(parsed), raw });
        onChange(parsed);
      }}
    />
  );
}

export function MatchMetricsEditor({
  definitions,
  values,
  onChange,
  names,
  locale,
}: {
  definitions: MetricDefinition[];
  values: MetricValues;
  onChange: (values: MetricValues) => void;
  names: string[];
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const edit = (id: string, index: number, value: number | number[] | null) =>
    onChange({
      ...values,
      [id]: names.map((_, i) =>
        i === index ? value : (values[id]?.[i] ?? null),
      ),
    });
  if (!definitions.length) return null;
  return (
    <section className="panel inset-panel">
      <h3>{t("Recorded sport statistics", "آمار ورزشی ثبت‌شده")}</h3>
      <p>
        {t(
          "Values are included in public results. Missing statistics stay empty. Enter judge scores separated by commas.",
          "مقادیر در نتایج عمومی قرار می‌گیرند. آمار ثبت‌نشده خالی می‌ماند. امتیاز داوران را با ویرگول جدا کنید.",
        )}
      </p>
      {definitions.map((d) => (
        <fieldset className="panel inset-panel" key={d.id}>
          <legend>
            {d.name}
            {d.unit ? ` (${d.unit})` : ""}
          </legend>
          {d.kind === "placement" && (
            <p>
              {t(
                "Enter finishing ranks, such as 1, 1, 3 for a tie. Points are calculated from the configured table after every entrant has a rank.",
                "رتبه پایان را وارد کنید؛ برای تساوی مانند ۱، ۱، ۳. پس از ثبت رتبه همه شرکت‌کنندگان، امتیاز از جدول تنظیم‌شده محاسبه می‌شود.",
              )}
            </p>
          )}
          <div className="two-columns">
            {names.map((name, index) => {
              const value = values[d.id]?.[index];
              return (
                <Field key={index} label={`${d.name}: ${name}`}>
                  {d.kind === "judges" ? (
                    <JudgeInput
                      label={`${d.name}: ${name}`}
                      value={value}
                      count={d.judgeCount ?? 3}
                      onChange={(value) => edit(d.id, index, value)}
                    />
                  ) : (
                    <input
                      type="number"
                      step={d.kind === "placement" ? 1 : "any"}
                      min={d.kind === "placement" ? 1 : d.min}
                      max={d.kind === "placement" ? names.length : d.max}
                      value={typeof value === "number" ? value : ""}
                      onChange={(event) =>
                        edit(
                          d.id,
                          index,
                          event.target.value
                            ? event.currentTarget.valueAsNumber
                            : null,
                        )
                      }
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
    </section>
  );
}
