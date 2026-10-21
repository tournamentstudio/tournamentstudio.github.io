import type { Participant } from "../../domain/types";
import {
  organizerRecord,
  type OrganizerRecord,
} from "../../domain/participant-admin";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { readImageAsset } from "../../themes";

const localDate = (value: unknown) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function ParticipantAdminFields({
  participant,
  onChange,
  onLogo,
  onError,
}: {
  participant: Participant;
  onChange: (participant: Participant) => void;
  onLogo: (logo: string | undefined) => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const record = organizerRecord(participant);
  function update(patch: Partial<OrganizerRecord>) {
    const next = { ...record, ...patch };
    if (patch.registration === "waiting" && record.registration !== "waiting")
      next.queuedAt = new Date().toISOString();
    if (patch.registration && patch.registration !== "waiting")
      delete next.queuedAt;
    onChange({
      ...participant,
      metadata: { ...participant.metadata, organizer: next },
    });
  }
  return (
    <>
      <Field
        label={t("Participant logo", "نشان شرکت‌کننده")}
        hint={t(
          "PNG, JPEG or WebP, up to 2 MB. Images are processed locally.",
          "PNG، JPEG یا WebP تا ۲ مگابایت. پردازش تصویر محلی است.",
        )}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              onLogo(await readImageAsset(file));
            } catch {
              onError(
                new Error(
                  t(
                    "Use a PNG, JPEG or WebP image under 2 MB and 16 megapixels.",
                    "تصویر PNG، JPEG یا WebP کمتر از ۲ مگابایت و ۱۶ مگاپیکسل انتخاب کنید.",
                  ),
                ),
              );
            }
            event.target.value = "";
          }}
        />
      </Field>
      {participant.logo && (
        <div className="button-row">
          <img
            src={participant.logo}
            alt={t("Participant logo preview", "پیش‌نمایش نشان شرکت‌کننده")}
            width={72}
            height={72}
            style={{ objectFit: "contain" }}
          />
          <button
            type="button"
            className="text-button"
            onClick={() => onLogo(undefined)}
          >
            {t("Remove logo", "حذف نشان")}
          </button>
        </div>
      )}
      <h3>{t("Availability", "زمان دسترسی")}</h3>
      <p className="muted">
        {t(
          "Times use this device's timezone. The scheduler checks every possible entrant. Leave a bound blank if unrestricted.",
          "زمان‌ها بر اساس منطقه زمانی این دستگاه هستند. زمان‌بندی همه شرکت‌کنندگان ممکن را بررسی می‌کند. برای نبود محدودیت، کادر را خالی بگذارید.",
        )}
      </p>
      <div className="two-columns">
        {(["availableFrom", "availableUntil"] as const).map((key) => (
          <Field
            key={key}
            label={
              key === "availableFrom"
                ? t("Available from", "دسترسی از")
                : t("Available until", "دسترسی تا")
            }
          >
            <input
              type="datetime-local"
              value={localDate(participant.metadata[key])}
              onChange={(event) => {
                const metadata = { ...participant.metadata };
                if (event.target.value)
                  metadata[key] = new Date(event.target.value).toISOString();
                else delete metadata[key];
                onChange({ ...participant, metadata });
              }}
            />
          </Field>
        ))}
      </div>
      <h3>{t("Organizer records", "سوابق برگزارکننده")}</h3>
      <Notice>
        {t(
          "These private records do not change participation status or existing draws. Update participation status separately when a decision affects play. Payment status is bookkeeping only.",
          "این سوابق خصوصی، وضعیت حضور یا قرعه‌های موجود را تغییر نمی‌دهند. اگر تصمیم بر بازی اثر دارد، وضعیت حضور را جداگانه تغییر دهید. وضعیت پرداخت فقط یک ثبت دستی است.",
        )}
      </Notice>
      <div className="two-columns">
        <Field label={t("Registration decision", "تصمیم ثبت‌نام")}>
          <select
            value={record.registration}
            onChange={(event) =>
              update({
                registration: event.target
                  .value as OrganizerRecord["registration"],
              })
            }
          >
            <option value="approved">{t("Approved", "تأییدشده")}</option>
            <option value="waiting">{t("Waiting list", "فهرست انتظار")}</option>
            <option value="rejected">{t("Rejected", "ردشده")}</option>
          </select>
        </Field>
        <Field label={t("Eligibility decision", "تصمیم صلاحیت")}>
          <select
            value={record.eligibility}
            onChange={(event) =>
              update({
                eligibility: event.target
                  .value as OrganizerRecord["eligibility"],
              })
            }
          >
            <option value="pending">
              {t("Pending review", "در انتظار بررسی")}
            </option>
            <option value="eligible">{t("Eligible", "واجد شرایط")}</option>
            <option value="ineligible">{t("Ineligible", "فاقد شرایط")}</option>
          </select>
        </Field>
        <Field label={t("Payment status", "وضعیت پرداخت")}>
          <select
            value={record.payment}
            onChange={(event) =>
              update({
                payment: event.target.value as OrganizerRecord["payment"],
              })
            }
          >
            <option value="untracked">{t("Not tracked", "ثبت نشده")}</option>
            <option value="unpaid">{t("Unpaid", "پرداخت نشده")}</option>
            <option value="paid">{t("Paid", "پرداخت شده")}</option>
            <option value="waived">{t("Waived", "معاف")}</option>
          </select>
        </Field>
      </div>
      <Field label={t("Private organizer note", "یادداشت خصوصی برگزارکننده")}>
        <textarea
          maxLength={2000}
          value={record.note}
          onChange={(event) => update({ note: event.target.value })}
        />
      </Field>
    </>
  );
}
