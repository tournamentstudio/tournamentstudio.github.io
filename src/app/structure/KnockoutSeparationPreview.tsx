import type {
  KnockoutDrawConfig,
  KnockoutDrawPreview,
  Participant,
} from "../../domain/types";
import { useI18n } from "../../i18n";

export function KnockoutSeparationPreview({
  value,
  preview,
  participants,
}: {
  value: KnockoutDrawConfig | null;
  preview: KnockoutDrawPreview;
  participants: Map<string, Participant>;
}) {
  const { t, locale } = useI18n();
  if (
    !value ||
    value.version === 1 ||
    !value.separation.length ||
    !preview.ready
  )
    return null;
  return (
    <div className="draw-separation-preview">
      {value.separation.map(({ field, throughRound }) => {
        const size = 2 ** throughRound;
        const blockCount = preview.slots.length / size;
        const fieldName =
          field === "region"
            ? t("Regions", "منطقه‌ها")
            : t("Organizations", "سازمان‌ها");
        return (
          <details
            key={field}
            open
            className="draw-separation-rule"
            data-separation-field={field}
            data-through-round={throughRound}
          >
            <summary>
              {fieldName}: {t("separate through round", "جداسازی تا پایان دور")}{" "}
              {throughRound.toLocaleString(locale)}
            </summary>
            <p>
              {blockCount === 1
                ? t(
                    "This section covers the entire winners bracket. Every entrant must have a different label.",
                    "این بخش تمام جدول برندگان را در بر می‌گیرد. نام منطقه یا سازمان همه شرکت‌کنندگان باید متفاوت باشد.",
                  )
                : t(
                    "Each section feeds one winner into the next winners bracket round. Matching labels stay in different sections, including entrants receiving a BYE.",
                    "از هر بخش یک برنده به دور بعد جدول برندگان می‌رود. نام‌های یکسان در بخش‌های جدا قرار می‌گیرند؛ این قاعده شامل دریافت‌کنندگان استراحت هم می‌شود.",
                  )}
            </p>
            <div className="draw-separation-grid">
              {Array.from({ length: blockCount }, (_, index) => (
                <section
                  className="draw-separation-block"
                  key={index}
                  data-block-index={index}
                >
                  <h5>
                    {t("Section", "بخش")} {(index + 1).toLocaleString(locale)}
                    <small>
                      {t("Slots", "جایگاه‌ها")}{" "}
                      {(index * size + 1).toLocaleString(locale)}{" "}
                      {t("to", "تا")}{" "}
                      {((index + 1) * size).toLocaleString(locale)}
                    </small>
                  </h5>
                  <ul>
                    {preview.slots
                      .slice(index * size, (index + 1) * size)
                      .map((id, slotIndex) => {
                        const participant = id
                          ? participants.get(id)
                          : undefined;
                        return (
                          <li key={slotIndex} data-participant-id={id ?? ""}>
                            <bdi>
                              {participant?.[field] ??
                                (id
                                  ? t("Missing label", "نام خالی")
                                  : t("BYE", "استراحت"))}
                            </bdi>
                            {participant && (
                              <small>
                                <bdi>{participant.name}</bdi>
                              </small>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
