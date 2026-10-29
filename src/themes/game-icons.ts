import type { MotifShape } from "./motifs";

const path = (d: string, fill = false): MotifShape => ({
  kind: "path",
  d,
  fill,
});
const circle = (
  cx: number,
  cy: number,
  r: number,
  fill = false,
): MotifShape => ({ kind: "circle", cx, cy, r, fill });
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
): MotifShape => ({ kind: "rect", x, y, width, height, rx });

// Both fists have identical outlines. The bead belongs to the emblem, not a hand.
export const golHandOutline =
  "M9 54V45C5 42 3 38 3 33V25C3 21 9 21 9 25V21C9 17 15 17 15 21V20C15 16 21 16 21 20V22C21 18 27 18 27 22V36C27 41 25 44 24 46V54Z";
const golFingerLines =
  "M9 25V29C9 32 15 32 15 29V23M15 29C15 32 21 32 21 29V24M21 29C21 32 27 32 27 29M26 36L15 33C11 32 9 36 13 39L19 43M9 48H24";
export const golActionGeometry = {
  hands: [
    path(golHandOutline),
    path(golFingerLines),
    { ...path(golHandOutline), transform: "translate(64 0) scale(-1 1)" },
    { ...path(golFingerLines), transform: "translate(64 0) scale(-1 1)" },
    circle(32, 25, 3),
  ],
  token: [
    circle(32, 32, 19),
    path("M21 24C23 20 27 18 31 18M35 46C39 45 42 42 44 38"),
  ],
  bell: [
    path(
      "M13 43C13 29 20 20 32 20C44 20 51 29 51 43M9 43H55V50H9ZM25 14H39M32 14V20M7 54H57M14 17L10 13M50 17L54 13",
    ),
    path("M20 38C21 32 24 28 29 27"),
  ],
  cards: [
    { ...rect(13, 11, 34, 44, 4), transform: "rotate(-12 30 33)" },
    rect(22, 10, 31, 44, 4),
    circle(37.5, 32, 7),
    path("M28 17H33M42 47H47"),
  ],
} satisfies Record<string, readonly MotifShape[]>;
export type GolActionId = keyof typeof golActionGeometry;

export const gameIconGeometry = {
  generic: [
    path(
      "M20 10H44V25C44 35 39 41 32 41C25 41 20 35 20 25ZM20 15H10V23C10 31 15 34 22 34M44 15H54V23C54 31 49 34 42 34M32 41V51M22 55H42M25 51H39",
    ),
  ],
  football: [
    circle(32, 32, 25),
    path(
      "M32 20L44 28L40 42H24L20 28ZM32 20V7M44 28L55 23M40 42L47 52M24 42L17 52M20 28L9 23M14 15L23 9M41 9L50 15M56 34L52 45M12 45L8 34M27 56H37",
    ),
  ],
  futsal: [
    rect(4, 9, 56, 46, 9),
    path("M4 25H11V39H4M60 25H53V39H60"),
    circle(32, 32, 16),
    path(
      "M32 22L41 29L38 39H26L23 29ZM32 22V16M41 29L47 27M38 39L42 44M26 39L22 44M23 29L17 27",
    ),
  ],
  basketball: [
    circle(32, 32, 25),
    path("M7 32H57M32 7V57M14 14C34 27 34 37 14 50M50 14C30 27 30 37 50 50"),
  ],
  volleyball: [
    circle(32, 32, 25),
    path(
      "M32 32C34 20 42 15 52 17M32 32C21 29 13 32 8 40M32 32C38 43 38 51 33 57M12 18C24 17 33 21 38 24M10 26C19 24 27 25 33 29M20 53C17 42 19 35 24 31M27 57C22 47 23 39 28 33M56 29C48 39 41 43 35 43M57 37C49 46 42 49 36 50",
    ),
  ],
  tennis: [
    path("M25 35L12 53L17 57L31 39M24 36L30 40"),
    path(
      "M52 10C43 4 32 9 26 18C20 27 21 34 28 39C35 44 44 39 51 29C57 20 58 14 52 10Z",
    ),
    path(
      "M31 13L51 27M26 20L46 34M25 28L39 38M36 10L23 29M43 9L25 35M50 12L31 40M55 18L40 39",
    ),
    circle(48, 50, 8),
    path("M42 45C47 46 50 50 51 57"),
  ],
  "table-tennis": [
    path(
      "M34 8C45 11 51 23 46 34C42 43 36 44 31 44L20 58L13 52L25 38C18 33 15 27 17 20C19 12 26 6 34 8Z",
    ),
    path("M19 29L39 43M23 42L28 46"),
    circle(51, 12, 6),
  ],
  badminton: [
    path(
      "M23 44L7 11L18 7L28 40M29 40L25 5H38L35 40M37 41L46 7L57 11L41 44M7 11C24 21 40 21 57 11M14 26C26 33 38 33 50 26M20 37C29 41 35 41 44 37M23 44H41C41 58 23 58 23 44Z",
    ),
  ],
  chess: [
    path(
      "M18 49L21 39L30 31L24 24L16 26L11 20L19 11L29 8L35 3L38 10C49 11 54 22 53 34L50 49ZM18 49H50L55 57H13ZM21 39C34 42 46 34 42 24M19 11L23 17L16 22",
    ),
    circle(30, 17, 1.5, true),
  ],
  esports: [
    path(
      "M20 16H44C49 16 52 20 54 27L59 44C62 55 52 59 45 51L38 43H26L19 51C12 59 2 55 5 44L10 27C12 20 15 16 20 16ZM16 26V38M10 32H22M28 31H36M26 10H38",
    ),
    circle(43, 27, 2.5),
    circle(51, 35, 2.5),
  ],
  racing: [
    path("M12 58V8M12 10C28 1 37 19 55 10V36C37 45 28 27 12 36"),
    path(
      "M12 10C17 7 22 8 26 9V18C21 17 17 16 12 19ZM26 18C31 20 35 22 40 22V31C35 31 31 29 26 27ZM40 13C45 14 50 13 55 10V19C50 22 45 23 40 22ZM12 27C17 24 22 26 26 27V36C21 34 17 33 12 36ZM40 31C45 32 50 31 55 28V36C50 39 45 40 40 39Z",
      true,
    ),
  ],
  "board-games": [
    rect(5, 8, 31, 31, 5),
    circle(13, 16, 2, true),
    circle(28, 16, 2, true),
    circle(20.5, 23.5, 2, true),
    circle(13, 31, 2, true),
    circle(28, 31, 2, true),
    circle(46, 31, 7),
    path("M42 38C42 45 39 49 35 52V57H58V52C53 49 50 45 50 38M35 52H58"),
  ],
  quiz: [
    path(
      "M6 18C16 14 23 16 32 21C41 16 48 14 58 18V51C48 47 41 49 32 54C23 49 16 47 6 51ZM32 21V54M13 29L25 32M13 37L25 40",
    ),
    path("M39 29C39 22 50 22 50 29C50 34 44 33 44 38"),
    circle(44, 43, 1.5, true),
  ],
  "gol-ya-pooch": golActionGeometry.hands,
} satisfies Record<string, readonly MotifShape[]>;
export type GameIconId = keyof typeof gameIconGeometry;

export function getGameIconId(sport: string): GameIconId {
  return Object.hasOwn(gameIconGeometry, sport)
    ? (sport as GameIconId)
    : "generic";
}
