import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createParticipant, createTournament } from "../domain/types";
import { generateStage, simulate } from "../engine";
import { defaultOverlay, overlaySchema } from "../domain/display-options";
import { broadcastOverlaySVG } from "../export/overlay";
import { AdvancedSceneContent, introductionMatch } from "./advanced-scenes";
import { BroadcastOverlay } from "./BroadcastOverlay";

function fixture() {
  const t = createTournament(
    "Finals",
    Array.from({ length: 8 }, (_, i) => createParticipant(`Team ${i}`, i + 1)),
    "single-elimination",
  );
  return generateStage(t, t.stages[0].id);
}

describe("introductions and broadcast output", () => {
  it("finds actual semifinals and the deciding final", () => {
    const t = fixture();
    expect(introductionMatch(t, "semifinal")?.round).toBe(2);
    expect(introductionMatch(t, "final-intro")?.metadata.championship).toBe(
      true,
    );
    expect(introductionMatch(t, "final-intro", "unknown")).toBeUndefined();
  });
  it("cycles selected active entrants and leaves secret fields out", () => {
    const t = fixture();
    t.matches[0].private = { concealedPosition: "SECRET-HAND" };
    t.participants[0].metadata.privateNote = "PRIVATE-NOTE";
    const scene = {
      id: "intro",
      type: "introduction" as const,
      title: "Welcome",
      text: "",
      duration: 12,
      participantIds: [t.participants[0].id, t.participants[2].id],
    };
    const first = renderToStaticMarkup(
      createElement(AdvancedSceneContent, {
        tournament: t,
        scene,
        locale: "en",
        elapsed: 0,
      }),
    );
    const second = renderToStaticMarkup(
      createElement(AdvancedSceneContent, {
        tournament: t,
        scene,
        locale: "en",
        elapsed: 6,
      }),
    );
    expect(first).toContain("Team 0");
    expect(second).toContain("Team 2");
    expect(first + second).not.toContain("SECRET-HAND");
    expect(first + second).not.toContain("PRIVATE-NOTE");
  });
  it("shows a trophy only with a result-based champion label", () => {
    const scene = {
      id: "trophy",
      type: "trophy" as const,
      title: "",
      text: "Well played",
      duration: 10,
    };
    expect(
      renderToStaticMarkup(
        createElement(AdvancedSceneContent, {
          tournament: fixture(),
          scene,
          locale: "en",
          elapsed: 0,
        }),
      ),
    ).toContain("The champion is not decided yet");
    const complete = simulate(fixture());
    expect(
      renderToStaticMarkup(
        createElement(AdvancedSceneContent, {
          tournament: complete,
          scene,
          locale: "en",
          elapsed: 0,
        }),
      ),
    ).not.toContain("not decided");
  });
  it("exports transparent and chroma backgrounds without hidden referee state", () => {
    const t = fixture();
    t.matches[0].status = "live";
    t.matches[0].liveScores = [9, 4];
    t.matches[0].private = { concealedPosition: "SECRET-HAND" };
    const svg = broadcastOverlaySVG(t, defaultOverlay);
    expect(svg).not.toContain('<rect width="100%"');
    expect(svg).toContain(">9</tspan>");
    expect(svg).not.toContain("SECRET-HAND");
    expect(
      broadcastOverlaySVG(t, {
        ...defaultOverlay,
        background: "chroma",
        chroma: "#00ff00",
      }),
    ).toContain('<rect width="100%" height="100%" fill="#00ff00"');
    const html = renderToStaticMarkup(
      createElement(BroadcastOverlay, {
        tournament: t,
        settings: defaultOverlay,
      }),
    );
    expect(html).toContain("<strong>9</strong>");
    expect(html).not.toContain("SECRET-HAND");
  });
  it("rejects executable or malformed overlay settings", () => {
    expect(
      overlaySchema.safeParse({ ...defaultOverlay, chroma: "url(x)" }).success,
    ).toBe(false);
    expect(
      overlaySchema.safeParse({ ...defaultOverlay, html: "<script>" }).success,
    ).toBe(false);
    expect(() =>
      broadcastOverlaySVG(fixture(), { ...defaultOverlay, matchId: "missing" }),
    ).toThrow("Choose a ready");
  });
});
