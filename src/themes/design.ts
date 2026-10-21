import type { CSSProperties } from "react";
import type { ThemeDesign } from "../domain/display-options";

export function designStyle(design: ThemeDesign | undefined): CSSProperties {
  if (!design) return {};
  const shadow =
    design.shadow === "strong"
      ? "0 18px 36px #00000030"
      : design.shadow === "soft"
        ? "0 6px 18px #00000018"
        : "none";
  return {
    ...(design.fontWeight ? { "--theme-weight": design.fontWeight } : {}),
    ...(design.textAlign ? { "--theme-align": design.textAlign } : {}),
    ...(design.cardColor ? { "--theme-card": design.cardColor } : {}),
    ...(design.animationSeconds
      ? { "--theme-animation": `${design.animationSeconds}s` }
      : {}),
    ...(design.shadow !== undefined || design.cardStyle === "elevated"
      ? {
          "--theme-card-shadow":
            design.cardStyle === "elevated"
              ? shadow === "none"
                ? "0 8px 20px #00000020"
                : shadow
              : shadow,
        }
      : {}),
    ...(design.cardStyle
      ? {
          "--theme-card-filter":
            design.cardStyle === "elevated"
              ? "drop-shadow(0 4px 6px #00000020)"
              : "none",
          "--theme-card-fill":
            design.cardStyle === "outline"
              ? "transparent"
              : design.cardStyle === "glass"
                ? "color-mix(in srgb,var(--theme-card) 70%,transparent)"
                : "var(--theme-card)",
          "--theme-card-backdrop":
            design.cardStyle === "glass" ? "blur(12px)" : "none",
        }
      : {}),
    ...(design.tableStyle
      ? {
          "--theme-table-border":
            design.tableStyle === "minimal" ? "0px" : "1px",
          "--theme-table-stripe":
            design.tableStyle === "striped"
              ? "color-mix(in srgb,var(--theme-accent) 8%,var(--theme-card))"
              : "transparent",
        }
      : {}),
    ...(design.winnerEffect
      ? {
          "--theme-winner-filter":
            design.winnerEffect === "glow"
              ? "drop-shadow(0 0 5px var(--theme-accent))"
              : "none",
          "--theme-winner-decoration":
            design.winnerEffect === "underline" ? "underline" : "none",
        }
      : {}),
    ...(design.gradient
      ? {
          "--theme-material": `linear-gradient(${design.gradient.angle}deg,${design.gradient.from},${design.gradient.to})`,
          "--theme-material-size": "100% 100%",
        }
      : {}),
  } as CSSProperties;
}
