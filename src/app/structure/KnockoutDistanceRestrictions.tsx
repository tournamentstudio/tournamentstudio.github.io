import { MapPin, Plus, Trash2 } from "lucide-react";
import type {
  KnockoutDistanceRule,
  KnockoutDrawConfig,
  KnockoutFinalTarget,
  Stage,
} from "../../domain/types";
import { MAX_DISTANCE_KM } from "../../domain/geography";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { withDistanceRule } from "./knockout-config";

export function KnockoutDistanceRestrictions({
  value,
  stage,
  entrantCount,
  onChange,
}: {
  value: KnockoutDrawConfig;
  stage: Stage;
  entrantCount: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t, locale } = useI18n();
  const distance = "distance" in value ? value.distance : undefined;
  const double = stage.format === "double-elimination";
  const winnerRounds = Math.ceil(Math.log2(Math.max(2, entrantCount)));
  const loserRounds = double ? Math.max(0, winnerRounds * 2 - 2) : 0;
  const inputIssues = distance
    ? [
        ...(distance.minKm === undefined && distance.maxKm === undefined
          ? [
              t(
                "Enter a minimum or maximum distance.",
                "حداقل یا حداکثر فاصله را وارد کنید.",
              ),
            ]
          : []),
        ...([distance.minKm, distance.maxKm].some(
          (limit) =>
            limit !== undefined &&
            (!Number.isFinite(limit) || limit < 0 || limit > MAX_DISTANCE_KM),
        )
          ? [
              t(
                "Distance limits must be from 0 to 20016 km.",
                "حدود فاصله باید بین ۰ تا ۲۰۰۱۶ کیلومتر باشند.",
              ),
            ]
          : []),
        ...(distance.minKm !== undefined &&
        distance.maxKm !== undefined &&
        distance.minKm > distance.maxKm
          ? [
              t(
                "Minimum distance cannot exceed maximum distance.",
                "حداقل فاصله نباید بیشتر از حداکثر فاصله باشد.",
              ),
            ]
          : []),
        ...(!distance.winnersThroughRound &&
        !distance.losersThroughRound &&
        !distance.finals.length
          ? [
              t(
                "Select a round range or final for the distance rule.",
                "برای قانون فاصله، یک بازه دور یا فینال انتخاب کنید.",
              ),
            ]
          : []),
      ]
    : [];
  function update(patch: Partial<KnockoutDistanceRule>) {
    if (distance) onChange(withDistanceRule(value, { ...distance, ...patch }));
  }
  function bound(key: "minKm" | "maxKm", text: string) {
    if (!distance) return;
    const next = { ...distance };
    if (text === "") delete next[key];
    else next[key] = Number(text);
    onChange(withDistanceRule(value, next));
  }
  const targets = [
    {
      id: "grand-final" as const,
      shown: double,
      available: double && entrantCount >= 2,
      label: t(
        "Apply distance range to grand final",
        "اعمال بازه فاصله در فینال بزرگ",
      ),
    },
    {
      id: "reset" as const,
      shown: double,
      available: double && stage.config.grandFinalReset && entrantCount >= 2,
      label: t(
        "Apply distance range to reset final",
        "اعمال بازه فاصله در فینال تکراری",
      ),
    },
    {
      id: "third-place" as const,
      shown: !double,
      available: !double && stage.config.thirdPlace && entrantCount >= 3,
      label: t(
        "Apply distance range to third-place match",
        "اعمال بازه فاصله در دیدار رده‌بندی",
      ),
    },
  ];
  function toggle(target: KnockoutFinalTarget, checked: boolean) {
    if (distance)
      update({
        finals: checked
          ? [...distance.finals, target]
          : distance.finals.filter((item) => item !== target),
      });
  }
  return (
    <section
      className="draw-distance-restrictions"
      aria-label={t("Geographic distance", "فاصله جغرافیایی")}
    >
      <h4>
        <MapPin size={18} aria-hidden="true" />{" "}
        {t("Geographic distance", "فاصله جغرافیایی")}
      </h4>
      <p className="muted">
        {t(
          "Choose how far apart opponents' city or club bases may be. Enter base coordinates in Participants first. Distances use the shortest great-circle arc on a sphere, not road distance or travel time.",
          "فاصله مجاز میان شهر یا پایگاه باشگاه حریفان را تعیین کنید. ابتدا مختصات پایگاه را در بخش شرکت‌کنندگان وارد کنید. فاصله، کوتاه‌ترین کمان روی کره زمین است؛ فاصله جاده‌ای یا زمان سفر نیست.",
        )}
      </p>
      {!distance ? (
        <button
          className="button secondary"
          onClick={() =>
            onChange(
              withDistanceRule(value, {
                minKm: 100,
                winnersThroughRound: 1,
                losersThroughRound: 0,
                finals: [],
              }),
            )
          }
        >
          <Plus size={16} />{" "}
          {t("Add distance restriction", "افزودن محدودیت فاصله")}
        </button>
      ) : (
        <>
          {inputIssues.map((issue) => (
            <Notice danger key={issue}>
              {issue}
            </Notice>
          ))}
          <div className="draw-distance-fields">
            <Field
              label={t(
                "Minimum opponent distance (km)",
                "حداقل فاصله حریفان (کیلومتر)",
              )}
              hint={t(
                "Leave blank for no minimum. Zero is a valid limit.",
                "برای نبود حداقل، خالی بگذارید. صفر یک حد معتبر است.",
              )}
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_DISTANCE_KM}
                step="any"
                aria-label={t(
                  "Minimum opponent distance (km)",
                  "حداقل فاصله حریفان (کیلومتر)",
                )}
                value={distance.minKm ?? ""}
                onChange={(event) => bound("minKm", event.target.value)}
              />
            </Field>
            <Field
              label={t(
                "Maximum opponent distance (km)",
                "حداکثر فاصله حریفان (کیلومتر)",
              )}
              hint={t(
                "Leave blank for no maximum. Both bounds are inclusive.",
                "برای نبود حداکثر، خالی بگذارید. خودِ هر دو حد نیز مجاز است.",
              )}
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_DISTANCE_KM}
                step="any"
                aria-label={t(
                  "Maximum opponent distance (km)",
                  "حداکثر فاصله حریفان (کیلومتر)",
                )}
                value={distance.maxKm ?? ""}
                onChange={(event) => bound("maxKm", event.target.value)}
              />
            </Field>
            <Field
              label={t(
                "Apply distance through winners round",
                "اعمال فاصله تا پایان دور برندگان",
              )}
            >
              <select
                value={distance.winnersThroughRound}
                onChange={(event) =>
                  update({ winnersThroughRound: Number(event.target.value) })
                }
              >
                <option value={0}>{t("Off", "غیرفعال")}</option>
                {Array.from({ length: winnerRounds }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {t("Winners round", "دور برندگان")}{" "}
                    {(index + 1).toLocaleString(locale)}
                  </option>
                ))}
                {distance.winnersThroughRound > winnerRounds && (
                  <option value={distance.winnersThroughRound}>
                    {t("Outside this bracket", "خارج از این جدول")} (
                    {distance.winnersThroughRound.toLocaleString(locale)})
                  </option>
                )}
              </select>
            </Field>
            {(double || distance.losersThroughRound > 0) && (
              <Field
                label={t(
                  "Apply distance through losers round",
                  "اعمال فاصله تا پایان دور بازندگان",
                )}
              >
                <select
                  disabled={!loserRounds && !distance.losersThroughRound}
                  value={distance.losersThroughRound}
                  onChange={(event) =>
                    update({ losersThroughRound: Number(event.target.value) })
                  }
                >
                  <option value={0}>{t("Off", "غیرفعال")}</option>
                  {Array.from({ length: loserRounds }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {t("Losers round", "دور بازندگان")}{" "}
                      {(index + 1).toLocaleString(locale)}
                    </option>
                  ))}
                  {distance.losersThroughRound > loserRounds && (
                    <option value={distance.losersThroughRound}>
                      {t("Outside this bracket", "خارج از این جدول")} (
                      {distance.losersThroughRound.toLocaleString(locale)})
                    </option>
                  )}
                </select>
              </Field>
            )}
          </div>
          <div className="draw-distance-targets">
            {targets
              .filter(
                (target) => target.shown || distance.finals.includes(target.id),
              )
              .map((target) => {
                const checked = distance.finals.includes(target.id);
                return (
                  <label className="check-row" key={target.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!target.available && !checked}
                      onChange={(event) =>
                        toggle(target.id, event.target.checked)
                      }
                    />
                    <span>{target.label}</span>
                  </label>
                );
              })}
          </div>
          <p className="draw-separation-help">
            {t(
              "Select at least one round range or final and enter at least one distance bound. Round ranges start at round 1. Enable the reset or third-place match in Stage settings before selecting it here.",
              "دست‌کم یک بازه دور یا فینال و یک حد فاصله انتخاب کنید. بازه دورها از دور ۱ شروع می‌شود. پیش از انتخاب فینال تکراری یا رده‌بندی در اینجا، آن دیدار را در تنظیمات مرحله فعال کنید.",
            )}
          </p>
          <Notice>
            {t(
              "The range must hold for every possible pair in the selected matches, including paths with BYEs. Any two entrants can reach the grand final or reset, so every pair must satisfy the range there. No rule is relaxed to make a draw possible.",
              "بازه باید برای همه حریفان ممکن در دیدارهای انتخاب‌شده، از جمله مسیرهای دارای استراحت، برقرار باشد. هر دو شرکت‌کننده ممکن است به فینال بزرگ یا تکرار آن برسند؛ پس در آن‌ها فاصله همه زوج‌ها باید مجاز باشد. هیچ قانونی برای ممکن شدن قرعه کنار گذاشته نمی‌شود.",
            )}
          </Notice>
          <button
            className="text-button"
            onClick={() => onChange(withDistanceRule(value, null))}
          >
            <Trash2 size={15} />{" "}
            {t("Remove distance restriction", "حذف محدودیت فاصله")}
          </button>
        </>
      )}
    </section>
  );
}
