import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type FormatId,
  type Locale,
  type Tournament,
} from "../domain/types";
import { generateStage, recordResult } from "../engine";
import { StandingsTable } from "./StandingsTable";

function cup(format: FormatId = "round-robin") {
  const doc = createTournament(
    "Club afternoon",
    ["A", "B", "C", "D"].map((name, i) => ({
      ...createParticipant(name, i + 1),
      id: name,
    })),
    format,
    "petanque",
  );
  doc.rules.tieBreakers = ["wins", "differential", "scored"];
  return generateStage(doc, doc.stages[0].id);
}

function render(doc: Tournament, locale: Locale = "en") {
  return renderToStaticMarkup(
    createElement(StandingsTable, {
      tournament: doc,
      stageId: doc.stages[0].id,
      locale,
    }),
  );
}

function headers(markup: string) {
  return [...markup.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(
    (match) => match[1],
  );
}

describe("Pétanque standings presentation", () => {
  it("shows ranking evidence without an unrelated points or draw column", () => {
    const doc = cup();
    const markup = render(doc);
    expect(headers(markup)).toEqual([
      "Rank",
      "Participant",
      "Played",
      "Won",
      "Lost",
      "Point difference",
      "Points scored",
      "Points conceded",
    ]);
    expect(markup).toContain(
      "<li>Wins</li><li>Point difference</li><li>Points scored</li>",
    );
    expect(markup.indexOf("ranking-summary")).toBeLessThan(
      markup.indexOf("standings-scroll"),
    );
    expect(markup.match(/data-rank="1"/g)).toHaveLength(4);
    expect(markup.match(/title="Shared rank"/g)).toHaveLength(4);
  });

  it("keeps a historical draw visible after draws are disabled", () => {
    let doc = cup();
    doc.rules.allowDraws = true;
    doc = recordResult(doc, doc.matches[0].id, {
      scores: [8, 8],
      winnerIds: [],
      outcome: "draw",
      recordedAt: doc.updatedAt,
    });
    doc.rules.allowDraws = false;
    expect(headers(render(doc))).toContain("Drawn");
    expect(doc.matches[0].result?.outcome).toBe("draw");
  });

  it("lets grouped views show one shared summary without hiding table evidence", () => {
    const doc = cup();
    const markup = renderToStaticMarkup(
      createElement(StandingsTable, {
        tournament: doc,
        stageId: doc.stages[0].id,
        hideRankingSummary: true,
      }),
    );
    expect(markup).not.toContain("ranking-summary");
    expect(headers(markup)).toContain("Point difference");
    expect(markup).toContain("Shared ranks are kept.");
  });

  it("uses edited ranking criteria rather than repeating preset defaults", () => {
    const doc = cup();
    doc.rules.tieBreakers = ["scored", "wins", "points"];
    const markup = render(doc);
    expect(headers(markup)).toContain("Standings points");
    expect(markup).toContain(
      "<li>Points scored</li><li>Wins</li><li>Standings points</li>",
    );
    expect(markup).not.toContain("Point difference is total");
  });

  it("preserves unrelated sports columns", () => {
    const doc = cup();
    doc.sport = "football";
    expect(headers(render(doc))).toEqual([
      "Rank",
      "Participant",
      "Played",
      "Won",
      "Drawn",
      "Lost",
      "For",
      "Against",
      "Diff.",
      "Points",
    ]);
    expect(render(doc)).not.toContain("ranking-summary");
  });

  it("emphasizes wins when generic round robin uses wins first", () => {
    let doc = cup();
    doc.sport = "generic";
    doc = recordResult(doc, doc.matches[0].id, {
      scores: [13, 5],
      winnerIds: [],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
    const markup = render(doc);
    expect(markup).toContain('<strong><bdi dir="ltr">1</bdi></strong>');
    expect(markup).not.toContain('<strong><bdi dir="ltr">3</bdi></strong>');
  });

  it("keeps cumulative-time evidence for a customized Pétanque competition", () => {
    const doc = cup("time-trial");
    doc.stages[0].config.timeRanking = "cumulative";
    const markup = render(doc);
    expect(headers(markup)).toContain("Recorded time");
    expect(headers(markup)).toContain("Points");
    expect(markup).toContain("Lowest completed total time");
  });

  it.each(["single-elimination", "gsl", "time-trial"] as const)(
    "does not misstate the %s placement policy",
    (format) => {
      const markup = render(cup(format));
      expect(markup).not.toContain("ranking-summary");
      expect(markup).not.toContain("Equal on every ranking criterion.");
      expect(markup).toContain("Shared ranks are kept.");
    },
  );

  it("labels and isolates negative values in the Persian table", () => {
    let doc = cup();
    doc = recordResult(doc, doc.matches[0].id, {
      scores: [13, 5],
      winnerIds: [],
      outcome: "played",
      recordedAt: doc.updatedAt,
    });
    const markup = render(doc, "fa");
    expect(headers(markup)).toEqual([
      "رتبه",
      "شرکت‌کننده",
      "بازی",
      "برد",
      "باخت",
      "تفاضل امتیاز",
      "امتیاز کسب‌شده",
      "امتیاز واگذارشده",
    ]);
    expect(markup).toContain('class="ranking-summary" dir="rtl"');
    expect(markup).toContain(
      `<bdi dir="ltr">${(-8).toLocaleString("fa-IR")}</bdi>`,
    );
  });
});
