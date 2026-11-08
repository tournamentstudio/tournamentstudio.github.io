import { beforeAll, describe, expect, it } from "vitest";
import { localeCodes } from "../i18n/locales";
import { loadLanguage, translate } from "../i18n/translate";
import { playerMetricLabel } from "./labels";
import { playerMetricTemplates } from "./templates";

describe("player metric labels", () => {
  beforeAll(() => Promise.all(localeCodes.map(loadLanguage)));
  const goals = playerMetricTemplates("football")[0];

  it("translates an unedited built-in metric for every interface language", () => {
    for (const locale of localeCodes)
      expect(playerMetricLabel(goals, "football", locale)).toBe(
        translate(locale, "Goals", "گل"),
      );
  });

  it("preserves a custom metric even if its label is a known interface word", () => {
    const custom = { ...goals, id: "club-metric", label: "Goals" };
    for (const locale of localeCodes.filter((item) => item !== "fa"))
      expect(playerMetricLabel(custom, "football", locale)).toBe("Goals");
    expect(playerMetricLabel(custom, "football", "fa")).toBe("گل");
  });

  it("keeps an organizer's renamed preset unchanged", () => {
    const edited = { ...goals, label: "Club A+B points", fa: "امتیاز باشگاه" };
    expect(playerMetricLabel(edited, "football", "es")).toBe("Club A+B points");
    expect(playerMetricLabel(edited, "football", "ar")).toBe("Club A+B points");
    expect(playerMetricLabel(edited, "football", "fa")).toBe("امتیاز باشگاه");
  });
});
