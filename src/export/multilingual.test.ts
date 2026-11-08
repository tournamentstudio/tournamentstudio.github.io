import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { localeCodes, localeDirection, localeTag } from "../i18n/locales";
import { loadLanguage, translate } from "../i18n/translate";
import { Presentation, sceneLabel } from "../presentation/Presentation";
import { bracketSVG, printableHTML, tournamentCSV } from "./index";
import { slideViewerHTML } from "./slides";
import { exportLabel, visualText } from "./visuals";

function fixture() {
  const tournament = createTournament("Coppa São João / جام آفتاب", [
    createParticipant("Águilas / شاهین", 1),
    createParticipant("東京 / Тигри", 2),
  ]);
  tournament.presentation.scenes = [
    { id: "scoreboard", type: "current", title: "", text: "", duration: 15 },
  ];
  const generated = generateStage(tournament, tournament.stages[0].id);
  generated.matches[0].status = "live";
  generated.matches[0].liveScores = [12, 7];
  generated.matches[0].label = "Finale / فینال";
  return generated;
}

describe("multilingual public output", () => {
  it.each([
    [
      "it",
      [
        "Turno libero",
        "Partite",
        "Pareggio",
        "Girone all'italiana",
        "Fascia",
        "Sistema svizzero",
        "Vittorie",
        "Sconfitte",
        "Punti segnati",
        "Punti subiti",
        "Tabelloni",
        "Presenta",
        "Fase principale",
        "Prova una partita",
        "Coppa tra amici",
        "Gol Ya Pooch",
      ],
    ],
    [
      "es",
      [
        "Pase libre",
        "Partidos",
        "Empate",
        "Todos contra todos",
        "Bombo",
        "Sistema suizo",
        "Victorias",
        "Derrotas",
        "Puntos anotados",
        "Puntos recibidos",
        "Cuadros",
        "Presentar",
        "Fase principal",
        "Probar un partido",
        "Copa de amigos",
        "Gol Ya Pooch",
      ],
    ],
  ] as const)(
    "keeps sports terminology precise in %s",
    async (locale, expected) => {
      await loadLanguage(locale);
      const keys = [
        "BYE",
        "Matches",
        "Draw",
        "Round robin",
        "Pot",
        "Swiss",
        "Won",
        "Lost",
        "Points scored",
        "Points conceded",
        "Brackets",
        "Present",
        "Main stage",
        "Try a match",
        "Friends' cup",
        "Gol Ya Pooch",
      ];
      expect(keys.map((key) => translate(locale, key))).toEqual(expected);
    },
  );
  it.each(localeCodes)(
    "uses %s in print, slides and presentation without editing stored text",
    async (locale) => {
      await loadLanguage(locale);
      const tournament = fixture();
      const before = JSON.stringify(tournament);
      const html = printableHTML(tournament, locale);
      expect(html).toContain(
        `lang="${locale}" dir="${localeDirection(locale)}"`,
      );
      expect(html).toContain(
        translate(locale, "Match schedule", "برنامه مسابقات"),
      );
      expect(html).toContain(tournament.title);
      expect(html).toContain("Finale / فینال");
      const slides = slideViewerHTML(tournament.title, [], locale);
      expect(slides).toContain(
        `lang="${locale}" dir="${localeDirection(locale)}"`,
      );
      const presentation = renderToStaticMarkup(
        createElement(Presentation, {
          tournament,
          locale,
          onExit: () => undefined,
        }),
      );
      expect(presentation).toContain(`dir="${localeDirection(locale)}"`);
      expect(presentation).toContain(tournament.participants[0].name);
      expect(presentation).toContain(tournament.participants[1].name);
      expect(presentation).toContain((12).toLocaleString(localeTag(locale)));
      expect(JSON.stringify(tournament)).toBe(before);
    },
  );

  it.each(["es", "it", "ar", "ja", "hi"] as const)(
    "uses the %s catalog for shared export and scene labels",
    async (locale) => {
      await loadLanguage(locale);
      const label = translate(locale, "Standings", "رده‌بندی");
      expect(label).not.toBe("Standings");
      expect(exportLabel(locale, "Standings", "رده‌بندی")).toBe(label);
      expect(sceneLabel("standings", locale)).toBe(label);
    },
  );

  it("mirrors Arabic brackets while isolating numeric scores and authored scripts", () => {
    const tournament = fixture();
    const svg = bracketSVG(tournament, undefined, "ar");
    expect(svg).toContain('lang="ar"');
    expect(svg).toMatch(
      /class="bracket-score"[^>]+direction="ltr"[^>]+unicode-bidi="isolate"/,
    );
    expect(svg).toContain(
      `aria-label="${(12).toLocaleString(localeTag("ar"))}"`,
    );
    expect(visualText("...", 200, 50, 18, 300, "ar", "#000000")).toContain(
      'direction="rtl"',
    );
    expect(visualText("東京", 200, 50, 18, 300, "ar", "#000000")).toContain(
      'direction="ltr"',
    );
  });

  it("preserves the portable CSV header contract in added languages", () => {
    const tournament = fixture();
    const english = tournamentCSV(tournament, "participants", "en");
    for (const locale of ["es", "it", "ar", "zh"] as const)
      expect(tournamentCSV(tournament, "participants", locale)).toBe(english);
    expect(tournamentCSV(tournament, "participants", "fa")).toContain(
      '"نام","Seed"',
    );
  });
});
