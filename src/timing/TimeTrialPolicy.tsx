import type { Stage } from "../domain/types";
import { Field } from "../components/ui";
import { useI18n } from "../i18n";
export function TimeTrialPolicy({
  stage,
  locked,
  onEdit,
}: {
  stage: Stage;
  locked: boolean;
  onEdit: (patch: Partial<Stage>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="panel inset-panel">
      <Field label={t("Time-trial standings policy", "قاعده جدول رقابت زمانی")}>
        <select
          disabled={locked}
          value={
            stage.config.timeRanking === "cumulative"
              ? "cumulative"
              : "placement"
          }
          onChange={(e) =>
            onEdit({ config: { ...stage.config, timeRanking: e.target.value } })
          }
        >
          <option value="placement">
            {t("Placement points", "امتیاز رتبه")}
          </option>
          <option value="cumulative">
            {t("Lowest cumulative time", "کمترین زمان مجموع")}
          </option>
        </select>
      </Field>
      <p>
        {t(
          "Cumulative time ranks only entrants with a valid played result in every scheduled event. Unfinished, forfeit or missing runs stay together below completed totals. Equal totals remain tied. Use the same numeric time unit throughout the stage; the timer supplies seconds.",
          "زمان مجموع فقط اعضایی را رتبه‌بندی می‌کند که در همه رویدادهای برنامه نتیجه معتبر بازی‌شده دارند. اجراهای ناتمام، غیبت یا فاقد نتیجه در پایین مجموع‌های کامل یکسان می‌مانند. مجموع برابر مساوی است. در کل مرحله واحد زمانی عددی یکسان به کار برید؛ تایمر ثانیه می‌دهد.",
        )}
      </p>
    </div>
  );
}
