import type { Stage, Tournament } from "../../domain/types";
import type { SwissPolicy } from "../../domain/swiss";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";

export function SwissAccelerationEditor({
  tournament,
  stage,
  policy,
  started,
  onChange,
}: {
  tournament: Tournament;
  stage: Stage;
  policy: SwissPolicy;
  started: boolean;
  onChange: (value: SwissPolicy) => void;
}) {
  const { t, number } = useI18n();
  const entrants = tournament.participants
    .filter((p) => stage.participantIds.includes(p.id))
    .sort((a, b) => a.seed - b.seed || a.id.localeCompare(b.id));
  const acceleration = policy.acceleration;
  const eligible = entrants.length > 1 && stage.config.rounds > 1;
  return (
    <fieldset disabled={started || !eligible} className="draw-fields">
      <legend>{t("Accelerated pairing", "زوج‌بندی شتاب‌دار")}</legend>
      <p>
        {t(
          "Fixed-group policy: selected entrants receive virtual pairing points for the opening rounds. The bonus then disappears. It never adds wins, standings points, Buchholz points or bye priority. This is a local policy, not a federation ruleset. The group and bonus lock after the first draw.",
          "سیاست گروه ثابت: شرکت‌کنندگان انتخاب‌شده در دورهای آغازین امتیاز مجازی زوج‌بندی می‌گیرند و سپس این امتیاز حذف می‌شود. این مقدار برد، امتیاز جدول، امتیاز بوخهولتس یا اولویت استراحت ایجاد نمی‌کند. این سیاست محلی است و مقررات فدراسیون نیست. گروه و امتیاز پس از قرعه اول قفل می‌شوند.",
        )}
      </p>
      {!eligible && (
        <Notice>
          {t(
            "At least two assigned entrants and two rounds are needed before configuring acceleration.",
            "برای تنظیم شتاب به دست‌کم دو شرکت‌کننده تخصیص‌یافته و دو دور نیاز است.",
          )}
        </Notice>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!acceleration}
          onChange={(event) => {
            if (!event.target.checked) {
              const next = { ...policy };
              delete next.acceleration;
              onChange(next);
            } else
              onChange({
                ...policy,
                acceleration: {
                  policy: "fixed-group-v1",
                  rounds: Math.min(2, stage.config.rounds - 1),
                  points: Math.max(1, tournament.rules.pointsWin),
                  participantIds: entrants
                    .slice(0, Math.ceil(entrants.length / 2))
                    .map((p) => p.id),
                },
              });
          }}
        />
        {t("Use temporary pairing points", "استفاده از امتیاز موقت زوج‌بندی")}
      </label>
      {acceleration && (
        <>
          <div className="two-columns">
            <Field
              label={t("Accelerated opening rounds", "دورهای آغازین شتاب‌دار")}
            >
              <input
                type="number"
                min={1}
                max={stage.config.rounds - 1}
                value={acceleration.rounds}
                onChange={(event) =>
                  onChange({
                    ...policy,
                    acceleration: {
                      ...acceleration,
                      rounds: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label={t("Virtual pairing bonus", "امتیاز مجازی زوج‌بندی")}>
              <input
                type="number"
                min={0.001}
                max={1000000}
                step="any"
                value={acceleration.points}
                onChange={(event) =>
                  onChange({
                    ...policy,
                    acceleration: {
                      ...acceleration,
                      points: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </div>
          <details>
            <summary>
              {t("Fixed acceleration group", "گروه ثابت شتاب")} (
              {number(acceleration.participantIds.length)})
            </summary>
            <p>
              {t(
                "The default group is the higher-seeded half, rounded up. Select a nonempty group smaller than the full field.",
                "گروه پیش‌فرض نیمه دارای سید بالاتر با گرد کردن رو به بالا است. گروهی غیرخالی و کوچک‌تر از کل شرکت‌کنندگان انتخاب کنید.",
              )}
            </p>
            {entrants.map((p) => (
              <label className="check-row" key={p.id}>
                <input
                  type="checkbox"
                  checked={acceleration.participantIds.includes(p.id)}
                  onChange={(event) =>
                    onChange({
                      ...policy,
                      acceleration: {
                        ...acceleration,
                        participantIds: event.target.checked
                          ? [...acceleration.participantIds, p.id]
                          : acceleration.participantIds.filter(
                              (id) => id !== p.id,
                            ),
                      },
                    })
                  }
                />
                <bdi>{p.name}</bdi>
              </label>
            ))}
          </details>
        </>
      )}
    </fieldset>
  );
}
