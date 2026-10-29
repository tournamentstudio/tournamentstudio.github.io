import {
  gameIconGeometry,
  getGameIconId,
  golActionGeometry,
  type GolActionId,
} from "./game-icons";
import type { MotifShape } from "./motifs";
import "./game-icons.css";

function IconShapes({ shapes }: { shapes: readonly MotifShape[] }) {
  return shapes.map((shape, i) => {
    const common = {
      fill: shape.fill ? "currentColor" : "none",
      transform: shape.transform,
    };
    if (shape.kind === "path") return <path key={i} {...common} d={shape.d} />;
    if (shape.kind === "circle")
      return (
        <circle key={i} {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />
      );
    return (
      <rect
        key={i}
        {...common}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
      />
    );
  });
}

interface IconProps {
  size?: number;
  className?: string;
  label?: string;
}

export function GameIcon({
  sport,
  size = 24,
  className = "",
  label,
}: IconProps & { sport: string }) {
  const id = getGameIconId(sport);
  return (
    <svg
      className={`game-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label || undefined}
      role={label ? "img" : undefined}
      focusable="false"
      data-game-icon={id}
    >
      <IconShapes shapes={gameIconGeometry[id]} />
    </svg>
  );
}

export function GolActionIcon({
  action,
  size = 24,
  className = "",
  label,
}: IconProps & { action: GolActionId }) {
  const id = Object.hasOwn(golActionGeometry, action) ? action : "hands";
  return (
    <svg
      className={`game-icon gol-action-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label || undefined}
      role={label ? "img" : undefined}
      focusable="false"
      data-gol-icon={id}
    >
      <IconShapes shapes={golActionGeometry[id]} />
    </svg>
  );
}
