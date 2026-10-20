import type { ThemeMaterial, ThemeMotifId } from "./identities";
export type MotifShape =
  | { kind: "path"; d: string; fill?: boolean }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: boolean }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill?: boolean;
    };
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
  fill = false,
): MotifShape => ({ kind: "rect", x, y, width, height, rx, fill });
export const motifGeometry: Record<ThemeMotifId, readonly MotifShape[]> = {
  constellation: [
    circle(120, 90, 56),
    circle(120, 90, 34),
    path("M56 90H78M162 90H184M120 26V48M120 132V154"),
    path("M86 56L154 124M154 56L86 124"),
    circle(120, 90, 5, true),
  ],
  "football-field": [
    rect(32, 32, 176, 116, 7),
    path("M120 32V148M32 61H64V119H32M208 61H176V119H208"),
    circle(120, 90, 23),
    circle(120, 90, 2, true),
    path("M32 74H44V106H32M208 74H196V106H208"),
  ],
  "futsal-court": [
    rect(31, 35, 178, 110, 17),
    path("M120 35V145M31 58C80 58 80 122 31 122M209 58C160 58 160 122 209 122"),
    circle(120, 90, 19),
    path("M31 77H22V103H31M209 77H218V103H209"),
    circle(65, 90, 2, true),
    circle(175, 90, 2, true),
  ],
  "basketball-key": [
    rect(37, 28, 166, 126, 4),
    path("M120 28V154M37 61H86V121H37M203 61H154V121H203"),
    circle(120, 91, 20),
    path("M37 39C128 39 128 143 37 143M203 39C112 39 112 143 203 143"),
    circle(57, 91, 7),
    circle(183, 91, 7),
  ],
  "volleyball-net": [
    rect(37, 36, 166, 108, 2),
    path(
      "M120 36V144M77 36V144M163 36V144M115 26V154M125 26V154M115 46H125M115 62H125M115 78H125M115 94H125M115 110H125M115 126H125M115 142H125",
    ),
    circle(70, 70, 17),
    path("M55 62C70 59 79 67 82 82M70 53C66 67 58 71 54 75"),
  ],
  "tennis-lines": [
    rect(43, 24, 154, 132, 2),
    path(
      "M57 24V156M183 24V156M43 90H197M57 57H183M57 123H183M120 57V123M36 90H204",
    ),
    circle(120, 90, 3, true),
  ],
  "tabletennis-paddle": [
    rect(31, 39, 178, 103, 5),
    path("M120 39V142M114 33V148M126 33V148"),
    path("M64 71C40 76 43 107 62 112L76 132L87 123L73 104C88 88 83 67 64 71Z"),
    path(
      "M165 107C189 102 186 71 167 66L153 46L142 55L156 74C141 90 146 111 165 107Z",
    ),
    circle(149, 117, 7),
  ],
  "badminton-shuttle": [
    path(
      "M103 119L66 44L84 38L119 113M112 115L104 31H123L128 115M126 113L145 36L163 44L138 120M66 44C95 62 134 65 163 44M81 75C106 88 134 88 153 75M94 102C110 110 129 110 144 102",
    ),
    path("M103 119C104 151 137 151 139 119Z"),
    path("M50 154H190"),
  ],
  "chess-knight": [
    path(
      "M83 135L89 111L112 94L95 76L77 82L64 67L82 47L108 37L121 25L127 42C158 45 171 75 170 101L164 135Z",
    ),
    path(
      "M85 135H164L175 150H73ZM88 111C123 118 147 101 141 77M82 47L91 61L76 72",
    ),
    circle(108, 58, 3, true),
    path("M38 160H202"),
  ],
  "racing-circuit": [
    path(
      "M47 99C24 70 44 38 82 42L133 45C154 46 146 73 169 69C206 63 220 94 196 119L159 147C139 163 108 148 111 127C114 105 72 132 47 99Z",
    ),
    path(
      "M57 93C41 74 55 52 81 56L134 58C144 60 143 88 171 82C194 77 203 94 186 109L150 136C134 146 121 138 125 124C131 90 78 113 57 93Z",
    ),
    path("M58 46L52 58M69 43L65 56M57 49L66 52"),
    circle(177, 40, 7),
  ],
  "board-hex": [
    path(
      "M120 25L151 43V79L120 97L89 79V43ZM89 79L89 115L58 133L27 115V79L58 61ZM151 79L182 61L213 79V115L182 133L151 115ZM89 115L120 97L151 115V151L120 169L89 151Z",
    ),
    circle(120, 61, 10),
    circle(58, 97, 8),
    circle(182, 97, 8),
    path("M109 128H131V149H109Z"),
  ],
  "quiz-orbit": [
    path(
      "M49 129V44C74 37 99 43 120 53C141 43 166 37 191 44V129C163 122 143 129 120 139C97 129 77 122 49 129ZM120 53V139M62 62L101 72M62 80L101 89M139 72L178 62M139 89L178 80",
    ),
    circle(120, 33, 8),
    path("M93 25C113 13 136 15 148 30M92 28L93 17M145 20L148 30L157 24"),
  ],
  "esports-reticle": [
    path(
      "M75 55L58 105C51 130 74 145 92 121L106 106H134L148 121C166 145 189 130 182 105L165 55ZM82 76V100M70 88H94",
    ),
    circle(151, 80, 5),
    circle(165, 94, 5),
    path(
      "M94 38H146M107 29H133M109 87H131M24 70V40H54M186 40H216V70M24 120V150H54M186 150H216V120",
    ),
  ],
  "gol-palms": [
    path(
      "M47 125L40 95C37 84 42 77 50 80L58 91V63C58 53 71 53 71 63V55C71 44 84 44 84 55V58C84 47 97 47 97 58V68C97 57 110 57 110 68V100C110 121 94 137 72 137Z",
    ),
    path(
      "M193 125L200 95C203 84 198 77 190 80L182 91V63C182 53 169 53 169 63V55C169 44 156 44 156 55V58C156 47 143 47 143 58V68C143 57 130 57 130 68V100C130 121 146 137 168 137Z",
    ),
    path(
      "M71 63V79M84 58V79M97 68V84M58 91L78 99C89 102 85 116 75 112L62 108M169 63V79M156 58V79M143 68V84M182 91L162 99C151 102 155 116 165 112L178 108M40 151H200M60 157H180",
    ),
  ],
  "gol-rosette": [
    circle(120, 90, 55),
    path(
      "M120 23L138 57L172 38L153 72L187 90L153 108L172 142L138 123L120 157L102 123L68 142L87 108L53 90L87 72L68 38L102 57Z",
    ),
    path("M120 53L146 64L157 90L146 116L120 127L94 116L83 90L94 64Z"),
    circle(120, 90, 17),
    path("M35 32H56V53M184 32H205V53M35 127V148H56M184 148H205V127"),
  ],
  "gol-arch": [
    path(
      "M55 150V81C55 51 93 34 120 21C147 34 185 51 185 81V150ZM69 150V84C69 60 98 47 120 36C142 47 171 60 171 84V150Z",
    ),
    path(
      "M38 150H202M90 150V112C90 99 108 90 120 82C132 90 150 99 150 112V150M55 101H69M171 101H185",
    ),
    path("M120 51L132 64L120 77L108 64Z"),
  ],
  "gol-knot": [
    path(
      "M120 24L156 60L192 90L156 120L120 156L84 120L48 90L84 60ZM120 49L145 74L169 90L145 106L120 131L95 106L71 90L95 74Z",
    ),
    path(
      "M84 60L156 120M156 60L84 120M120 24V49M48 90H71M169 90H192M120 131V156",
    ),
    circle(38, 90, 3, true),
    circle(202, 90, 3, true),
  ],
};
export function motifSVG(
  motif: ThemeMotifId,
  color: string,
  opacity = 0.14,
): string {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#25634a";
  const shapes = motifGeometry[motif]
    .map((shape) => {
      const fill = shape.fill ? safeColor : "none";
      if (shape.kind === "path") return `<path d="${shape.d}" fill="${fill}"/>`;
      if (shape.kind === "circle")
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${fill}"/>`;
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.rx ?? 0}" fill="${fill}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><g stroke="${safeColor}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="${Math.max(0, Math.min(1, opacity))}">${shapes}</g></svg>`;
}
export const materialBackgrounds: Record<ThemeMaterial, string> = {
  plain: "none",
  paper: "repeating-linear-gradient(0deg,transparent 0 3px,#79644908 3px 4px)",
  felt: "radial-gradient(#ffffff10 .65px,transparent .8px)",
  wood: "repeating-linear-gradient(93deg,transparent 0 18px,#5039200a 19px 20px,transparent 21px 46px)",
  tile: "repeating-conic-gradient(from 45deg,#16808c08 0% 25%,transparent 0% 50%)",
  court:
    "linear-gradient(90deg,transparent 49.6%,#ffffff0c 49.6% 50.4%,transparent 50.4%)",
  carbon:
    "repeating-linear-gradient(135deg,#ffffff04 0 3px,transparent 3px 7px)",
  glass:
    "linear-gradient(118deg,#ffffff13,transparent 34%,#ffffff06 68%,transparent)",
  velvet: "radial-gradient(ellipse at 20% 0%,#ffffff0a,transparent 70%)",
  sand: "radial-gradient(#8b633614 .7px,transparent 1px)",
  circuit:
    "repeating-linear-gradient(0deg,transparent 0 35px,#7cddf509 35px 36px)",
  ink: "repeating-linear-gradient(0deg,transparent 0 6px,#19241b06 6px 7px)",
};
export const materialSize: Record<ThemeMaterial, string> = {
  plain: "auto",
  paper: "auto",
  felt: "4px 4px",
  wood: "auto",
  tile: "38px 38px",
  court: "100% 100%",
  carbon: "auto",
  glass: "100% 100%",
  velvet: "100% 100%",
  sand: "6px 6px",
  circuit: "auto",
  ink: "auto",
};
