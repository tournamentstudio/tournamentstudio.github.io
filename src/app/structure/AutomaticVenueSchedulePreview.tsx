import type { ScheduledVenuePreview } from "../../scheduling/automatic-venues";
import { useI18n } from "../../i18n";

export function AutomaticVenueSchedulePreview({
  preview,
  timezone,
}: {
  preview: NonNullable<ScheduledVenuePreview["schedulePreview"]>;
  timezone: string;
}) {
  const { t, locale } = useI18n();
  const date = (value: string) =>
    new Date(value).toLocaleString(locale, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <section
      className="automatic-venue-schedule-note"
      aria-label={t("Stage schedule estimate", "برآورد برنامه مرحله")}
    >
      <h5>{t("Stage schedule estimate", "برآورد برنامه مرحله")}</h5>
      <dl>
        <div>
          <dt>{t("Matches in this stage", "دیدارهای این مرحله")}</dt>
          <dd>{preview.matchCount.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{t("Stage starts", "شروع مرحله")}</dt>
          <dd>
            <time dateTime={preview.startsAt}>{date(preview.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t("Stage finishes", "پایان مرحله")}</dt>
          <dd>
            <time dateTime={preview.endsAt}>{date(preview.endsAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t("Timezone", "منطقه زمانی")}</dt>
          <dd>
            <bdi>{timezone}</bdi>
          </dd>
        </div>
      </dl>
      <p>
        {t(
          "A schedule was found with the current settings. Generate the schedule after saving these rules and generating the draw.",
          "با تنظیمات فعلی، یک برنامه زمانی پیدا شد. پس از ذخیره این قوانین و ساخت قرعه، برنامه زمانی را بسازید.",
        )}
      </p>
    </section>
  );
}
