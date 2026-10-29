import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, simulate } from "../engine";
import { podiumPlaces, sceneTypes } from "../presentation/Presentation";
import {
  championPosterSVG,
  scoreboardSVG,
  standingsVisualPages,
  tableVisualPages,
  visualText,
  visualTextLines,
  visualScoreText,
  wrapVisualText,
} from "./visuals";
import {
  presentationSlideFiles,
  slideArchive,
  slideViewerHTML,
} from "./slides";
import { embedSVGFonts, standaloneTournamentHTML } from "./files";

function fixture(count = 8) {
  const t = createTournament(
    "جام <آفتاب>",
    Array.from({ length: count }, (_, i) =>
      createParticipant(`تیم ${i + 1} & Alpha`, i + 1),
    ),
    "single-elimination",
  );
  return generateStage(t, t.stages[0].id);
}

describe("public graphics", () => {
  it("fits large numeric scores on one line without losing digits", () => {
    for (const value of ["123,456,789", "۱۲۳٬۴۵۶٬۷۸۹", "-123456.789"]) {
      const svg = visualScoreText(value, 1405, 200, 72, 180, "#000000");
      expect(svg.match(/<tspan/g)).toHaveLength(1);
      expect(svg).toContain(`>${value}</tspan>`);
      expect(svg).toContain('direction="ltr"');
      const size = Number(svg.match(/font-size="([\d.]+)"/)?.[1]);
      expect(size).toBeLessThan(72);
      expect(visualTextLines(value, size, 180)).toEqual([value]);
    }
  });
  it("wraps wide names by measured width without stretching short text", () => {
    const context = {
      font: "",
      measureText: (text: string) => ({
        width: Array.from(text).reduce(
          (width, character) => width + (character === "W" ? 20 : 5),
          0,
        ),
      }),
    };
    vi.stubGlobal("document", {
      fonts: {
        check: () => true,
        *[Symbol.iterator]() {
          yield { family: "Vazirmatn Variable", status: "loaded" };
        },
      },
      createElement: () => ({ getContext: () => context }),
    });
    try {
      const wide = "W".repeat(13);
      const lines = visualTextLines(wide, 10, 50);
      expect(lines.join("")).toBe(wide);
      expect(lines.every((line) => context.measureText(line).width < 50)).toBe(
        true,
      );
      expect(visualTextLines("iiiiiiii", 10, 50)).toEqual(["iiiiiiii"]);
      expect(context.font).toBe('900 10px "Vazirmatn Variable"');
      const svg = visualText("iii", 100, 100, 10, 50, "en", "#000000");
      expect(svg).not.toContain("textLength");
      expect(svg).toContain('<tspan x="100" dy="0">iii</tspan>');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("preserves whole graphemes in both measured and column wrapping", () => {
    const combined = `e\u0301`;
    const joined = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
    for (const glyph of [combined, joined, "ن\u0651"]) {
      const value = glyph.repeat(20);
      const columns = wrapVisualText(value, 3);
      const measured = visualTextLines(value, 20, 100);
      for (const lines of [columns, measured]) {
        expect(lines.join("")).toBe(value);
        expect(lines.every((line) => line.replaceAll(glyph, "") === "")).toBe(
          true,
        );
      }
    }
    const tiny = visualText(joined, 50, 50, 20, 10, "en", "#000000");
    expect(tiny).toContain(joined);
    expect(tiny).toMatch(/<tspan[^>]*font-size="[\d.]+"/);
  });
  it("paginates wide table entries using the same wrapping as rendered rows", () => {
    const tournament = fixture();
    const value = "W".repeat(1000);
    const lines = visualTextLines(value, 26, 1400);
    const pages = tableVisualPages(tournament, "Wide entries", [value], "en");
    expect(pages).toHaveLength(Math.ceil(lines.length / 10));
    const rendered = pages.flatMap((page) =>
      Array.from(
        page.svg.matchAll(/<tspan[^>]*>(W+)<\/tspan>/g),
        (match) => match[1],
      ),
    );
    expect(rendered).toEqual(lines);
    expect(rendered.join("")).toBe(value);
  });
  it("exports live public scores without referee secrets or organizer metadata", () => {
    const t = fixture();
    t.matches[0].status = "live";
    t.matches[0].liveScores = [7, 4];
    t.matches[0].private = { concealedPosition: "HIDDEN-POSITION" };
    t.matches[0].notes = "PRIVATE-NOTE";
    t.participants[0].metadata.privateNote = "PRIVATE-PARTICIPANT";
    const before = JSON.stringify(t);
    const svg = scoreboardSVG(t, t.matches[0].id, "fa");
    expect(svg).toContain(">۷</tspan>");
    expect(svg).toContain("جام &lt;آفتاب&gt;");
    for (const secret of [
      "HIDDEN-POSITION",
      "PRIVATE-NOTE",
      "PRIVATE-PARTICIPANT",
    ])
      expect(svg).not.toContain(secret);
    expect(svg).toContain('direction="rtl"');
    expect(JSON.stringify(t)).toBe(before);
  });
  it("honors score hiding and rejects an unknown match", () => {
    const t = fixture();
    t.presentation.showScores = false;
    t.matches[0].status = "live";
    t.matches[0].liveScores = [9876, 4567];
    expect(scoreboardSVG(t, t.matches[0].id)).not.toContain("9,876");
    expect(() => scoreboardSVG(t, "missing")).toThrow("Choose a match");
  });
  it("exports all entrants in a multi-entrant match", () => {
    const t = createTournament(
      "Race",
      Array.from({ length: 16 }, (_, i) =>
        createParticipant(`Driver ${i + 1}`, i + 1),
      ),
      "free-for-all",
    );
    t.stages[0].config.capacity = 16;
    const generated = generateStage(t, t.stages[0].id);
    const svg = scoreboardSVG(generated, generated.matches[0].id);
    for (const participant of generated.participants)
      expect(svg).toContain(participant.name);
    expect(svg).toContain('height="2060"');
  });
  it("requires a decided champion and uses the actual final winner", () => {
    const t = fixture(13);
    expect(() => championPosterSVG(t)).toThrow("Complete the deciding stage");
    const completed = simulate(t),
      champion = podiumPlaces(completed)[0];
    const svg = championPosterSVG(completed);
    expect(svg).toContain(
      completed.participants
        .find((p) => p.id === champion.participantId)!
        .name.replace("&", "&amp;"),
    );
    expect(svg).toContain("CHAMPION");
  });
  it("retains long mixed-script names without broken Unicode or fixed-height clipping", () => {
    const t = fixture();
    t.participants[0].name = "شاهین الف ".repeat(20);
    const svg = scoreboardSVG(t, t.matches[0].id, "fa");
    expect(svg).not.toContain("\uFFFD");
    const firstCardHeight = Number(
      svg.match(/<rect x="80" y="[\d.]+" width="1440" height="([\d.]+)"/)?.[1],
    );
    expect(firstCardHeight).toBeGreaterThanOrEqual(
      55 +
        (wrapVisualText(t.participants[0].name, Math.floor(1100 / (52 * 0.62)))
          .length -
          1) *
          78 +
        12,
    );
    const symbol = String.fromCodePoint(0x1f989);
    const parts = wrapVisualText(symbol.repeat(61), 20);
    expect(parts.join("")).toBe(symbol.repeat(61));
    expect(parts.every((part) => Array.from(part).length <= 20)).toBe(true);
  });
  it("paginates all 512 entries without dropping the last entry", () => {
    const t = fixture(512);
    const pages = tableVisualPages(
      t,
      "Participants",
      t.participants.map((p) => p.name),
      "en",
    );
    expect(pages).toHaveLength(52);
    expect(pages.at(-1)!.svg).toContain("512");
  });
  it("keeps independent group standings in distinct pages", () => {
    const t = createTournament(
      "Groups",
      Array.from({ length: 8 }, (_, i) =>
        createParticipant(`Team ${i}`, i + 1),
      ),
      "groups",
    );
    t.stages[0].config.groupCount = 2;
    const generated = generateStage(t, t.stages[0].id);
    const pages = standingsVisualPages(generated, t.stages[0].id);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).not.toBe(pages[1].title);
  });
});

describe("portable presentation files", () => {
  it("exports every supported scene type and all paginated entries", async () => {
    const t = simulate(fixture(13));
    t.presentation.scenes = sceneTypes.map((type, i) => ({
      id: String(i),
      type: type.id,
      title: "",
      text: "",
      duration: 10,
    }));
    const pages = await presentationSlideFiles(t);
    for (const scene of t.presentation.scenes)
      expect(pages.some((page) => page.sceneId === scene.id)).toBe(true);
    expect(pages.every((page) => page.svg.startsWith("<svg"))).toBe(true);
    const participantsId = t.presentation.scenes.find(
      (scene) => scene.type === "participants",
    )!.id;
    expect(
      pages.filter((page) => page.sceneId === participantsId),
    ).toHaveLength(2);
  });
  it("exports only selected scenes and rejects an empty selection", async () => {
    const t = fixture();
    const id = t.presentation.scenes[0].id;
    expect(
      (await presentationSlideFiles(t, "en", [id])).every(
        (page) => page.sceneId === id,
      ),
    ).toBe(true);
    await expect(presentationSlideFiles(t, "en", [])).rejects.toThrow(
      "Select at least one",
    );
  });
  it("creates a self-contained file set with safe paths and no private source document", async () => {
    const t = fixture();
    t.title = "<script>alert('x')</script>";
    t.matches[0].private = { concealedPosition: "HIDDEN-POSITION" };
    t.presentation.scenes = [
      {
        id: "../../escape",
        type: "current",
        title: "<img src=x onerror=alert(1)>",
        text: "",
        duration: 10,
      },
    ];
    const pages = await presentationSlideFiles(t);
    const archive = unzipSync(slideArchive(t.title, pages));
    expect(Object.keys(archive)).toEqual([
      "slide-001.svg",
      "index.html",
      "manifest.json",
    ]);
    const html = strFromU8(archive["index.html"]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(
      Object.values(archive)
        .map((bytes) => strFromU8(bytes))
        .join(""),
    ).not.toContain("HIDDEN-POSITION");
    expect(JSON.parse(strFromU8(archive["manifest.json"])).snapshot).toBe(true);
  });
  it("labels static countdowns instead of claiming a running timer", async () => {
    const t = fixture();
    t.presentation.scenes = [
      {
        id: "clock",
        type: "countdown",
        title: "Clock",
        text: "120",
        duration: 10,
      },
    ];
    expect((await presentationSlideFiles(t))[0].svg).toContain(
      "Static countdown snapshot",
    );
  });
  it("shows an empty bracket state rather than omitting a selected scene", async () => {
    const t = createTournament(
      "Empty",
      [createParticipant("A", 1), createParticipant("B", 2)],
      "single-elimination",
    );
    t.presentation.scenes = [
      { id: "bracket", type: "bracket", title: "", text: "", duration: 10 },
    ];
    expect((await presentationSlideFiles(t))[0].svg).toContain(
      "Generate matches",
    );
  });
  it("enforces archive count limits", () => {
    expect(() => slideArchive("Empty", [])).toThrow("between 1 and 512");
    expect(() =>
      slideArchive(
        "Many",
        Array.from({ length: 513 }, () => ({
          title: "A",
          svg: "<svg/>",
          sceneId: "a",
          duration: 10,
        })),
      ),
    ).toThrow("between 1 and 512");
  });
  it("embeds font styles in SVGs without an existing style element", () => {
    expect(
      embedSVGFonts(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>',
        "@font-face{font-family:Example}",
      ),
    ).toContain("<style>@font-face{font-family:Example}");
  });
  it("downloads printable HTML with local embedded fonts and private data removed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    );
    const t = fixture();
    t.matches[0].private = { concealedPosition: "HIDDEN-POSITION" };
    const html = await standaloneTournamentHTML(t, "fa");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("data:font/woff2;base64,AQID");
    expect(html).not.toContain("HIDDEN-POSITION");
    expect(html).toContain("default-src 'none'");
    vi.unstubAllGlobals();
  });
  it("escapes slide viewer titles and uses no executable handlers", () => {
    const html = slideViewerHTML(
      "Title",
      [{ title: '" onerror="x', svg: "", sceneId: "a", duration: 10 }],
      "fa",
    );
    expect(html).toContain("&quot; onerror=&quot;x");
    expect(html).not.toContain('alt="" onerror=');
    expect(html).not.toContain("<script");
  });
});
