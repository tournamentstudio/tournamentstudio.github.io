import { GameIcon, GolActionIcon } from "./GameIcon";
import { getGameIconId, type GameIconId } from "./game-icons";
import "./game-scenes.css";

function Court({ sport }: { sport: GameIconId }) {
  const horizontal = sport === "tennis" || sport === "badminton";
  return (
    <g className="game-scene-ground">
      <rect
        x="30"
        y="32"
        width="300"
        height="176"
        rx={sport === "futsal" ? 34 : 2}
      />
      <path d="M180 32V208" />
      {(sport === "football" || sport === "futsal") && (
        <>
          <circle cx="180" cy="120" r="29" />
          {sport === "football" ? (
            <path d="M30 70H83V170H30M330 70H277V170H330M30 93H51V147H30M330 93H309V147H330" />
          ) : (
            <path d="M30 65C112 65 112 175 30 175M330 65C248 65 248 175 330 175" />
          )}
        </>
      )}
      {sport === "basketball" && (
        <>
          <circle cx="180" cy="120" r="25" />
          <path d="M30 78H100V162H30M330 78H260V162H330M30 46C170 46 170 194 30 194M330 46C190 46 190 194 330 194" />
        </>
      )}
      {sport === "volleyball" && (
        <path d="M130 32V208M230 32V208M176 22V218M184 22V218" />
      )}
      {horizontal && (
        <path
          d={
            sport === "tennis"
              ? "M30 53H330M30 187H330M103 53V187M257 53V187M103 120H257M180 22V218"
              : "M30 49H330M30 191H330M60 32V208M300 32V208M140 32V208M220 32V208M60 120H140M220 120H300"
          }
        />
      )}
    </g>
  );
}

function Scene({ sport }: { sport: GameIconId }) {
  if (sport === "gol-ya-pooch") {
    return (
      <>
        <g className="game-scene-ground">
          <path d="M79 185V88C79 55 129 30 180 12C231 30 281 55 281 88V185M91 185V91C91 64 133 43 180 25C227 43 269 64 269 91V185" />
          <path d="M40 64L53 77L40 90L27 77ZM320 64L333 77L320 90L307 77ZM40 103L53 116L40 129L27 116ZM320 103L333 116L320 129L307 116Z" />
        </g>
        <path className="game-scene-solid" d="M58 180H302L325 207H35Z" />
        <path d="M35 207H325M63 216H297" />
        <g transform="translate(120 53)">
          <GameIcon sport={sport} size={120} />
        </g>
        <g transform="translate(58 140)">
          <GolActionIcon action="bell" size={52} />
        </g>
        <g transform="translate(250 140)">
          <GolActionIcon action="cards" size={52} />
        </g>
        <circle cx="180" cy="188" r="4" fill="currentColor" />
      </>
    );
  }
  if (
    [
      "football",
      "futsal",
      "basketball",
      "volleyball",
      "tennis",
      "badminton",
    ].includes(sport)
  ) {
    return (
      <>
        <Court sport={sport} />
        <rect
          className="game-scene-paper"
          x="215"
          y="105"
          width="112"
          height="112"
          rx="56"
        />
        <g transform="translate(230 120)">
          <GameIcon sport={sport} size={82} />
        </g>
      </>
    );
  }
  if (sport === "table-tennis") {
    return (
      <>
        <g className="game-scene-ground">
          <path d="M68 36H292L332 181H28ZM48 109H312M180 36V181M48 96V121M312 96V121M54 181L43 215M306 181L317 215" />
          <path d="M48 96H312" strokeDasharray="4 4" />
        </g>
        <g transform="translate(132 116)">
          <GameIcon sport={sport} size={100} />
        </g>
      </>
    );
  }
  if (sport === "chess" || sport === "board-games") {
    return (
      <>
        <g className="game-scene-ground">
          <rect
            x="47"
            y="25"
            width="190"
            height="190"
            rx={sport === "chess" ? 1 : 16}
          />
          {sport === "chess" ? (
            Array.from({ length: 64 }, (_, i) => (
              <rect
                key={i}
                x={51 + (i % 8) * 23}
                y={29 + Math.floor(i / 8) * 23}
                width="23"
                height="23"
                fill={(i + Math.floor(i / 8)) % 2 ? "currentColor" : "none"}
                fillOpacity=".2"
              />
            ))
          ) : (
            <>
              <path d="M70 49H214V190H70ZM99 49V190M185 49V190M70 78H214M70 161H214" />
              <circle cx="84" cy="63" r="6" />
              <circle cx="200" cy="176" r="6" />
            </>
          )}
        </g>
        <rect
          className="game-scene-paper"
          x="194"
          y="93"
          width="117"
          height="127"
          rx="2"
        />
        <g transform="translate(199 104)">
          <GameIcon sport={sport} size={107} />
        </g>
      </>
    );
  }
  if (sport === "esports") {
    return (
      <>
        <g className="game-scene-ground">
          <path d="M48 43H312V183H48ZM145 183L133 208H227L215 183M66 61H294V165H66M93 25H139M221 223H267" />
          <path d="M24 101H39M321 131H336M32 88V114M328 118V144" />
        </g>
        <g transform="translate(118 58)">
          <GameIcon sport={sport} size={124} />
        </g>
      </>
    );
  }
  if (sport === "racing") {
    return (
      <>
        <g className="game-scene-ground">
          <path d="M64 191C1 164 51 39 116 43C169 46 159 103 203 100C242 98 265 23 307 49C351 76 299 195 236 198C177 200 150 157 111 171C88 179 84 200 64 191Z" />
          <path d="M77 176C36 151 65 62 113 62C148 62 147 123 204 120C256 117 274 50 297 65C326 84 283 174 236 178C184 181 149 136 105 152C89 158 91 178 77 176Z" />
          <path d="M51 137L80 145M49 148L79 155" />
        </g>
        <g transform="translate(129 100)">
          <GameIcon sport={sport} size={96} />
        </g>
      </>
    );
  }
  if (sport === "quiz") {
    return (
      <>
        <g className="game-scene-ground">
          <path d="M47 44H160M47 63H145M47 82H117M223 163H310M223 182H310M223 201H278" />
          <circle cx="284" cy="55" r="21" />
          <path d="M284 34V40M284 70V76M263 55H269M299 55H305M284 43V55L292 61" />
        </g>
        <g transform="translate(103 51)">
          <GameIcon sport={sport} size={154} />
        </g>
      </>
    );
  }
  return (
    <>
      <g className="game-scene-ground">
        <path d="M113 38C36 91 50 174 117 211M247 38C324 91 310 174 243 211M88 65L66 51M73 98L47 92M73 134L47 142M89 169L66 190M272 65L294 51M287 98L313 92M287 134L313 142M271 169L294 190" />
      </g>
      <g transform="translate(113 49)">
        <GameIcon sport="generic" size={134} />
      </g>
      <path d="M146 206H214M160 218H200" />
    </>
  );
}

// Scene geometry is decorative and never receives a score or private match state.
export function GameScene({
  sport,
  className = "",
}: {
  sport: string;
  className?: string;
}) {
  const id = getGameIconId(sport);
  return (
    <svg
      className={`game-scene ${className}`}
      data-game-scene={id}
      viewBox="0 0 360 240"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <Scene sport={id} />
    </svg>
  );
}
