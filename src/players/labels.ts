import type { Locale } from "../domain/types";
import { translate } from "../i18n/translate";
import type { PlayerMetric } from "./model";
import { playerMetricTemplates } from "./templates";

export function playerMetricLabel(
  metric: PlayerMetric,
  sport: string,
  locale: Locale,
): string {
  const original = playerMetricTemplates(sport).find(
    (template) => template.id === metric.id,
  );
  if (original?.label === metric.label && original.fa === metric.fa)
    return translate(locale, metric.label, metric.fa);
  // Custom labels belong to the organizer, including optional Persian text.
  return locale === "fa" ? metric.fa || metric.label : metric.label;
}
