import {
  gameIconGeometry,
  getGameIconId,
  golActionGeometry,
} from "../themes/game-icons";
import type { MotifShape } from "../themes/motifs";

const color = (value: string, fallback: string) =>
  /^#[\da-f]{6}$/i.test(value) ? value : fallback;

function shapesSVG(shapes: readonly MotifShape[]) {
  return shapes
    .map((shape) => {
      const paint = `fill="${shape.fill ? "currentColor" : "none"}"`;
      const transform = shape.transform
        ? ` transform="${shape.transform}"`
        : "";
      if (shape.kind === "path")
        return `<path d="${shape.d}" ${paint}${transform}/>`;
      if (shape.kind === "circle")
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" ${paint}${transform}/>`;
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.rx ?? 0}" ${paint}${transform}/>`;
    })
    .join("");
}

function emblem(
  shapes: readonly MotifShape[],
  x: number,
  y: number,
  size: number,
) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${shapesSVG(shapes)}</g>`;
}

export function gameEmblemSVG(
  sport: string,
  accent: string,
  x: number,
  y: number,
  size: number,
) {
  const id = getGameIconId(sport);
  return `<g data-game-emblem="${id}" color="${color(accent, "#25634a")}" stroke="currentColor" aria-hidden="true">${emblem(gameIconGeometry[id], x, y, size)}</g>`;
}

function field(lines: string, rounded = 6) {
  return `<rect x="70" y="44" width="500" height="264" rx="${rounded}"/><path d="${lines}"/>`;
}

function scene(sport: string) {
  switch (sport) {
    case "football":
      return field(
        "M320 44V308M70 104H144V248H70M570 104H496V248H570M70 136H101V216H70M570 136H539V216H570",
      );
    case "futsal":
      return field(
        "M320 44V308M70 107C191 107 191 245 70 245M570 107C449 107 449 245 570 245M70 151H95V201H70M570 151H545V201H570",
        48,
      );
    case "basketball":
      return field(
        "M320 44V308M70 113H176V239H70M570 113H464V239H570M70 67C278 67 278 285 70 285M570 67C362 67 362 285 570 285M100 158V194M540 158V194",
      );
    case "volleyball":
      return field(
        "M320 44V308M232 44V308M408 44V308M310 20V332M330 20V332M310 66H330M310 110H330M310 154H330M310 198H330M310 242H330M310 286H330",
      );
    case "tennis":
      return field(
        "M70 75H570M70 277H570M320 44V308M195 75V277M445 75V277M195 176H445M320 20V332",
      );
    case "table-tennis":
      return `<path d="M115 55H525L576 286H64ZM93 176H548M320 55V286M93 157V191M548 157V191M98 286L80 325M542 286L560 325"/><path d="M93 157H548" stroke-dasharray="8 6"/>`;
    case "badminton":
      return field(
        "M70 72H570M70 280H570M121 44V308M519 44V308M255 44V308M385 44V308M121 176H255M385 176H519M320 24V328",
      );
    case "chess":
      return Array.from({ length: 8 }, (_, row) =>
        Array.from(
          { length: 8 },
          (_, column) =>
            `<rect x="${160 + column * 40}" y="${16 + row * 40}" width="40" height="40" fill="${(row + column) % 2 ? "currentColor" : "none"}" fill-opacity=".2"/>`,
        ).join(""),
      ).join("");
    case "esports":
      return `<path d="M60 65H164L208 109H432L476 65H580M60 287H164L208 243H432L476 287H580M92 65V130H152M548 287V222H488M60 176H181M459 176H580M130 28H214M426 324H510"/><circle cx="60" cy="176" r="8"/><circle cx="580" cy="176" r="8"/><path d="M200 20L186 34M432 318L446 332"/>`;
    case "racing":
      return `<path d="M40 65H600M40 287H600M78 176H204M436 176H562" stroke-dasharray="24 18"/><path d="M98 24L38 328M158 24L98 328M482 24L542 328M542 24L602 328"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${98 - i * 10}" y="${24 + i * 50}" width="30" height="50" transform="skewX(-11)" fill="${i % 2 ? "none" : "currentColor"}" fill-opacity=".2"/>`).join("")}`;
    case "board-games":
      return `<rect x="113" y="32" width="414" height="288" rx="24"/><path d="M145 72H495V280H145ZM185 72V280M455 72V280M145 112H495M145 240H495"/><circle cx="165" cy="92" r="7"/><circle cx="475" cy="260" r="7"/><path d="M103 155L74 176L103 197M537 155L566 176L537 197"/>`;
    case "quiz":
      return `<path d="M320 70C248 25 177 25 103 61V294C177 258 248 258 320 303C392 258 463 258 537 294V61C463 25 392 25 320 70ZM320 70V303M136 106L208 96M136 144L193 137M432 96L504 106M447 137L504 144M136 243L208 233M432 233L504 243"/>`;
    default:
      return `<path d="M215 40C127 94 108 216 211 298M425 40C513 94 532 216 429 298M184 73L154 58M161 106L128 98M146 145L113 143M147 185L114 193M161 225L134 243M184 261L164 289M456 73L486 58M479 106L512 98M494 145L527 143M493 185L526 193M479 225L506 243M456 261L476 289"/>`;
  }
}

/** Static artwork accepts an activity identifier and colors, never match state. */
export function gameSceneSVG(
  sport: string,
  palette: { accent: string; card: string },
  x: number,
  y: number,
  width: number,
) {
  const id = getGameIconId(sport);
  const accent = color(palette.accent, "#25634a"),
    card = color(palette.card, "#ffffff");
  const art =
    id === "gol-ya-pooch"
      ? `<g opacity=".35" stroke-width="2"><path d="M188 262V113C188 68 255 35 320 13C385 35 452 68 452 113V262M203 262V117C203 78 262 49 320 28C378 49 437 78 437 117V262M126 291H514M149 312H491"/><path d="M100 96L119 115L100 134L81 115ZM540 96L559 115L540 134L521 115ZM100 152L119 171L100 190L81 171ZM540 152L559 171L540 190L521 171Z"/></g><path d="M124 273H516L545 295H95Z" fill="${card}" stroke-width="2"/>${emblem(golActionGeometry.hands, 234, 76, 172)}${emblem(golActionGeometry.bell, 139, 204, 70)}${emblem(golActionGeometry.cards, 429, 204, 70)}<circle cx="320" cy="266" r="5" fill="currentColor"/>`
      : `<g opacity=".28" stroke-width="2.2" fill="none">${scene(id)}</g><circle cx="320" cy="176" r="105" fill="${card}" stroke-width="1.5"/>${emblem(gameIconGeometry[id], 234, 90, 172)}`;
  return `<g data-game-art="${id}" aria-hidden="true" transform="translate(${x} ${y}) scale(${width / 640})" color="${accent}" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">${art}</g>`;
}
