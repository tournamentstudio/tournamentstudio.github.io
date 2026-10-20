import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, simulate } from "../engine";
import { layoutBracket } from "../components/Bracket";
import { podiumPlaces, Presentation } from "../presentation/Presentation";
import {
  bracketSVG,
  csvCell,
  escapeXML,
  printableHTML,
  tournamentCalendar,
  tournamentCSV,
} from "./index";

function fixture(
  count = 8,
  format: "single-elimination" | "double-elimination" = "single-elimination",
) {
  const t = createTournament(
    "جام <آفتاب>",
    Array.from({ length: count }, (_, i) =>
      createParticipant(
        i === 0 ? "شاهین & <script>" : "Team " + (i + 1),
        i + 1,
      ),
    ),
    format,
  );
  return generateStage(t, t.stages[0].id);
}
describe("visual layouts", () => {
  it.each([3, 7, 8, 13, 16, 24, 31, 32, 64, 127, 128, 256, 512])(
    "lays out %i entrants without overlaps or backward dependencies",
    (count) => {
      const t = fixture(count),
        layout = layoutBracket(t.matches);
      const nodes = new Map(layout.nodes.map((n) => [n.match.id, n]));
      for (const n of layout.nodes) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
        for (const s of n.match.slots)
          if (s.source)
            expect(
              nodes.get(s.source.matchId)!.x +
                nodes.get(s.source.matchId)!.width,
            ).toBeLessThan(n.x);
        for (const other of layout.nodes.filter(
          (o) => o.depth === n.depth && o.y > n.y,
        ))
          expect(n.y + n.height).toBeLessThan(other.y);
      }
    },
  );
  it("lays out winners, losers and reset paths using actual source references", () => {
    const t = fixture(8, "double-elimination"),
      layout = layoutBracket(t.matches),
      nodes = new Map(layout.nodes.map((n) => [n.match.id, n]));
    expect(t.matches.some((m) => m.bracket === "losers")).toBe(true);
    expect(t.matches.some((m) => m.bracket === "reset")).toBe(true);
    for (const node of layout.nodes)
      for (const slot of node.match.slots)
        if (slot.source)
          expect(nodes.get(slot.source.matchId)!.depth).toBeLessThan(
            node.depth,
          );
  });
  it("derives knockout medals from the final rather than league point totals", () => {
    const tournament = simulate(fixture(13)),
      places = podiumPlaces(tournament);
    const final = tournament.matches.find((m) => m.metadata.championship);
    expect(places[0]?.participantId).toBe(final?.result?.winnerIds[0]);
    expect(places).toHaveLength(2);
    expect(podiumPlaces(fixture(8))).toEqual([]);
  });
});
describe("public visual and tabular exports", () => {
  it("shows public live totals without passing concealed positions to the display", () => {
    const tournament = fixture();
    tournament.presentation.scenes = [
      { id: "live-scene", type: "current", title: "", text: "", duration: 15 },
    ];
    tournament.matches[0].status = "live";
    tournament.matches[0].liveScores = [5, 3];
    tournament.matches[0].private = {
      concealedPosition: "HIDDEN-HAND-POSITION",
    };
    tournament.matches[0].notes = "CONFIDENTIAL-NOTE";
    const html = renderToStaticMarkup(
      createElement(Presentation, { tournament, onExit: () => undefined }),
    );
    expect(html).toContain("<strong>5</strong>");
    expect(html).toContain("<strong>3</strong>");
    expect(html).not.toContain("HIDDEN-HAND-POSITION");
    expect(html).not.toContain("CONFIDENTIAL-NOTE");
  });
  it("escapes text and excludes referee secrets from all public exports", () => {
    const tournament = fixture();
    tournament.matches[0].private = {
      concealedPosition: "SECRET-POSITION",
      notes: "SECRET-NOTE",
    };
    tournament.matches[0].notes = "ORGANIZER-NOTE";
    tournament.matches[0].referee = "PRIVATE-REFEREE";
    const svg = bracketSVG(tournament),
      html = printableHTML(tournament),
      csv = tournamentCSV(tournament);
    for (const output of [svg, html, csv]) {
      expect(output).not.toContain("SECRET-POSITION");
      expect(output).not.toContain("SECRET-NOTE");
      expect(output).not.toContain("ORGANIZER-NOTE");
      expect(output).not.toContain("PRIVATE-REFEREE");
    }
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(html).toContain("جام &lt;آفتاب&gt;");
    expect(escapeXML('"<x>&')).toBe("&quot;&lt;x&gt;&amp;");
  });
  it("neutralizes CSV formulas and preserves commas, quotes and Unicode", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("  +1")).toBe('"\'  +1"');
    expect(csvCell("گل, پوچ")).toBe('"گل, پوچ"');
  });
  it("exports a calendar with UTC times and safe Unicode line folding", () => {
    const tournament = fixture();
    tournament.matches[0].scheduledAt = "2026-10-20T19:00:00.000Z";
    tournament.participants[0].name = "الف".repeat(100);
    const ics = tournamentCalendar(tournament, "fa");
    expect(ics).toContain("DTSTART:20261020T190000Z");
    expect(ics).toContain("END:VCALENDAR");
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(74);
    expect(ics).not.toContain("\uFFFD");
  });
  it("does not permit calendar field injection through a match identifier", () => {
    const tournament = fixture();
    tournament.matches[0].id = "bad\r\nSUMMARY:Injected";
    tournament.matches[0].scheduledAt = "2026-10-20T19:00:00.000Z";
    const ics = tournamentCalendar(tournament);
    expect(ics).toContain("UID:bad%0D%0ASUMMARY%3AInjected@");
    expect(ics).not.toContain("\r\nSUMMARY:Injected");
  });
});
