import { useState } from "react";
import { X } from "lucide-react";
import type { KnockoutVenueTarget } from "../../domain/types";
import { knockoutVenueTargetKey } from "../../engine/venue-distance";
import { Field } from "../../components/ui";
import { useI18n } from "../../i18n";
import { venueRoundLabel, venueTargetLabel } from "./knockout-venue-label";

export function KnockoutVenueTargets({
  targets,
  catalog,
  taken,
  onChange,
}: {
  targets: KnockoutVenueTarget[];
  catalog: KnockoutVenueTarget[];
  taken: Set<string>;
  onChange: (targets: KnockoutVenueTarget[]) => void;
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
  const selected = new Set(targets.map(knockoutVenueTargetKey));
  function toggle(target: KnockoutVenueTarget, checked: boolean) {
    onChange(
      checked
        ? [...targets, target]
        : targets.filter(
            (item) =>
              knockoutVenueTargetKey(item) !== knockoutVenueTargetKey(target),
          ),
    );
  }
  return (
    <>
      <details className="draw-venue-picker" open>
        <summary>
          {t("Choose matches", "انتخاب دیدارها")} (
          {targets.length.toLocaleString(locale)})
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
              onChange([
                ...targets,
                ...visible.filter(
                  (target) =>
                    !taken.has(knockoutVenueTargetKey(target)) &&
                    !selected.has(knockoutVenueTargetKey(target)),
                ),
              ])
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
              onChange(
                targets.filter((target) => groupKey(target) !== shownGroup),
              )
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
        {targets.map((target) => {
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
    </>
  );
}
