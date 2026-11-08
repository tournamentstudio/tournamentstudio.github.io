import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import { LocaleContext } from "../i18n";
import { localeCodes, localeDirection } from "../i18n/locales";
import { loadLanguage, translate } from "../i18n/translate";
import { LandingDemo } from "../app/LandingDemo";
import { Bracket, matchNames } from "./Bracket";
import { StandingsTable } from "./StandingsTable";

describe("multilingual competition views", () => {
  beforeAll(() => Promise.all(localeCodes.map(loadLanguage)));
  const entrants = ["Azzurri & آبی", "Rojo", "Cedar"].map((name, index) =>
    createParticipant(name, index + 1),
  );

  it("updates bracket text and direction without changing participant names", () => {
    const doc = createTournament("Club cup", entrants);
    const tournament = generateStage(doc, doc.stages[0].id);
    const before = JSON.stringify(tournament);
    for (const locale of localeCodes) {
      const markup = renderToStaticMarkup(
        createElement(Bracket, { tournament, locale }),
      );
      expect(markup).toContain(`data-direction="${localeDirection(locale)}"`);
      expect(markup).toContain("Azzurri &amp; آبی");
      expect(markup).toContain("Cedar");
      const final = tournament.matches.find((match) =>
        match.slots.some((slot) => slot.source),
      )!;
      expect(
        matchNames(tournament, final, locale).some(
          (name) => name === translate(locale, "Winner", "برنده"),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(tournament)).toBe(before);
  });

  it("keeps the standings, ranking summary and stored document in agreement", () => {
    const doc = createTournament(
      "Club cup",
      entrants,
      "round-robin",
      "petanque",
    );
    doc.rules.tieBreakers = ["wins", "differential", "scored"];
    const tournament = generateStage(doc, doc.stages[0].id);
    const before = JSON.stringify(tournament);
    for (const locale of localeCodes) {
      const markup = renderToStaticMarkup(
        createElement(StandingsTable, {
          tournament,
          locale,
          stageId: tournament.stages[0].id,
        }),
      );
      expect(markup).toContain(
        `class="standings-frame" dir="${localeDirection(locale)}"`,
      );
      expect(markup).toContain(
        `class="ranking-summary" dir="${localeDirection(locale)}"`,
      );
      expect(markup).toContain("Azzurri &amp; آبی");
      expect(markup.match(/data-rank="1"/g)).toHaveLength(3);
      expect(markup).not.toContain("undefined");
    }
    expect(JSON.stringify(tournament)).toBe(before);
  });

  it("does not lose the landing sample team names outside English and Persian", () => {
    for (const locale of localeCodes) {
      const markup = renderToStaticMarkup(
        createElement(LocaleContext.Provider, {
          value: locale,
          children: createElement(LandingDemo),
        }),
      );
      expect(
        markup.match(/class="landing-demo-name" dir="auto">[^<]+</g),
      ).toHaveLength(6);
      expect(markup).not.toContain("undefined");
    }
  });
});
