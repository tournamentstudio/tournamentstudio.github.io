import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type {
  KnockoutVenueRule,
  KnockoutVenueTarget,
  Resource,
} from "../../domain/types";
import { MAX_DISTANCE_KM } from "../../domain/geography";
import { knockoutVenueTargetKey } from "../../engine/venue-distance";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { venueRoundLabel, venueTargetLabel } from "./knockout-venue-label";
export function KnockoutVenueRuleEditor({
  rule,
  index,
  resources,
  catalog,
  taken,
  onChange,
  onRemove,
}: {
  rule: KnockoutVenueRule;
  index: number;
  resources: Resource[];
  catalog: KnockoutVenueTarget[];
  taken: Set<string>;
  onChange: (rule: KnockoutVenueRule) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const groupKey = (target: KnockoutVenueTarget) =>
    `${target.bracket}:${target.round}`;
  const groups = [
    ...new Map(catalog.map((target) => [groupKey(target), target])).values(),
  ];
  const [selectedGroup, setSelectedGroup] = useState(
    groups[0] ? groupKey(groups[0]) : "",
  );
  const shownGroup = groups.some((target) => groupKey(target) === selectedGroup)
    ? selectedGroup
    : groups[0]
      ? groupKey(groups[0])
      : "";
  const visible = catalog.filter((target) => groupKey(target) === shownGroup);
  const selected = new Set(rule.targets.map(knockoutVenueTargetKey));
  const resource = resources.find((item) => item.id === rule.resourceId);
  const inputIssues = [
    ...(rule.minKm === undefined && rule.maxKm === undefined
      ? [
          t(
            "Enter a minimum or maximum venue distance.",
            "حداقل یا حداکثر فاصله تا محل بازی را وارد کنید.",
          ),
        ]
      : []),
    ...([rule.minKm, rule.maxKm].some(
      (limit) =>
        limit !== undefined &&
        (!Number.isFinite(limit) || limit < 0 || limit > MAX_DISTANCE_KM),
    )
      ? [
          t(
            "Venue distance limits must be from 0 to 20016 km.",
            "حدود فاصله تا محل بازی باید بین ۰ تا ۲۰۰۱۶ کیلومتر باشند.",
          ),
        ]
      : []),
    ...(rule.minKm !== undefined &&
    rule.maxKm !== undefined &&
    rule.minKm > rule.maxKm
      ? [
          t(
            "Minimum venue distance cannot exceed maximum venue distance.",
            "حداقل فاصله تا محل بازی نباید بیشتر از حداکثر فاصله باشد.",
          ),
        ]
      : []),
    ...(!rule.targets.length
      ? [
          t(
            "Select at least one match for this venue rule.",
            "دست‌کم یک دیدار برای این قانون محل بازی انتخاب کنید.",
          ),
        ]
      : []),
  ];
  function bound(key: "minKm" | "maxKm", text: string) {
    const next = { ...rule };
    if (text === "") delete next[key];
    else next[key] = Number(text);
    onChange(next);
  }
  function toggle(target: KnockoutVenueTarget, checked: boolean) {
    onChange({
      ...rule,
      targets: checked
        ? [...rule.targets, target]
        : rule.targets.filter(
            (item) =>
              knockoutVenueTargetKey(item) !== knockoutVenueTargetKey(target),
          ),
    });
  }
  return (
    <section
      className="draw-venue-rule"
      aria-label={`${t("Venue rule", "قانون محل بازی")} ${(index + 1).toLocaleString(locale)}`}
    >
      <div className="section-heading">
        <h5>
          {t("Venue rule", "قانون محل بازی")}{" "}
          {(index + 1).toLocaleString(locale)}
        </h5>
        <button type="button" className="text-button" onClick={onRemove}>
          <Trash2 size={15} />
          {t("Remove venue rule", "حذف قانون محل بازی")}
        </button>
      </div>
      {inputIssues.map((issue) => (
        <Notice danger key={issue}>
          {issue}
        </Notice>
      ))}
      <Field label={t("Assigned venue", "محل بازی اختصاص‌یافته")}>
        <select
          value={rule.resourceId}
          onChange={(event) =>
            onChange({ ...rule, resourceId: event.target.value })
          }
        >
          {!resource && (
            <option value={rule.resourceId}>
              {t("Missing venue", "محل بازی یافت نشد")}
            </option>
          )}
          {resources.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      {resource && !resource.location && (
        <Notice>
          {t(
            "This venue needs coordinates. Add its location in Schedule and save the schedule settings before previewing.",
            "این محل بازی به مختصات نیاز دارد. موقعیت آن را در بخش برنامه وارد کنید و پیش از پیش‌نمایش، تنظیمات برنامه را ذخیره کنید.",
          )}
        </Notice>
      )}
      <div className="draw-distance-fields">
        <Field
          label={t(
            "Minimum venue distance (km)",
            "حداقل فاصله تا محل بازی (کیلومتر)",
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
              "Minimum venue distance (km)",
              "حداقل فاصله تا محل بازی (کیلومتر)",
            )}
            value={rule.minKm ?? ""}
            onChange={(event) => bound("minKm", event.target.value)}
          />
        </Field>
        <Field
          label={t(
            "Maximum venue distance (km)",
            "حداکثر فاصله تا محل بازی (کیلومتر)",
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
              "Maximum venue distance (km)",
              "حداکثر فاصله تا محل بازی (کیلومتر)",
            )}
            value={rule.maxKm ?? ""}
            onChange={(event) => bound("maxKm", event.target.value)}
          />
        </Field>
      </div>
      <details className="draw-venue-picker" open>
        <summary>
          {t("Choose matches", "انتخاب دیدارها")} (
          {rule.targets.length.toLocaleString(locale)})
        </summary>
        <Field label={t("Bracket round", "دور جدول")}>
          <select
            value={shownGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
          >
            {groups.map((target) => (
              <option key={groupKey(target)} value={groupKey(target)}>
                {venueRoundLabel(target, locale)}
              </option>
            ))}
          </select>
        </Field>
        <div className="button-row">
          <button
            type="button"
            className="text-button"
            disabled={
              !visible.some(
                (target) =>
                  !taken.has(knockoutVenueTargetKey(target)) &&
                  !selected.has(knockoutVenueTargetKey(target)),
              )
            }
            onClick={() =>
              onChange({
                ...rule,
                targets: [
                  ...rule.targets,
                  ...visible.filter(
                    (target) =>
                      !taken.has(knockoutVenueTargetKey(target)) &&
                      !selected.has(knockoutVenueTargetKey(target)),
                  ),
                ],
              })
            }
          >
            {t("Select available matches in round", "انتخاب دیدارهای آزاد دور")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={
              !visible.some((target) =>
                selected.has(knockoutVenueTargetKey(target)),
              )
            }
            onClick={() =>
              onChange({
                ...rule,
                targets: rule.targets.filter(
                  (target) => groupKey(target) !== shownGroup,
                ),
              })
            }
          >
            {t("Clear round selection", "پاک کردن انتخاب‌های دور")}
          </button>
        </div>
        <div className="draw-venue-targets">
          {visible.map((target) => {
            const key = knockoutVenueTargetKey(target);
            return (
              <label className="check-row" key={key}>
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  disabled={taken.has(key) && !selected.has(key)}
                  onChange={(event) => toggle(target, event.target.checked)}
                />
                <span>
                  {venueTargetLabel(target, locale)}
                  {taken.has(key) && (
                    <small>
                      {t(
                        "Assigned by another venue rule",
                        "اختصاص‌یافته با قانون محل بازی دیگر",
                      )}
                    </small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </details>
      <ul className="draw-venue-selection">
        {rule.targets.map((target) => {
          const key = knockoutVenueTargetKey(target);
          const valid = catalog.some(
            (item) => knockoutVenueTargetKey(item) === key,
          );
          return (
            <li key={key}>
              <span>
                {venueTargetLabel(target, locale)}
                {!valid && (
                  <strong>
                    {t("Outside this bracket", "خارج از این جدول")}
                  </strong>
                )}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`${t("Remove", "حذف")} ${venueTargetLabel(target, locale)}`}
                onClick={() => toggle(target, false)}
              >
                <X size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
