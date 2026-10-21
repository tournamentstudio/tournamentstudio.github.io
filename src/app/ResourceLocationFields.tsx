import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import type { Resource } from "../domain/types";
import { Field } from "../components/ui";
import { useI18n } from "../i18n";
import "./resource-location.css";

export function ResourceLocationFields({
  value,
  onChange,
  label = "",
  disabled = false,
}: {
  value: Resource["location"];
  onChange: (value: Resource["location"]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(!!value);
  const [latitude, setLatitude] = useState(value?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(value?.longitude.toString() ?? "");
  function change(lat: string, lon: string) {
    setLatitude(lat);
    setLongitude(lon);
    if (
      lat !== "" &&
      lon !== "" &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lon)) &&
      Number(lat) >= -90 &&
      Number(lat) <= 90 &&
      Number(lon) >= -180 &&
      Number(lon) <= 180
    )
      onChange({ latitude: Number(lat), longitude: Number(lon) });
  }
  return (
    <fieldset className="resource-location" disabled={disabled}>
      <legend>
        {t("Venue location", "موقعیت محل بازی")}
        {label ? `: ${label}` : ""}
      </legend>
      <p className="muted">
        {t(
          "Enter the venue coordinates in decimal degrees for knockout distance rules. No device location or address lookup is used.",
          "برای قوانین فاصله در قرعه حذفی، مختصات محل بازی را به درجه اعشاری وارد کنید. موقعیت دستگاه دریافت نمی‌شود و نشانی‌ها جستجو نمی‌شوند.",
        )}
      </p>
      {enabled ? (
        <>
          <div className="two-columns">
            <Field
              label={t("Venue latitude", "عرض جغرافیایی محل بازی")}
              hint={t("From -90 to 90 degrees", "از منفی ۹۰ تا مثبت ۹۰ درجه")}
            >
              <input
                type="number"
                inputMode="decimal"
                dir="ltr"
                min={-90}
                max={90}
                step="any"
                required
                aria-label={t("Venue latitude", "عرض جغرافیایی محل بازی")}
                value={latitude}
                onChange={(event) => change(event.target.value, longitude)}
              />
            </Field>
            <Field
              label={t("Venue longitude", "طول جغرافیایی محل بازی")}
              hint={t(
                "From -180 to 180 degrees",
                "از منفی ۱۸۰ تا مثبت ۱۸۰ درجه",
              )}
            >
              <input
                type="number"
                inputMode="decimal"
                dir="ltr"
                min={-180}
                max={180}
                step="any"
                required
                aria-label={t("Venue longitude", "طول جغرافیایی محل بازی")}
                value={longitude}
                onChange={(event) => change(latitude, event.target.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEnabled(false);
              setLatitude("");
              setLongitude("");
              onChange(undefined);
            }}
          >
            <Trash2 size={15} />
            {t("Remove venue location", "حذف موقعیت محل بازی")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button secondary"
          onClick={() => setEnabled(true)}
        >
          <MapPin size={15} />
          {t("Add venue location", "افزودن موقعیت محل بازی")}
        </button>
      )}
      <p className="muted">
        {t(
          "Save schedule settings to confirm. Public snapshots omit coordinates; private backups keep them. Existing draws keep their saved match assignments.",
          "برای تأیید، تنظیمات برنامه را ذخیره کنید. تصاویر داده عمومی مختصات را ندارند؛ پشتیبان خصوصی آن‌ها را نگه می‌دارد. تخصیص دیدارهای قرعه موجود حفظ می‌شود.",
        )}
      </p>
    </fieldset>
  );
}
