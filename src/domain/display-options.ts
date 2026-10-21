import { z } from "zod";

export const bracketLayouts = [
  "horizontal",
  "vertical",
  "centered",
  "compact",
] as const;
export type BracketLayout = (typeof bracketLayouts)[number];

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const themeDesignSchema = z
  .object({
    gradient: z
      .object({
        from: color,
        to: color,
        angle: z.number().int().min(0).max(360),
      })
      .strict()
      .optional(),
    fontWeight: z.number().int().min(300).max(900).optional(),
    textAlign: z.enum(["start", "center", "end"]).optional(),
    cardStyle: z.enum(["flat", "outline", "elevated", "glass"]).optional(),
    cardColor: color.optional(),
    tableStyle: z.enum(["lined", "striped", "minimal"]).optional(),
    shadow: z.enum(["none", "soft", "strong"]).optional(),
    winnerEffect: z.enum(["color", "glow", "underline"]).optional(),
    animationSeconds: z.number().min(0.1).max(3).optional(),
    bracketLayout: z.enum(bracketLayouts).optional(),
    sponsorPosition: z.enum(["top", "bottom"]).optional(),
  })
  .strict();
export type ThemeDesign = z.infer<typeof themeDesignSchema>;

export const overlaySchema = z
  .object({
    enabled: z.boolean(),
    layout: z.enum(["strip", "stacked", "compact"]),
    background: z.enum(["transparent", "chroma", "theme"]),
    chroma: color,
    position: z.enum(["top", "center", "bottom"]),
    matchId: z.string().min(1).max(160).optional(),
    showTournament: z.boolean(),
  })
  .strict();
export type OverlaySettings = z.infer<typeof overlaySchema>;
export const defaultOverlay: OverlaySettings = {
  enabled: false,
  layout: "strip",
  background: "transparent",
  chroma: "#00ff00",
  position: "bottom",
  showTournament: true,
};

export const advancedSceneTypes = [
  "introduction",
  "semifinal",
  "final-intro",
  "trophy",
] as const;
export type AdvancedSceneType = (typeof advancedSceneTypes)[number];
