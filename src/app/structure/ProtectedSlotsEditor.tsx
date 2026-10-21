import { useState } from "react";
import type { KnockoutDrawConfig, Participant } from "../../domain/types";
import { Field } from "../../components/ui";
import { useI18n } from "../../i18n";

export function ProtectedSlotsEditor({
  value,
  entrants,
  size,
  onChange,
}: {
  value: KnockoutDrawConfig;
  entrants: Participant[];
  size: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t, number } = useI18n();
  const [participantId, setParticipantId] = useState("");
  const [slot, setSlot] = useState(1);
  const fixed = value.fixedSlots ?? [];
  return (
    <details className="protected-slots-editor">
      <summary>
        {t(
          "Protect any entrant at an exact slot",
          "محافظت از هر شرکت‌کننده در جایگاه دقیق",
        )}
      </summary>
      <p>
        {t(
          "Pin selected entrants to physical first-round slots. Slots 1 and 2 meet, then 3 and 4. The preview checks these positions against pot, geographic, venue, bye and qualification rules. This does not grant an extra bye.",
          "شرکت‌کنندگان منتخب را در جایگاه فیزیکی دور اول ثابت کنید. جایگاه‌های ۱ و ۲ و سپس ۳ و ۴ روبرو می‌شوند. پیش‌نمایش این جایگاه‌ها را با قانون گلدان، جغرافیا، محل، استراحت و صعود می‌سنجد. این کار استراحت اضافه نمی‌دهد.",
        )}
      </p>
      <div className="two-columns">
        <Field label={t("Entrant to protect", "شرکت‌کننده برای محافظت")}>
          <select
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
          >
            <option value="">{t("Choose entrant", "انتخاب شرکت‌کننده")}</option>
            {entrants.map((entrant) => (
              <option value={entrant.id} key={entrant.id}>
                {entrant.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Protected physical slot", "جایگاه فیزیکی محافظت‌شده")}>
          <input
            type="number"
            min={1}
            max={size}
            value={slot}
            onChange={(event) => setSlot(Number(event.target.value))}
          />
        </Field>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={
          !participantId ||
          !Number.isInteger(slot) ||
          slot < 1 ||
          slot > size ||
          fixed.some(
            (item) =>
              item.slot === slot && item.participantId !== participantId,
          )
        }
        onClick={() =>
          onChange({
            ...value,
            fixedSlots: [
              ...fixed.filter((item) => item.participantId !== participantId),
              { participantId, slot },
            ],
          })
        }
      >
        {t("Set protected slot", "تعیین جایگاه محافظت‌شده")}
      </button>
      <ul>
        {fixed.map((entry) => (
          <li key={entry.participantId}>
            <bdi>
              {entrants.find((entrant) => entrant.id === entry.participantId)
                ?.name ?? entry.participantId}
            </bdi>{" "}
            · {t("Slot", "جایگاه")} {number(entry.slot)}{" "}
            <button
              type="button"
              className="text-button"
              aria-label={`${t("Remove protected slot", "حذف جایگاه محافظت‌شده")} ${entry.slot}`}
              onClick={() => {
                const next = fixed.filter(
                  (item) => item.participantId !== entry.participantId,
                );
                const copy = { ...value };
                if (next.length) copy.fixedSlots = next;
                else delete copy.fixedSlots;
                onChange(copy);
              }}
            >
              {t("Remove", "حذف")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
