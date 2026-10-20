import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Save } from "lucide-react";
import type {
  Rules as RulesType,
  TieBreaker,
  TournamentStatus,
} from "../domain/types";
import { uid } from "../domain/types";
import { rulesSchema } from "../domain/validate";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n, statusName } from "../i18n";
import type { EditorProps } from "./Participants";

const breakerLabels: [TieBreaker, string, string][] = [
  ["points", "Points", "امتیاز"],
  ["wins", "Wins", "برد"],
  ["differential", "Score difference", "تفاضل"],
  ["scored", "Scored", "امتیاز کسب‌شده"],
  ["head-to-head", "Head to head", "رو در رو"],
  ["buchholz", "Buchholz", "بوخهولتز"],
  ["median-buchholz", "Median Buchholz", "بوخهولتز میانه"],
  ["sonneborn-berger", "Sonneborn-Berger", "سونبورن برگر"],
  ["seed", "Seed", "سید"],
];

export function Rules({ tournament: doc, onChange }: EditorProps) {
  const { t } = useI18n();
  const [rules, setRules] = useState(structuredClone(doc.rules));
  const [error, setError] = useState<unknown>();
  const played = doc.matches.some((match) => match.status === "completed");
  const locked = doc.stages.some(
    (stage) =>
      stage.sources.length > 0 &&
      doc.matches.some((match) => match.stageId === stage.id),
  );

  function save() {
    try {
      if (locked)
        throw new Error(
          t(
            "Rules are locked after a dependent stage has been generated.",
            "پس از ساخت مرحله وابسته، قوانین قفل می‌شوند.",
          ),
        );
      if (rules.scoring === "sets" && rules.bestOf % 2 !== 1)
        throw new Error(
          t(
            "Best-of scoring requires an odd number.",
            "تعداد ست‌ها برای تعیین برنده باید فرد باشد.",
          ),
        );
      const validated = rulesSchema.parse(rules);
      onChange(
        { ...doc, rules: validated },
        t("Update scoring rules", "به‌روزرسانی قوانین امتیازدهی"),
      );
      setError(undefined);
    } catch (failure) {
      setError(failure);
    }
  }

  function moveBreaker(index: number, direction: number) {
    const next = [...rules.tieBreakers];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRules({ ...rules, tieBreakers: next });
  }

  return (
    <div className="panel-content narrow-content">
      <div className="section-heading">
        <div>
          <h2>{t("Your game, your rules", "بازی شما، قوانین شما")}</h2>
          <p>
            {t(
              "Rules apply to every stage in this tournament.",
              "قوانین بر همه مراحل این مسابقات اعمال می‌شوند.",
            )}
          </p>
        </div>
        <button className="button primary" disabled={locked} onClick={save}>
          <Save size={16} />
          {t("Save rules", "ذخیره قوانین")}
        </button>
      </div>
      <ErrorText error={error} />
      {locked ? (
        <Notice>
          {t(
            "Qualification has already been used to generate another stage. Rules are locked to protect those entrants and results. Restore a revision from before that draw to change the rules.",
            "صعودکنندگان برای ساخت مرحله دیگر استفاده شده‌اند. قوانین برای حفظ شرکت‌کنندگان و نتایج قفل شده‌اند. برای تغییر قوانین، نسخه‌ای از پیش از آن قرعه را بازیابی کنید.",
          )}
        </Notice>
      ) : (
        played && (
          <Notice>
            {t(
              "Results already exist. Changing standings points recalculates rankings. Existing winner decisions are retained.",
              "نتایج ثبت شده‌اند. تغییر امتیاز جدول رتبه‌ها را دوباره محاسبه می‌کند. برنده‌های ثبت شده حفظ می‌شوند.",
            )}
          </Notice>
        )
      )}
      <fieldset
        disabled={locked}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="two-columns">
          <Field label={t("Scoring system", "روش امتیازدهی")}>
            <select
              value={rules.scoring}
              onChange={(event) =>
                setRules({
                  ...rules,
                  scoring: event.target.value as RulesType["scoring"],
                })
              }
            >
              {[
                ["high", "Highest score wins", "امتیاز بیشتر برنده"],
                ["low", "Lowest score wins", "امتیاز کمتر برنده"],
                ["sets", "Best of sets", "برنده ست‌ها"],
                ["manual", "Manual winner", "برنده دستی"],
                ["placement", "Placement points", "امتیاز رتبه"],
                ["time", "Fastest time", "کمترین زمان"],
              ].map(([id, en, fa]) => (
                <option key={id} value={id}>
                  {t(en, fa)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Best of (odd number)", "بهترین از (عدد فرد)")}>
            <input
              type="number"
              min={1}
              max={99}
              step={2}
              value={rules.bestOf}
              onChange={(event) =>
                setRules({ ...rules, bestOf: Number(event.target.value) })
              }
            />
          </Field>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={rules.allowDraws}
            onChange={(event) =>
              setRules({ ...rules, allowDraws: event.target.checked })
            }
          />
          {t(
            "Allow draws in league and group matches",
            "اجازه تساوی در دیدارهای لیگ و گروه",
          )}
        </label>
        <div className="three-columns">
          {(
            ["pointsWin", "pointsDraw", "pointsLoss", "targetScore"] as const
          ).map((key, index) => (
            <Field
              key={key}
              label={
                [
                  t("Win points", "امتیاز برد"),
                  t("Draw points", "امتیاز تساوی"),
                  t("Loss points", "امتیاز باخت"),
                  t("Target score", "امتیاز هدف"),
                ][index]
              }
            >
              <input
                type="number"
                min={0}
                max={10000}
                value={rules[key]}
                onChange={(event) =>
                  setRules({ ...rules, [key]: Number(event.target.value) })
                }
              />
            </Field>
          ))}
        </div>
        <section className="panel inset-panel">
          <h3>{t("Ordered tiebreakers", "ترتیب رفع تساوی")}</h3>
          <p className="muted">
            {t(
              "Criteria are applied from top to bottom. Equal criteria leave a shared rank. Add seed only when that policy is agreed in advance.",
              "معیارها از بالا به پایین اعمال می‌شوند. برابری معیارها رتبه مشترک ایجاد می‌کند. فقط با توافق قبلی سید را اضافه کنید.",
            )}
          </p>
          <ol>
            {rules.tieBreakers.map((breaker, index) => {
              const label = breakerLabels.find(([id]) => id === breaker)!;
              return (
                <li key={breaker}>
                  <div className="section-heading">
                    <span>{t(label[1], label[2])}</span>
                    <div className="button-row">
                      <button
                        className="icon-button"
                        disabled={index === 0}
                        aria-label={`${t("Move earlier", "جابجایی به قبل")}: ${t(label[1], label[2])}`}
                        onClick={() => moveBreaker(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={index === rules.tieBreakers.length - 1}
                        aria-label={`${t("Move later", "جابجایی به بعد")}: ${t(label[1], label[2])}`}
                        onClick={() => moveBreaker(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${t("Remove criterion", "حذف معیار")}: ${t(label[1], label[2])}`}
                        onClick={() =>
                          setRules({
                            ...rules,
                            tieBreakers: rules.tieBreakers.filter(
                              (value) => value !== breaker,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <Field label={t("Add a tiebreaker", "افزودن معیار رفع تساوی")}>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value)
                  setRules({
                    ...rules,
                    tieBreakers: [
                      ...rules.tieBreakers,
                      event.target.value as TieBreaker,
                    ],
                  });
              }}
            >
              <option value="">
                {t("Choose a criterion", "انتخاب معیار")}
              </option>
              {breakerLabels
                .filter(([id]) => !rules.tieBreakers.includes(id))
                .map(([id, en, fa]) => (
                  <option key={id} value={id}>
                    {t(en, fa)}
                  </option>
                ))}
            </select>
          </Field>
        </section>
        <Field
          label={t(
            "Placement points, first place onward",
            "امتیاز رتبه‌ها از مقام اول",
          )}
        >
          <input
            value={rules.placementPoints.join(",")}
            onChange={(event) =>
              setRules({
                ...rules,
                placementPoints: event.target.value
                  .split(",")
                  .map(Number)
                  .filter(Number.isFinite),
              })
            }
          />
        </Field>
        {doc.sport === "gol-ya-pooch" && (
          <section className="panel inset-panel">
            <h3>{t("Gol Ya Pooch referee rules", "قوانین داوری گل یا پوچ")}</h3>
            <Notice>
              {t(
                "Agree on a ruleset before play. Cards use structured point adjustments and per-team limits. No card executes code or reveals the concealed position.",
                "پیش از بازی درباره قوانین توافق کنید. کارت‌ها تغییر امتیاز و سقف استفاده برای هر تیم دارند. هیچ کارت کد اجرا نمی‌کند یا مکان گل را نمایش نمی‌دهد.",
              )}
            </Notice>
            <div className="two-columns">
              <Field label={t("Players per team", "بازیکن در هر تیم")}>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={rules.gol.playersPerTeam}
                  onChange={(event) =>
                    setRules({
                      ...rules,
                      gol: {
                        ...rules.gol,
                        playersPerTeam: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label={t("Default hand points", "امتیاز پیش‌فرض دست")}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rules.gol.handPoints}
                  onChange={(event) =>
                    setRules({
                      ...rules,
                      gol: {
                        ...rules.gol,
                        handPoints: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
            {rules.gol.cards.map((card, index) => (
              <div className="card-rule-row" key={card.id}>
                <Field label={t("Card name", "نام کارت")}>
                  <input
                    value={card.name}
                    maxLength={80}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        gol: {
                          ...rules.gol,
                          cards: rules.gol.cards.map((value, position) =>
                            position === index
                              ? { ...value, name: event.target.value }
                              : value,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                <Field label={t("Use limit", "سقف استفاده")}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={card.limit}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        gol: {
                          ...rules.gol,
                          cards: rules.gol.cards.map((value, position) =>
                            position === index
                              ? { ...value, limit: Number(event.target.value) }
                              : value,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                <Field label={t("Point adjustment", "تغییر امتیاز")}>
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    value={card.points}
                    onChange={(event) =>
                      setRules({
                        ...rules,
                        gol: {
                          ...rules.gol,
                          cards: rules.gol.cards.map((value, position) =>
                            position === index
                              ? { ...value, points: Number(event.target.value) }
                              : value,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                <button
                  className="icon-button"
                  aria-label={t("Remove card", "حذف کارت")}
                  onClick={() =>
                    setRules({
                      ...rules,
                      gol: {
                        ...rules.gol,
                        cards: rules.gol.cards.filter(
                          (value) => value.id !== card.id,
                        ),
                      },
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() =>
                setRules({
                  ...rules,
                  gol: {
                    ...rules.gol,
                    cards: [
                      ...rules.gol.cards,
                      {
                        id: uid(),
                        name: t("New card", "کارت تازه"),
                        limit: 1,
                        points: 0,
                      },
                    ],
                  },
                })
              }
            >
              <Plus size={16} />
              {t("Add custom card", "افزودن کارت سفارشی")}
            </button>
          </section>
        )}
      </fieldset>
    </div>
  );
}

const transitions: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["ready", "registration", "canceled"],
  ready: ["registration", "check-in", "scheduled", "in-progress", "canceled"],
  registration: ["check-in", "ready", "canceled"],
  "check-in": ["scheduled", "in-progress", "canceled"],
  scheduled: ["in-progress", "paused", "canceled"],
  "in-progress": ["paused", "completed", "canceled"],
  paused: ["in-progress", "canceled"],
  completed: ["in-progress", "archived"],
  archived: ["completed"],
  canceled: ["draft"],
};

export function StatusControl({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const unfinished =
    doc.stages.some((stage) => stage.status !== "completed") ||
    !doc.matches.length ||
    doc.matches.some(
      (match) => !["completed", "bye", "canceled"].includes(match.status),
    );
  return (
    <Field label={t("Competition status", "وضعیت مسابقات")}>
      <select
        value={doc.status}
        onChange={(event) =>
          onChange(
            { ...doc, status: event.target.value as TournamentStatus },
            t("Change competition status", "تغییر وضعیت مسابقات"),
          )
        }
      >
        <option value={doc.status}>{statusName(doc.status, locale)}</option>
        {transitions[doc.status].map((status) => (
          <option
            key={status}
            value={status}
            disabled={status === "completed" && unfinished}
          >
            {statusName(status, locale)}
          </option>
        ))}
      </select>
    </Field>
  );
}
