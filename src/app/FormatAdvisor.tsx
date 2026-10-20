import { useState } from "react";
import { ArrowUpRight, Clock, Users } from "lucide-react";
import type { FormatId } from "../domain/types";
import { Field } from "../components/ui";
import { useI18n, formatName } from "../i18n";

export function FormatAdvisor({
  onCreate,
}: {
  onCreate: (format: FormatId) => void;
}) {
  const { t, locale } = useI18n();
  const [count, setCount] = useState(16);
  const [minutes, setMinutes] = useState(15);
  const [hours, setHours] = useState(4);
  const [resources, setResources] = useState(2);
  const [minimum, setMinimum] = useState(2);
  const options: {
    format: FormatId;
    matches: number;
    minimum: number;
    rounds: number;
    note: string;
  }[] = [
    {
      format: "single-elimination",
      matches: count - 1,
      minimum: 1,
      rounds: Math.ceil(Math.log2(count)),
      note: t(
        "A decisive finish with the fewest matches. One loss ends an entrant’s run.",
        "پایان قطعی با کمترین دیدار. یک باخت به معنی حذف است.",
      ),
    },
    {
      format: "double-elimination",
      matches: count * 2 - 1,
      minimum: 2,
      rounds: Math.ceil(Math.log2(count)) * 2 + 1,
      note: t(
        "A second chance for every entrant, with more time needed for the final rounds.",
        "فرصت دوم برای همه، با زمان بیشتر برای دورهای پایانی.",
      ),
    },
    {
      format: "round-robin",
      matches: (count * (count - 1)) / 2,
      minimum: count - 1,
      rounds: count % 2 ? count : count - 1,
      note: t(
        "Everyone meets everyone. Strong comparison, but match count grows quickly.",
        "همه با هم بازی می‌کنند. مقایسه بهتر با افزایش سریع تعداد دیدارها.",
      ),
    },
    {
      format: "swiss",
      matches: Math.floor(count / 2) * Math.ceil(Math.log2(count)),
      minimum: Math.ceil(Math.log2(count)) - (count % 2),
      rounds: Math.ceil(Math.log2(count)),
      note: t(
        "Pair by points over a fixed number of rounds. Rankings can remain tied.",
        "جفت‌سازی بر پایه امتیاز در دورهای مشخص. امکان برابری رتبه‌ها وجود دارد.",
      ),
    },
  ];
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
              setCount(Math.max(2, Math.min(512, Number(e.target.value))))
            }
          />
        </Field>
        <Field label={t("Match minutes", "دقایق هر دیدار")}>
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
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
            value={resources}
            onChange={(e) => setResources(Math.max(1, Number(e.target.value)))}
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
      <div className="advisor-grid">
        {options.map((o) => {
          const duration =
            Math.max(Math.ceil(o.matches / resources), o.rounds) * minutes;
          const fits = duration <= hours * 60 && o.minimum >= minimum;
          return (
            <article className="panel advisor-card" key={o.format}>
              <span className={`badge ${fits ? "status-ready" : ""}`}>
                {fits
                  ? t("Fits your brief", "متناسب با برنامه")
                  : t("Consider the tradeoff", "نیازمند بررسی")}
              </span>
              <h2>{formatName(o.format, locale)}</h2>
              <p>{o.note}</p>
              <div>
                <Users size={16} />
                {o.matches} {t("matches", "دیدار")}
                <span>·</span>
                <Clock size={16} />
                {(duration / 60).toFixed(1)} {t("hours minimum", "ساعت حداقل")}
              </div>
              <button
                className="text-button"
                onClick={() => onCreate(o.format)}
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
