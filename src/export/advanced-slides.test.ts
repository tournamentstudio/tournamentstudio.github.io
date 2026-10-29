import { describe, expect, it } from "vitest";
import {
  createParticipant,
  createTournament,
  type Locale,
} from "../domain/types";
import { generateStage, simulate } from "../engine";
import { advancedSlidePages } from "./advanced-slides";
import { championPosterSVG } from "./visuals";

function textBlocks(svg: string) {
  return Array.from(
    svg.matchAll(/<text\s([^>]*)>([\s\S]*?)<\/text>/g),
    (match) => {
      const y = Number(match[1].match(/\by="([^"]+)"/)?.[1]);
      const size = Number(match[1].match(/\bfont-size="([^"]+)"/)?.[1]);
      const spans = Array.from(
        match[2].matchAll(/<tspan\s([^>]*)>(.*?)<\/tspan>/g),
      );
      return {
        value: spans.map((span) => span[2]).join(" "),
        top: y - size,
        bottom:
          y +
          spans.reduce(
            (sum, span) =>
              sum + Number(span[1].match(/\bdy="([^"]+)"/)?.[1] ?? 0),
            0,
          ) +
          size * 0.35,
      };
    },
  );
}

const fixture = (locale: Locale) => {
  const participant = createParticipant(
    locale === "fa"
      ? "نام بازیکن آفتاب Alpha ".repeat(4)
      : "Participant Alpha ".repeat(5),
    1,
  );
  participant.organization =
    locale === "fa"
      ? "باشگاه نور Partners ".repeat(6)
      : "Organization Partners ".repeat(6);
  return createTournament("TournaStudio cup", [participant]);
};

describe("multiline introduction exports", () => {
  it.each(["en", "fa"] as const)(
    "keeps %s title, name, organization and description apart",
    (locale) => {
      const tournament = fixture(locale);
      const scene = {
        id: "intro",
        type: "introduction" as const,
        title:
          locale === "fa"
            ? "معرفی قهرمانان Championship ".repeat(4)
            : "Meet the Championship Competitors ".repeat(4),
        text: Array.from(
          { length: 6 },
          (_, i) => `Description ${i} توضیحات`,
        ).join("\n"),
        duration: 12,
      };
      const pages = advancedSlidePages(tournament, scene, locale);
      const svg = pages[0].svg;
      const blocks = textBlocks(svg);
      const title = blocks.find((block) =>
        block.value.startsWith(locale === "fa" ? "معرفی" : "Meet"),
      )!;
      const name = blocks.find((block) =>
        block.value.startsWith(locale === "fa" ? "نام بازیکن" : "Participant"),
      )!;
      const organization = blocks.find((block) =>
        block.value.startsWith(locale === "fa" ? "باشگاه" : "Organization"),
      )!;
      const description = blocks.find((block) =>
        block.value.startsWith("Description"),
      )!;
      expect(title.bottom).toBeLessThan(name.top);
      expect(name.bottom).toBeLessThan(organization.top);
      expect(organization.bottom).toBeLessThan(description.top);
      const footer = blocks.at(-1)!;
      expect(description.bottom).toBeLessThan(footer.top);
      const height = Number(svg.match(/<svg[^>]*\bheight="([^"]+)"/)?.[1]);
      expect(
        blocks.every((block) => block.top >= 0 && block.bottom <= height),
      ).toBe(true);
    },
  );

  it("continues long descriptions on bounded pages without losing content or exposing private data", () => {
    const tournament = fixture("fa");
    tournament.participants[0].metadata.privateNote =
      "PRIVATE-INTRODUCTION-NOTE";
    const lines = Array.from(
      { length: 44 },
      (_, i) => `Paragraph-${String(i).padStart(2, "0")} متن معرفی`,
    );
    const scene = {
      id: "intro",
      type: "introduction" as const,
      title: "معرفی",
      text: lines.join("\n"),
      duration: 12,
    };
    const before = JSON.stringify(tournament);
    const pages = advancedSlidePages(tournament, scene, "fa");
    expect(pages.length).toBeGreaterThan(1);
    const exported = pages.map((page) => page.svg).join("");
    for (const line of lines) expect(exported.split(line)).toHaveLength(2);
    for (const page of pages) {
      const height = Number(page.svg.match(/<svg[^>]*\bheight="([^"]+)"/)?.[1]);
      expect(height).toBeLessThanOrEqual(2400);
      expect(
        textBlocks(page.svg).every(
          (block) => block.top >= 0 && block.bottom <= height,
        ),
      ).toBe(true);
    }
    expect(exported).not.toContain("PRIVATE-INTRODUCTION-NOTE");
    expect(JSON.stringify(tournament)).toBe(before);
  });

  it("paginates imported identities with many line breaks instead of creating an oversized image", () => {
    const tournament = fixture("en");
    tournament.participants[0].name = `${"A\n".repeat(80)}LAST-NAME`;
    const pages = advancedSlidePages(
      tournament,
      {
        id: "intro",
        type: "introduction",
        title: "Introduction",
        text: "LAST-DESCRIPTION",
        duration: 12,
      },
      "en",
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((page) => page.svg).join("")).toContain("LAST-NAME");
    expect(pages.at(-1)!.svg).toContain("LAST-DESCRIPTION");
    for (const page of pages) {
      expect(page.svg).toContain('height="900"');
      expect(
        textBlocks(page.svg).every(
          (block) => block.top >= 0 && block.bottom <= 900,
        ),
      ).toBe(true);
    }
  });
});

it("keeps a multiline champion subtitle clear of the winner and footer", () => {
  let tournament = fixture("fa");
  tournament.participants.push(createParticipant("Other entrant", 2));
  tournament.stages[0].participantIds = tournament.participants.map(
    (participant) => participant.id,
  );
  tournament.subtitle = Array.from(
    { length: 6 },
    (_, i) => `Subtitle ${i} رقابت`,
  ).join("\n");
  tournament = simulate(generateStage(tournament, tournament.stages[0].id));
  const svg = championPosterSVG(tournament, "fa");
  const blocks = textBlocks(svg);
  const subtitle = blocks.find((block) => block.value.startsWith("Subtitle"))!;
  const winner = blocks.find(
    (block) =>
      block.value.startsWith("نام بازیکن") ||
      block.value.startsWith("Other entrant"),
  )!;
  expect(winner.bottom).toBeLessThan(subtitle.top);
  expect(subtitle.bottom).toBeLessThan(blocks.at(-1)!.top);
});
