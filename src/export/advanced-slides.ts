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
  visualTextLines,
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
    return entrants.flatMap((p) => {
      const title =
        scene.title || label("MEET THE COMPETITORS", "آشنایی با رقبا");
      const titleBottom =
        410 + (visualTextLines(title, 30, 1400).length - 1) * 45;
      const nameY = Math.max(520, titleBottom + 100);
      const nameBottom =
        nameY + (visualTextLines(p.name, 72, 1400).length - 1) * 108;
      const organizationY = nameBottom + 80;
      const organizationBottom = p.organization
        ? organizationY +
          (visualTextLines(p.organization, 28, 1400).length - 1) * 42
        : nameBottom;
      const descriptionLines = visualTextLines(scene.text, 28, 1400);
      const firstDescription = descriptionLines.slice(0, 6);
      const descriptionHeight = (firstDescription.length - 1) * 42;
      const height = Math.max(
        900,
        organizationBottom + 210 + descriptionHeight,
      );
      const descriptionY = height - 110 - descriptionHeight;
      const continuationTitle = label("Introduction continued", "ادامه معرفی");
      if (height > 2400)
        return tableVisualPages(
          t,
          label("Participant introduction", "معرفی شرکت‌کننده"),
          [title, p.name, p.organization ?? "", scene.text].filter(Boolean),
          locale,
        );
      const identity =
        p.logo && validateRasterAsset(p.logo)
          ? `<image href="${escapeXML(p.logo)}" x="690" y="125" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>`
          : `<circle cx="800" cy="235" r="110" fill="${c.card}" stroke="${c.accent}"/>${visualText(Array.from(p.name).slice(0, 2).join(""), 800, 260, 72, 200, locale, c.accent)}`;
      const firstPage = {
        title: `${title}: ${p.name}`,
        svg: visualFrame(
          t,
          p.name,
          identity +
            `<g data-text-region="introduction-title">${visualText(title, 800, 410, 30, 1400, locale, c.accent)}</g>` +
            `<g data-text-region="introduction-name">${visualText(p.name, 800, nameY, 72, 1400, locale, c.foreground)}</g>` +
            `<g data-text-region="introduction-organization">${visualText(
              p.organization ?? "",
              800,
              organizationY,
              28,
              1400,
              locale,
              c.foreground,
            )}</g>` +
            `<g data-text-region="introduction-description">${visualText(
              firstDescription.join("\n"),
              800,
              descriptionY,
              28,
              1400,
              locale,
              c.foreground,
            )}</g>`,
          locale,
          1600,
          height,
        ),
      };
      return [
        firstPage,
        ...(descriptionLines.length > firstDescription.length
          ? tableVisualPages(
              t,
              continuationTitle,
              descriptionLines.slice(6),
              locale,
            )
          : []),
      ];
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
