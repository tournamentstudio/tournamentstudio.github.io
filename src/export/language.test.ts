import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage } from "../engine";
import {
  bracketSVG,
  exportBracketSVG,
  printableHTML,
  printTournament,
  tournamentCalendar,
  tournamentCSV,
} from "./index";
import { presentationSlideFiles } from "./slides";

function fixture() {
  const tournament = createTournament("جام آفتاب / Autumn Cup", [
    createParticipant("شاهین‌های تهران / Eagles ۱۲", 1),
    createParticipant("North Stars / ستاره‌های شمال 42", 2),
  ]);
  return generateStage(tournament, tournament.stages[0].id);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bilingual exports", () => {
  it("isolates mixed-script names and numeric scores in either interface language", () => {
    const tournament = fixture();
    tournament.matches[0].status = "live";
    tournament.matches[0].liveScores = [12, 7];
    const before = JSON.stringify(tournament);
    for (const locale of ["en", "fa"] as const) {
      const svg = bracketSVG(tournament, undefined, locale);
      expect(svg).toContain('direction="ltr"');
      expect(svg).toMatch(
        /class="bracket-team"[^>]+direction="rtl"[^>]+unicode-bidi="isolate"/,
      );
      expect(svg).toMatch(
        /class="bracket-team"[^>]+direction="ltr"[^>]+unicode-bidi="isolate"/,
      );
      expect(svg).toMatch(
        /class="bracket-score"[^>]+direction="ltr"[^>]+text-anchor="middle"/,
      );
      expect(svg).toContain(`aria-label="${(12).toLocaleString(locale)}"`);
      expect(svg).toContain(`aria-label="${tournament.participants[0].name}"`);
      expect(svg).toContain('clip-path="url(#bracket-0-0-names)"');
      expect(svg).not.toContain("textLength=");
    }
    expect(JSON.stringify(tournament)).toBe(before);
  });

  it("increases exported card and row dimensions with the largest text setting", () => {
    const tournament = fixture();
    tournament.theme.fontScale = 3;
    const svg = bracketSVG(tournament, undefined, "fa");
    expect(svg).toContain('class="match-card" width="708" height="282"');
    expect(svg).toMatch(/class="bracket-team"[^>]+y="162"[^>]+font-size="36"/);
    expect(svg).toMatch(/class="bracket-score"[^>]+y="252"[^>]+font-size="42"/);
  });

  it("preserves every digit in large and decimal scores", () => {
    const tournament = fixture();
    tournament.matches[0].status = "live";
    tournament.matches[0].liveScores = [12345678.25, 98765.125];
    for (const locale of ["en", "fa"] as const) {
      const svg = bracketSVG(tournament, undefined, locale);
      const scores = [
        ...svg.matchAll(/<text class="bracket-score"([^>]*)>([^<]*)<\/text>/g),
      ];
      expect(scores.map((match) => match[2])).toEqual(
        tournament.matches[0].liveScores.map((score) =>
          score.toLocaleString(locale),
        ),
      );
      for (const match of scores) {
        const fontSize = Number(/font-size="([\d.]+)"/.exec(match[1])?.[1]);
        expect(fontSize).toBeGreaterThan(0);
        expect(fontSize).toBeLessThan(14);
      }
    }
  });

  it("translates generated match labels across exports without renaming custom labels", async () => {
    const tournament = fixture();
    tournament.matches[0].scheduledAt = "2026-10-29T18:00:00Z";
    tournament.presentation.scenes = [
      { id: "schedule", type: "schedule", title: "", text: "", duration: 15 },
    ];
    const outputs = async () => [
      bracketSVG(tournament, undefined, "fa"),
      printableHTML(tournament, "fa"),
      tournamentCSV(tournament, "matches", "fa"),
      tournamentCalendar(tournament, "fa").replace(/\r\n /g, ""),
      (await presentationSlideFiles(tournament, "fa"))[0].svg,
    ];
    for (const output of await outputs()) {
      expect(output).toContain("دور ۱، بازی ۱");
      expect(output).not.toContain("R1 M1");
    }
    tournament.matches[0].label = "Finale / فینال ویژه";
    for (const output of await outputs())
      expect(output).toContain("Finale / فینال ویژه");
  });

  it("keeps print headings and each participant separate from surrounding direction", () => {
    const tournament = fixture();
    tournament.matches[0].result = {
      scores: [12, 7],
      winnerIds: [tournament.participants[0].id],
      outcome: "played",
      recordedAt: tournament.updatedAt,
    };
    const html = printableHTML(tournament, "fa");
    expect(html).toContain('<h1 dir="auto">جام آفتاب / Autumn Cup</h1>');
    expect(html).toContain(`<bdi>${tournament.participants[0].name}</bdi>`);
    expect(html).toContain('<bdi dir="ltr">۱۲ / ۷</bdi>');
    expect(html).toContain("table-layout:fixed");
  });
});

describe("font-complete downloads and printing", () => {
  it("opens print synchronously and closes its window if fonts cannot load", async () => {
    const calls: string[] = [];
    const popup = {
      closed: false,
      close: vi.fn(() => {
        calls.push("close");
      }),
    };
    vi.stubGlobal("window", {
      open: vi.fn(() => {
        calls.push("open");
        return popup;
      }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.push("fetch");
        return { ok: false };
      }),
    );
    const printing = printTournament(fixture(), "fa");
    expect(calls).toEqual(["open"]);
    await expect(printing).rejects.toThrow("bundled export font");
    expect(popup.close).toHaveBeenCalledOnce();
    expect(calls[0]).toBe("open");
  });

  it("embeds both bundled fonts in bracket downloads and waits for print fonts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );
    let downloaded: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      downloaded = blob as Blob;
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ click }) });
    await exportBracketSVG(fixture(), undefined, "fa");
    expect(click).toHaveBeenCalledOnce();
    const svg = await downloaded!.text();
    expect(svg).toContain("data:font/woff2;base64,AQID");
    expect(svg).toContain("font-family:TournaExportArabic");
    expect(svg).toContain("font-family:TournaExportLatin");
    const calls: string[] = [];
    let finishFonts!: () => void;
    const ready = new Promise<void>((resolve) => {
      finishFonts = resolve;
    });
    const load = vi.fn(async () => [{ status: "loaded" }]);
    const write = vi.fn(() => {
      calls.push("write");
    });
    const print = vi.fn(() => {
      calls.push("print");
    });
    vi.stubGlobal("window", {
      open: () => ({
        closed: false,
        document: {
          open: vi.fn(),
          write,
          close: vi.fn(),
          fonts: { ready, load },
        },
        print,
        close: vi.fn(),
      }),
    });
    const printing = printTournament(fixture(), "fa");
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(print).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith("14px TournaExportArabic", "شاهین");
    expect(load).toHaveBeenCalledWith("14px TournaExportLatin", "TournaStudio");
    finishFonts();
    await printing;
    expect(calls).toEqual(["write", "print"]);
    vi.runAllTimers();
  });

  it("refuses to print if readiness resolves without loaded export fonts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );
    const print = vi.fn();
    const close = vi.fn();
    vi.stubGlobal("window", {
      open: () => ({
        closed: false,
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
          fonts: { ready: Promise.resolve(), load: vi.fn(async () => []) },
        },
        print,
        close,
      }),
    });
    await expect(printTournament(fixture())).rejects.toThrow(
      "print fonts could not be loaded",
    );
    expect(print).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
