import { useState } from "react";
import { ArrowUpRight, Clock, Users } from "lucide-react";
import type { FormatId } from "../domain/types";
import { Field } from "../components/ui";
import { useI18n, formatName } from "../i18n";
import { advisorPlans, type AdvisorPlan } from "./advisor-plans";

export function FormatAdvisor({
  onCreate,
}: {
  onCreate: (format: FormatId, plan?: AdvisorPlan) => void;
}) {
  const { t, locale } = useI18n();
  const [count, setCount] = useState(16);
  const [minutes, setMinutes] = useState(15);
  const [hours, setHours] = useState(4);
  const [resources, setResources] = useState(2);
  const [minimum, setMinimum] = useState(2);
  const [preferGroups, setPreferGroups] = useState(false);
  const [preferFinals, setPreferFinals] = useState(false);
  const options = advisorPlans(count, minutes, resources);
  const notes: Record<string, string> = {
    single: t(
      "A decisive finish with the fewest matches. One loss ends an entrant’s run.",
      "پایان قطعی با کمترین دیدار. یک باخت به معنی حذف است.",
    ),
    double: t(
      "A second chance for every entrant, with more time needed for the final rounds.",
      "فرصت دوم برای همه، با زمان بیشتر برای دورهای پایانی.",
    ),
    league: t(
      "Everyone meets everyone. Strong comparison, but match count grows quickly.",
      "همه با هم بازی می‌کنند. مقایسه بهتر با افزایش سریع تعداد دیدارها.",
    ),
    swiss: t(
      "Pair by points over a fixed number of rounds. Rankings can remain tied.",
      "جفت‌سازی بر پایه امتیاز در دورهای مشخص. امکان برابری رتبه‌ها وجود دارد.",
    ),
    "groups-finals": t(
      "Balanced groups feed the top two into knockout playoffs. Uneven groups can give entrants different match totals.",
      "گروه‌های متعادل، دو نفر برتر را به مرحله حذفی می‌فرستند. گروه‌های نابرابر ممکن است تعداد دیدار متفاوتی داشته باشند.",
    ),
    "swiss-finals": t(
      "Swiss standings seed a knockout final stage. Qualification ties need a valid tie-break or a manual decision.",
      "رتبه‌های سوئیسی، سیدبندی مرحله حذفی پایانی را تعیین می‌کنند. تساوی در مرز صعود به معیار معتبر یا تصمیم دستی نیاز دارد.",
    ),
  };
  return (
    <div className="content-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("FIND YOUR FORMAT", "قالب مناسب شما")}
          </div>
          <h1>
            {t(
              "Make room for a great competition.",
              "برای یک رقابت خوب برنامه بریزید.",
            )}
          </h1>
          <p>
            {t(
              "A local estimate based on your time, space, and playing goals.",
              "برآورد محلی بر پایه زمان، فضا و هدف مسابقات.",
            )}
          </p>
        </div>
      </header>
      <div className="advisor-inputs panel">
        <Field label={t("Participants", "شرکت‌کنندگان")}>
          <input
            type="number"
            min={2}
            max={512}
            value={count}
            onChange={(e) =>
              setCount(
                Math.max(2, Math.min(512, Math.floor(Number(e.target.value)))),
              )
            }
          />
        </Field>
        <Field label={t("Match minutes", "دقایق هر دیدار")}>
          <input
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) =>
              setMinutes(
                Math.min(1440, Math.max(1, Number(e.target.value) || 1)),
              )
            }
          />
        </Field>
        <Field label={t("Available hours", "ساعت در دسترس")}>
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
          />
        </Field>
        <Field label={t("Playing resources", "زمین یا میز")}>
          <input
            type="number"
            min={1}
            max={64}
            value={resources}
            onChange={(e) =>
              setResources(
                Math.max(1, Math.min(64, Math.floor(Number(e.target.value)))),
              )
            }
          />
        </Field>
        <Field
          label={t("Minimum matches per entrant", "حداقل دیدار برای هر نفر")}
        >
          <input
            type="number"
            min={1}
            value={minimum}
            onChange={(e) => setMinimum(Math.max(1, Number(e.target.value)))}
          />
        </Field>
      </div>
      <div className="button-row">
        <label className="check-row">
          <input
            type="checkbox"
            checked={preferGroups}
            onChange={(event) => setPreferGroups(event.target.checked)}
          />
          {t("Prefer group play", "ترجیح مرحله گروهی")}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={preferFinals}
            onChange={(event) => setPreferFinals(event.target.checked)}
          />
          {t("Require knockout finals", "نیاز به مرحله حذفی پایانی")}
        </label>
      </div>
      <div className="advisor-grid">
        {options.map((o) => {
          const duration =
            Math.max(Math.ceil(o.matches / resources), o.rounds) * minutes;
          const fits =
            duration <= hours * 60 &&
            o.minimum >= minimum &&
            (!preferGroups || o.plan.format === "groups") &&
            (!preferFinals ||
              o.plan.playoffs ||
              o.plan.format.endsWith("elimination"));
          return (
            <article className="panel advisor-card" key={o.id}>
              <span className={`badge ${fits ? "status-ready" : ""}`}>
                {fits
                  ? t("Fits your brief", "متناسب با برنامه")
                  : t("Consider the tradeoff", "نیازمند بررسی")}
              </span>
              <h2>
                {formatName(o.plan.format, locale)}
                {o.plan.playoffs ? t(" + playoffs", " + مرحله حذفی") : ""}
              </h2>
              <p>{notes[o.id]}</p>
              <div>
                <Users size={16} />
                {o.matches} {t("matches", "دیدار")}
                <span>·</span>
                <Clock size={16} />
                {(duration / 60).toFixed(1)} {t("hours minimum", "ساعت حداقل")}
              </div>
              <button
                className="text-button"
                onClick={() => onCreate(o.plan.format, o.plan)}
              >
                {t("Open builder", "باز کردن سازنده")}
                <ArrowUpRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
      <p className="muted">
        {t(
          "Estimates assume equal match lengths and continuously available resources. Rest periods, venue hours, score ties, and scheduling dependencies can extend the event. Double elimination includes a possible final reset.",
          "برآورد با فرض زمان برابر دیدارها و دسترسی پیوسته به منابع است. استراحت، ساعت سالن، تساوی و وابستگی مراحل می‌تواند زمان را افزایش دهد. دو حذفی شامل بازنشانی احتمالی فینال است.",
        )}
      </p>
    </div>
  );
}
