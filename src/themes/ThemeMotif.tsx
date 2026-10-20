import type { Locale } from "../domain/types";
import { gameCollections, getTheme, getThemesForSport } from "./index";
import { motifGeometry } from "./motifs";
import "./themes.css";

export function ThemeMotif({
  preset,
  variant = "emblem",
  className = "",
}: {
  preset: string;
  variant?: "emblem" | "field" | "ornament";
  className?: string;
}) {
  const theme = getTheme(preset);
  return (
    <svg
      className={`theme-motif theme-motif-${variant} ${className}`}
      viewBox="0 0 240 180"
      fill="none"
      stroke="currentColor"
      strokeWidth={variant === "field" ? 1.2 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-motif={theme.motif}
      data-material={theme.material}
    >
      {variant === "ornament" && (
        <path
          d="M10 20H28M10 20V38M212 20H230V38M10 142V160H28M212 160H230V142"
          opacity=".45"
        />
      )}
      {motifGeometry[theme.motif].map((shape, i) => {
        if (shape.kind === "path")
          return (
            <path
              key={i}
              d={shape.d}
              fill={shape.fill ? "currentColor" : "none"}
            />
          );
        if (shape.kind === "circle")
          return (
            <circle
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={shape.fill ? "currentColor" : "none"}
            />
          );
        return (
          <rect
            key={i}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.rx}
            fill={shape.fill ? "currentColor" : "none"}
          />
        );
      })}
    </svg>
  );
}
export function GameIdentity({
  sport,
  preset,
  locale = "en",
  compact = false,
  className = "",
}: {
  sport: string;
  preset?: string;
  locale?: Locale;
  compact?: boolean;
  className?: string;
}) {
  const theme = getTheme(preset ?? getThemesForSport(sport)[0].id);
  const game = gameCollections[sport] ?? gameCollections.generic;
  return (
    <div
      className={`game-identity ${compact ? "game-identity-compact" : ""} ${className}`}
      data-game={sport}
      data-theme={theme.id}
    >
      <span className="game-identity-mark">
        <ThemeMotif preset={theme.id} />
      </span>
      <div className="game-identity-copy">
        <strong>{locale === "fa" ? game.fa : game.name}</strong>
        <span>{locale === "fa" ? theme.fa : theme.name}</span>
        {!compact && (
          <p>{locale === "fa" ? theme.descriptionFa : theme.description}</p>
        )}
      </div>
    </div>
  );
}
