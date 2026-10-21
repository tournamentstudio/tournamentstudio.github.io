import type { Locale, Tournament } from "../domain/types";
import type { AdvancedScene } from "../presentation/advanced-scenes";
import { introductionMatch } from "../presentation/advanced-scenes";
import { publicProjection } from "../sharing";
import { escapeXML } from "./index";
import { validateRasterAsset } from "../security/codec";
import {
  championPosterSVG,
  exportLabel,
  scoreboardSVG,
  tableVisualPages,
  visualFrame,
  visualPalette,
  visualText,
  wrapVisualText,
  type VisualPage,
} from "./visuals";

export function advancedSlidePages(
  tournament: Tournament,
  scene: AdvancedScene,
  locale: Locale,
): VisualPage[] {
  const t = publicProjection(tournament),
    c = visualPalette(t);
  const label = (en: string, fa: string) => exportLabel(locale, en, fa);
  if (scene.type === "trophy") {
    try {
      return [
        {
          title: scene.title || label("Trophy celebration", "جشن قهرمانی"),
          svg: championPosterSVG(t, locale),
        },
      ];
    } catch {
      return tableVisualPages(
        t,
        scene.title || label("Trophy celebration", "جشن قهرمانی"),
        [
          label(
            "The champion is not decided yet.",
            "قهرمان هنوز مشخص نشده است.",
          ),
        ],
        locale,
      );
    }
  }
  if (scene.type === "introduction") {
    const ids =
      scene.participantIds === undefined
        ? undefined
        : new Set(scene.participantIds);
    const entrants = t.participants.filter(
      (p) => p.status === "active" && (!ids || ids.has(p.id)),
    );
    if (!entrants.length)
      return tableVisualPages(
        t,
        scene.title || label("Participant introductions", "معرفی شرکت‌کنندگان"),
        [
          label(
            "No active participants selected",
            "شرکت‌کننده فعالی انتخاب نشده است",
          ),
        ],
        locale,
      );
    return entrants.map((p) => {
      const title =
        scene.title || label("MEET THE COMPETITORS", "آشنایی با رقبا");
      const nameLines = wrapVisualText(p.name, 26).length;
      const height = Math.max(
        900,
        570 + nameLines * 108 + wrapVisualText(scene.text, 55).length * 42,
      );
      const identity =
        p.logo && validateRasterAsset(p.logo)
          ? `<image href="${escapeXML(p.logo)}" x="690" y="125" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>`
          : `<circle cx="800" cy="235" r="110" fill="${c.card}" stroke="${c.accent}"/>${visualText(Array.from(p.name).slice(0, 2).join(""), 800, 260, 72, 200, locale, c.accent)}`;
      return {
        title: `${title}: ${p.name}`,
        svg: visualFrame(
          t,
          p.name,
          identity +
            visualText(title, 800, 410, 30, 1400, locale, c.accent) +
            visualText(p.name, 800, 520, 72, 1400, locale, c.foreground) +
            visualText(
              p.organization ?? "",
              800,
              540 + nameLines * 108,
              28,
              1400,
              locale,
              c.foreground,
            ) +
            visualText(
              scene.text,
              800,
              height - 110,
              28,
              1400,
              locale,
              c.foreground,
            ),
          locale,
          1600,
          height,
        ),
      };
    });
  }
  const match = introductionMatch(t, scene.type, scene.matchId);
  const title =
    scene.title ||
    (scene.type === "semifinal"
      ? label("Semifinal introduction", "معرفی نیمه‌نهایی")
      : label("Final introduction", "معرفی فینال"));
  return match
    ? [
        {
          title,
          svg: scoreboardSVG(
            { ...t, presentation: { ...t.presentation, showScores: false } },
            match.id,
            locale,
          ),
        },
      ]
    : tableVisualPages(
        t,
        title,
        [label("The match is not available yet", "مسابقه هنوز آماده نشده است")],
        locale,
      );
}
