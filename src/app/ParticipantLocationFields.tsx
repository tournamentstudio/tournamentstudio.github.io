import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import type { Participant } from "../domain/types";
import { Field } from "../components/ui";
import { useI18n } from "../i18n";

export function ParticipantLocationFields({
  value,
  onChange,
}: {
  value: Participant["location"];
  onChange: (value: Participant["location"]) => void;
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
    <section
      className="participant-location"
      aria-label={t("Base location", "موقعیت پایگاه")}
    >
      <h3>
        <MapPin size={18} aria-hidden="true" />{" "}
        {t("Base location", "موقعیت پایگاه")}
      </h3>
      <p className="muted">
        {t(
          "Optional coordinates for distance-based draws. Use a city center or club base, rather than a home address. Enter decimal degrees manually; the app does not request your device location or look up addresses.",
          "مختصات اختیاری برای قرعه بر پایه فاصله است. به‌جای نشانی خانه، مرکز شهر یا پایگاه باشگاه را وارد کنید. مختصات را دستی و به درجه اعشاری بنویسید؛ برنامه موقعیت دستگاه را درخواست نمی‌کند و نشانی‌ها را جستجو نمی‌کند.",
        )}
      </p>
      {enabled ? (
        <>
          <div className="two-columns">
            <Field
              label={t("Latitude", "عرض جغرافیایی")}
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
                aria-label={t("Latitude", "عرض جغرافیایی")}
                value={latitude}
                onChange={(event) => change(event.target.value, longitude)}
              />
            </Field>
            <Field
              label={t("Longitude", "طول جغرافیایی")}
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
                aria-label={t("Longitude", "طول جغرافیایی")}
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
            <Trash2 size={15} />{" "}
            {t("Remove base location", "حذف موقعیت پایگاه")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button secondary"
          onClick={() => setEnabled(true)}
        >
          <MapPin size={15} /> {t("Add base location", "افزودن موقعیت پایگاه")}
        </button>
      )}
      <p className="muted">
        {t(
          "Save participant to confirm changes. Public snapshots exclude coordinates. Private backups include them. Changing a base location does not rearrange an existing draw.",
          "برای تأیید تغییرات، شرکت‌کننده را ذخیره کنید. تصاویر داده عمومی مختصات را ندارند؛ پشتیبان خصوصی آن‌ها را نگه می‌دارد. تغییر موقعیت پایگاه، قرعه موجود را جابه‌جا نمی‌کند.",
        )}
      </p>
    </section>
  );
}
