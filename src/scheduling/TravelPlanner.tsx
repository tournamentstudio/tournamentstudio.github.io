import { useState } from "react";
import type { EditorProps } from "../app/Participants";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n, generatedMatchLabel, localizedDiagnostic } from "../i18n";
import { planTravel, type TravelPlan } from "./travel";
export function TravelPlanner({ tournament, onChange }: EditorProps) {
  const { t, locale, number } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [factor, setFactor] = useState(1.2);
  const [speed, setSpeed] = useState(50);
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<unknown>();
  const [preview, setPreview] = useState<{
    plan: TravelPlan;
    revision: number;
  }>();
  const eligible = tournament.matches.filter(
    (m) =>
      m.scheduledAt &&
      !m.result &&
      !["bye", "canceled", "live"].includes(m.status) &&
      m.slots.every((s) => s.participantId),
  );
  const clear = () => setPreview(undefined);
  return (
    <details className="panel schedule-timeline">
      <summary>{t("Venue travel estimates", "برآورد سفر به محل بازی")}</summary>
      <ErrorText error={error} />
      <Notice>
        {t(
          "This planner sums one-way trips from each entrant's entered coordinates to each venue for selected matches. A route factor, average speed and cost rate are your assumptions. These are not road routes, driving directions or measured travel times. Repeated visits are counted separately. Up to 12 matches can be assigned while keeping scheduled times and fixed draw venues.",
          "این ابزار سفر یک‌طرفه از مختصات واردشده هر شرکت‌کننده به محل دیدارهای انتخابی را جمع می‌کند. ضریب مسیر، سرعت میانگین و نرخ هزینه فرض‌های شما هستند. این مقادیر مسیر جاده‌ای، راهنمای رانندگی یا زمان اندازه‌گیری‌شده نیستند. مراجعه تکراری جدا حساب می‌شود. حداکثر ۱۲ دیدار با حفظ زمان برنامه و محل ثابت قرعه تخصیص می‌یابد.",
        )}
      </Notice>
      <div className="event-grid">
        <Field label={t("Assumed route factor", "ضریب فرضی مسیر")}>
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={factor}
            onChange={(e) => {
              clear();
              setFactor(Number(e.target.value));
            }}
          />
        </Field>
        <Field
          label={t(
            "Assumed average speed (km/h)",
            "سرعت میانگین فرضی (کیلومتر بر ساعت)",
          )}
        >
          <input
            type="number"
            min={1}
            max={1000}
            value={speed}
            onChange={(e) => {
              clear();
              setSpeed(Number(e.target.value));
            }}
          />
        </Field>
        <Field
          label={t(
            "Assumed cost per km (your currency)",
            "هزینه فرضی هر کیلومتر (واحد پول شما)",
          )}
        >
          <input
            type="number"
            min={0}
            max={10000}
            step={0.01}
            value={cost}
            onChange={(e) => {
              clear();
              setCost(Number(e.target.value));
            }}
          />
        </Field>
      </div>
      <Field
        label={t(
          "Travel planning matches (up to 12)",
          "دیدارهای برنامه سفر (حداکثر ۱۲)",
        )}
      >
        <select
          multiple
          size={Math.min(8, Math.max(2, eligible.length))}
          value={selected}
          onChange={(e) => {
            clear();
            setSelected([...e.target.selectedOptions].map((o) => o.value));
          }}
        >
          {eligible.map((m) => (
            <option key={m.id} value={m.id}>
              {generatedMatchLabel(m, locale)}:{" "}
              {m.slots
                .map(
                  (s) =>
                    tournament.participants.find(
                      (p) => p.id === s.participantId,
                    )?.name,
                )
                .join(" / ")}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="button secondary"
        disabled={!selected.length}
        onClick={() => {
          try {
            setPreview({
              plan: planTravel(tournament, selected, {
                routeFactor: factor,
                speedKmh: speed,
                costPerKm: cost,
              }),
              revision: tournament.revision,
            });
            setError(undefined);
          } catch (e) {
            setError(e);
          }
        }}
      >
        {t("Preview travel assignments", "پیش‌نمایش تخصیص سفر")}
      </button>
      {preview && (
        <div className="panel inset-panel" aria-live="polite">
          <p>
            {preview.plan.optimal
              ? t(
                  "Minimum estimate for these fixed times and available venues",
                  "کمترین برآورد برای این زمان‌های ثابت و محل‌های در دسترس",
                )
              : t(
                  "Search limit reached. Best assignment found; minimum is not proven.",
                  "سقف جستجو رسیده است. بهترین تخصیص پیدا‌شده؛ کمینه اثبات نشده است.",
                )}
          </p>
          <p>
            {t("Estimated total", "مجموع برآورد")}:{" "}
            {number(Math.round(preview.plan.totalKm * 10) / 10)} km ·{" "}
            {number(Math.round(preview.plan.totalMinutes))}{" "}
            {t("traveler-minutes", "دقیقه مسافر")} ·{" "}
            {number(Math.round(preview.plan.totalCost * 100) / 100)}{" "}
            {t("currency units", "واحد پول")}
          </p>
          <ul>
            {preview.plan.assignments.map((a) => (
              <li key={a.matchId}>
                {generatedMatchLabel(
                  tournament.matches.find((m) => m.id === a.matchId)!,
                  locale,
                )}
                :{" "}
                <bdi>
                  {
                    tournament.schedule.resources.find(
                      (r) => r.id === a.resourceId,
                    )?.name
                  }
                </bdi>{" "}
                ({number(Math.round(a.km * 10) / 10)} km)
              </li>
            ))}
          </ul>
          {preview.plan.conflicts.length > 0 && (
            <Notice danger>
              {preview.plan.conflicts.slice(0, 20).map((c, i) => (
                <p key={i}>{localizedDiagnostic(c, locale)}</p>
              ))}
            </Notice>
          )}
          {preview.revision !== tournament.revision && (
            <Notice danger>
              {t(
                "Tournament changed. Preview again.",
                "مسابقات تغییر کرده است. دوباره پیش‌نمایش بگیرید.",
              )}
            </Notice>
          )}
          <button
            className="button primary"
            disabled={
              preview.revision !== tournament.revision ||
              preview.plan.conflicts.length > 0
            }
            onClick={() => {
              onChange(
                preview.plan.tournament,
                t(
                  "Apply reviewed travel venues",
                  "اعمال محل‌های بررسی‌شده سفر",
                ),
              );
              clear();
            }}
          >
            {t("Apply travel venue assignments", "اعمال تخصیص محل سفر")}
          </button>
        </div>
      )}
    </details>
  );
}
