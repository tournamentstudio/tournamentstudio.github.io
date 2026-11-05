import type { Stage } from "./types";

/** Unmarked saved stages keep their original group and qualification identifiers. */
export function generatedGroupLabel(
  stage: Pick<Stage, "config">,
  index: number,
): string {
  if (stage.config.groupLabelVersion !== 1)
    return String.fromCharCode(65 + index);
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

export function sortGroupLabels(
  stage: Pick<Stage, "config">,
  groups: string[],
): string[] {
  return [...groups].sort(
    (a, b) =>
      (stage.config.groupLabelVersion === 1 ? a.length - b.length : 0) ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
}
