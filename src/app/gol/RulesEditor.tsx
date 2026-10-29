import { Trash2 } from "lucide-react";
import type { Locale } from "../../domain/types";
import { uid } from "../../domain/types";
import {
  defaultGolAbility,
  defaultGolPolicy,
  type GolAbility,
  type GolPolicy,
} from "../../domain/gol";
import type { GolRules } from "../../engine/gol";
import { Field, Notice } from "../../components/ui";
import { GolActionIcon } from "../../themes/GameIcon";

export function GolRulesEditor({
  value,
  onChange,
  locale,
}: {
  value: GolRules;
  onChange: (value: GolRules) => void;
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const policy = value.policy ?? defaultGolPolicy;
  const updatePolicy = (changes: Partial<GolPolicy>) =>
    onChange({ ...value, policy: { ...policy, ...changes } });
  function number(
    label: string,
    current: number,
    min: number,
    max: number,
    onValue: (value: number) => void,
  ) {
    return (
      <Field label={label}>
        <input
          type="number"
          min={min}
          max={max}
          value={current}
          onChange={(event) => {
            if (Number.isFinite(event.currentTarget.valueAsNumber))
              onValue(event.currentTarget.valueAsNumber);
          }}
        />
      </Field>
    );
  }
  return (
    <section className="panel inset-panel">
      <h3>{t("Gol Ya Pooch referee rules", "قوانین داوری گل یا پوچ")}</h3>
      <Notice>
        {t(
          "Agree on these rules before play. Automatic ending applies only when selected here. Card actions are limited to scoring, possession and pausing the clock; they never reveal the concealed position.",
          "پیش از بازی درباره این قوانین توافق کنید. پایان خودکار فقط با انتخاب آن در این بخش اعمال می‌شود. اثر کارت‌ها به امتیاز، مالکیت و توقف زمان محدود است و هرگز مکان گل را آشکار نمی‌کند.",
        )}
      </Notice>
      <div className="two-columns">
        {number(
          t("Players per team", "بازیکن در هر تیم"),
          value.playersPerTeam,
          1,
          100,
          (playersPerTeam) => onChange({ ...value, playersPerTeam }),
        )}
        {number(
          t("Default hand points", "امتیاز پیش‌فرض دست"),
          value.handPoints,
          0,
          100,
          (handPoints) => onChange({ ...value, handPoints }),
        )}
        <Field label={t("Match ending policy", "قانون پایان دیدار")}>
          <select
            value={policy.ending}
            onChange={(event) =>
              updatePolicy({
                ending: event.target.value as GolPolicy["ending"],
              })
            }
          >
            <option value="manual">
              {t(
                "Organizer confirms every result",
                "تأیید هر نتیجه توسط برگزارکننده",
              )}
            </option>
            <option value="target">
              {t(
                "Automatic at target and winning margin",
                "خودکار با امتیاز هدف و اختلاف لازم",
              )}
            </option>
            <option value="clock">
              {t(
                "Timed periods with referee confirmation",
                "دوره زمان‌دار با تأیید داور",
              )}
            </option>
          </select>
        </Field>
        {policy.ending === "target" &&
          number(
            t("Winning margin", "اختلاف لازم برای برد"),
            policy.winBy,
            1,
            100,
            (winBy) => updatePolicy({ winBy }),
          )}
        <Field label={t("Possession after a hand", "مالکیت پس از هر دست")}>
          <select
            value={policy.possession}
            onChange={(event) =>
              updatePolicy({
                possession: event.target.value as GolPolicy["possession"],
              })
            }
          >
            <option value="manual">
              {t("Referee chooses", "انتخاب داور")}
            </option>
            <option value="alternate">
              {t("Alternate teams", "تیم‌ها به نوبت")}
            </option>
            <option value="winner">
              {t("Awarded team conceals", "تیم امتیازگیرنده پنهان می‌کند")}
            </option>
            <option value="loser">
              {t("Other team conceals", "تیم دیگر پنهان می‌کند")}
            </option>
          </select>
        </Field>
        {policy.ending === "clock" && (
          <>
            {number(
              t("Period seconds", "ثانیه هر دوره"),
              policy.clockSeconds,
              30,
              86400,
              (clockSeconds) => updatePolicy({ clockSeconds }),
            )}
            <Field label={t("Tied clock policy", "قانون تساوی در پایان زمان")}>
              <select
                value={policy.overtime}
                onChange={(event) =>
                  updatePolicy({
                    overtime: event.target.value as GolPolicy["overtime"],
                  })
                }
              >
                <option value="manual">
                  {t("Manual agreed ruling", "حکم دستی طبق توافق")}
                </option>
                <option value="sudden-death">
                  {t(
                    "Sudden death, next lead wins",
                    "تک‌امتیاز، اولین برتری برنده",
                  )}
                </option>
                <option value="extra-time">
                  {t("Another timed period", "یک دوره زمان‌دار دیگر")}
                </option>
              </select>
            </Field>
            {policy.overtime === "extra-time" &&
              number(
                t("Overtime seconds", "ثانیه وقت اضافه"),
                policy.overtimeSeconds,
                30,
                3600,
                (overtimeSeconds) => updatePolicy({ overtimeSeconds }),
              )}
          </>
        )}
      </div>
      {value.cards.map((card) => {
        const ability = card.ability ?? defaultGolAbility;
        const edit = (changes: Partial<typeof card>) =>
          onChange({
            ...value,
            cards: value.cards.map((item) =>
              item.id === card.id ? { ...item, ...changes } : item,
            ),
          });
        const effect = (changes: Partial<GolAbility>) =>
          edit({ ability: { ...ability, ...changes } });
        return (
          <fieldset className="panel inset-panel" key={card.id}>
            <legend>
              <GolActionIcon action="cards" size={18} />{" "}
              {card.name || t("Special card", "کارت ویژه")}
            </legend>
            <div className="two-columns">
              <Field label={t("Card name", "نام کارت")}>
                <input
                  value={card.name}
                  maxLength={80}
                  onChange={(event) => edit({ name: event.target.value })}
                />
              </Field>
              {number(
                t("Use limit", "سقف استفاده"),
                card.limit,
                0,
                100,
                (limit) => edit({ limit }),
              )}
              {number(
                t("Point adjustment", "تغییر امتیاز"),
                card.points,
                -100,
                100,
                (points) => edit({ points }),
              )}
              {number(
                t("Hand point multiplier", "ضریب امتیاز دست"),
                ability.multiplier,
                1,
                3,
                (multiplier) => effect({ multiplier }),
              )}
              <Field
                label={t("Eligible card user", "تیم مجاز به استفاده کارت")}
              >
                <select
                  value={ability.eligible}
                  onChange={(event) =>
                    effect({
                      eligible: event.target.value as GolAbility["eligible"],
                    })
                  }
                >
                  <option value="any">{t("Either team", "هر دو تیم")}</option>
                  <option value="concealing">
                    {t("Concealing team only", "فقط تیم پنهان‌کننده")}
                  </option>
                  <option value="guessing">
                    {t("Guessing team only", "فقط تیم حدس‌زننده")}
                  </option>
                </select>
              </Field>
              <Field label={t("Card limit period", "بازه سقف استفاده کارت")}>
                <select
                  value={ability.limitScope}
                  onChange={(event) =>
                    effect({
                      limitScope: event.target
                        .value as GolAbility["limitScope"],
                    })
                  }
                >
                  <option value="match">{t("Entire match", "کل دیدار")}</option>
                  <option value="period">
                    {t("Each timed period", "هر دوره زمان‌دار")}
                  </option>
                </select>
              </Field>
              <Field label={t("Card possession effect", "اثر کارت بر مالکیت")}>
                <select
                  value={ability.possession}
                  onChange={(event) =>
                    effect({
                      possession: event.target
                        .value as GolAbility["possession"],
                    })
                  }
                >
                  <option value="unchanged">
                    {t("Use normal hand policy", "طبق قانون معمول دست")}
                  </option>
                  <option value="switch">
                    {t("Switch from concealing team", "تعویض تیم پنهان‌کننده")}
                  </option>
                  <option value="user">
                    {t(
                      "Card user conceals next",
                      "استفاده‌کننده کارت پنهان می‌کند",
                    )}
                  </option>
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={ability.pauseClock}
                  onChange={(event) =>
                    effect({ pauseClock: event.target.checked })
                  }
                />
                {t(
                  "Pause clock after using this card",
                  "توقف زمان پس از استفاده این کارت",
                )}
              </label>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onChange({
                  ...value,
                  cards: value.cards.filter((item) => item.id !== card.id),
                })
              }
            >
              <Trash2 size={16} />
              {t("Remove card", "حذف کارت")}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="text-button"
        disabled={value.cards.length >= 100}
        onClick={() =>
          onChange({
            ...value,
            cards: [
              ...value.cards,
              {
                id: uid(),
                name: t("New card", "کارت تازه"),
                limit: 1,
                points: 0,
              },
            ],
          })
        }
      >
        <GolActionIcon action="cards" size={18} />
        {t("Add custom card", "افزودن کارت سفارشی")}
      </button>
    </section>
  );
}
