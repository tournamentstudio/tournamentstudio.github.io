import { Check, MapPin } from "lucide-react";
import type { Participant, Resource } from "../../domain/types";
import type {
  AutomaticVenuePreview as Proposal,
  AutomaticVenueRequest,
} from "../../engine/automatic-venues";
import { knockoutVenueTargetKey } from "../../engine/venue-distance";
import { useI18n } from "../../i18n";
import { venueTargetLabel } from "./knockout-venue-label";

export function AutomaticVenuePreview({
  proposal,
  request,
  resources,
  participants,
}: {
  proposal: Proposal;
  request: AutomaticVenueRequest;
  resources: Resource[];
  participants: Participant[];
}) {
  const { t, locale } = useI18n();
  const format = (value: number) =>
    value.toLocaleString(locale, {
      maximumSignificantDigits: 21,
      notation: value > 0 && value < 0.000001 ? "scientific" : "standard",
    });
  const distance = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const chosen = [
    ...new Set(proposal.assignments.map((item) => item.resourceId)),
  ];
  const names = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  return (
    <div className="automatic-venue-preview">
      <h5>
        <Check size={18} aria-hidden="true" />
        {t("Venue proposal is ready", "پیشنهاد محل بازی آماده است")}
      </h5>
      <div className="draw-summary">
        {request.minKm !== undefined && (
          <strong>
            {t("Minimum", "حداقل")}: {format(request.minKm)}{" "}
            {t("km", "کیلومتر")}
          </strong>
        )}
        {request.maxKm !== undefined && (
          <strong>
            {t("Maximum", "حداکثر")}: {format(request.maxKm)}{" "}
            {t("km", "کیلومتر")}
          </strong>
        )}
        <span>
          {proposal.assignments.length.toLocaleString(locale)}{" "}
          {t("selected matches", "دیدار انتخاب‌شده")}
        </span>
      </div>
      <div
        className="automatic-venue-assignments"
        tabIndex={0}
        role="region"
        aria-label={t("Suggested venue assignments", "تخصیص پیشنهادی محل بازی")}
      >
        {chosen.map((resourceId) => (
          <section className="automatic-venue-choice" key={resourceId}>
            <h6>
              <MapPin size={16} aria-hidden="true" />
              <bdi>
                {resources.find((resource) => resource.id === resourceId)
                  ?.name ?? t("Missing venue", "محل بازی یافت نشد")}
              </bdi>
            </h6>
            <ul>
              {proposal.assignments
                .filter((item) => item.resourceId === resourceId)
                .map((item) => (
                  <li key={knockoutVenueTargetKey(item.target)}>
                    <strong>{venueTargetLabel(item.target, locale)}</strong>
                    <span>
                      {t("Possible entrants", "شرکت‌کنندگان ممکن")}:{" "}
                      {item.entrantCount.toLocaleString(locale)}
                    </span>
                    <span>
                      {t("Nearest base", "نزدیک‌ترین پایگاه")}:{" "}
                      {distance(item.minDistanceKm)} {t("km", "کیلومتر")}
                    </span>
                    <span>
                      {t("Farthest base", "دورترین پایگاه")}:{" "}
                      {distance(item.maxDistanceKm)} {t("km", "کیلومتر")}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {proposal.preview && (
        <details className="automatic-venue-pairings">
          <summary>
            {t(
              "Opening pairings in this proposal",
              "رویارویی‌های آغازین این پیشنهاد",
            )}
          </summary>
          <ol>
            {Array.from(
              { length: proposal.preview.slots.length / 2 },
              (_, index) => (
                <li key={index}>
                  <span>
                    {t("Opening match", "دیدار آغازین")}{" "}
                    {(index + 1).toLocaleString(locale)}
                  </span>
                  {proposal
                    .preview!.slots.slice(index * 2, index * 2 + 2)
                    .map((id, offset) => (
                      <bdi key={offset}>
                        {id ? (names.get(id) ?? id) : t("BYE", "استراحت")}
                      </bdi>
                    ))}
                </li>
              ),
            )}
          </ol>
        </details>
      )}
      <p className="muted">
        {t(
          "All possible entrants fit the chosen venue ranges, including later result paths and BYEs. Distances shown here are rounded; validation uses the entered limits without rounding.",
          "همه شرکت‌کنندگان ممکن، از جمله مسیرهای نتایج بعدی و استراحت‌ها، در بازه مجاز محل‌های انتخاب‌شده قرار دارند. فاصله‌های نمایش‌داده‌شده گرد شده‌اند؛ اعتبارسنجی از حدود واردشده بدون گرد کردن استفاده می‌کند.",
        )}
      </p>
    </div>
  );
}
