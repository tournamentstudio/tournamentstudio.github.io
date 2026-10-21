import { Field } from "../components/ui";
import { aggregateAwayWinner, type AggregatePolicy } from "../domain/aggregate";
import type { Locale } from "../domain/types";

export function AggregateProposalEditor({
  policy,
  legs,
  onChange,
  names,
  locale,
}: {
  policy: AggregatePolicy;
  legs: string[][];
  onChange: (legs: string[][]) => void;
  names: string[];
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const regulation = legs.slice(0, policy.legs),
    tied =
      regulation.length === policy.legs &&
      regulation.every(
        (row) =>
          row.length === 2 &&
          row.every((value) => value.trim() && Number.isFinite(Number(value))),
      ) &&
      regulation.reduce(
        (sum, row) => sum + Number(row[0]) - Number(row[1]),
        0,
      ) === 0;
  let awayWinner: string | undefined;
  if (tied) {
    try {
      awayWinner = aggregateAwayWinner(
        policy,
        ["0", "1"],
        regulation.map((row) => row.map(Number)),
      );
    } catch {
      /* Invalid totals are reported when exporting the proposal. */
    }
  }
  return (
    <fieldset className="panel inset-panel">
      <legend>{t("Aggregate leg proposal", "پیشنهاد نتیجه رفت‌وبرگشت")}</legend>
      <p>
        {t(
          "Enter each leg in the same entrant order. Totals are calculated. Select the winner only when an agreed tiebreak ruling is required.",
          "هر بازی را با ترتیب ثابت شرکت‌کنندگان وارد کنید. مجموع محاسبه می‌شود. برنده را فقط برای حکم رفع تساوی توافق‌شده انتخاب کنید.",
        )}
      </p>
      {policy.awayGoals && (
        <p>
          {t(
            "Regulation away goals resolve a tied total. The first entrant hosts odd legs, the second hosts even legs; extra-leg away goals do not count.",
            "گل خارج از خانه در بازی‌های اصلی مجموع مساوی را تعیین تکلیف می‌کند. شرکت‌کننده اول میزبان بازی‌های فرد و شرکت‌کننده دوم میزبان بازی‌های زوج است؛ گل خارج از خانه بازی اضافه محاسبه نمی‌شود.",
          )}
        </p>
      )}
      {awayWinner && (
        <p role="status">
          {t("Winner on away goals", "برنده با گل خارج از خانه")}:{" "}
          {names[Number(awayWinner)]}
        </p>
      )}
      {legs.map((row, leg) => (
        <fieldset key={leg}>
          <legend>
            {t("Leg", "بازی")} {(leg + 1).toLocaleString(locale)}
          </legend>
          <div className="two-columns">
            {names.map((name, index) => (
              <Field
                key={index}
                label={`${t("Leg", "بازی")} ${(leg + 1).toLocaleString(locale)}: ${name}`}
              >
                <input
                  type="number"
                  step="any"
                  min={-1e9}
                  max={1e9}
                  value={row[index] ?? ""}
                  onChange={(event) =>
                    onChange(
                      legs.map((values, at) =>
                        at === leg
                          ? values.map((value, slot) =>
                              slot === index ? event.target.value : value,
                            )
                          : values,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      {policy.tieBreak === "extra-leg" && legs.length === policy.legs && (
        <button
          type="button"
          className="button secondary"
          disabled={!tied || !!awayWinner}
          onClick={() => onChange([...legs, ["0", "0"]])}
        >
          {t("Add permitted extra leg", "افزودن بازی اضافی مجاز")}
        </button>
      )}
      {legs.length > policy.legs && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(legs.slice(0, policy.legs))}
        >
          {t("Remove extra leg from proposal", "حذف بازی اضافی از پیشنهاد")}
        </button>
      )}
    </fieldset>
  );
}
