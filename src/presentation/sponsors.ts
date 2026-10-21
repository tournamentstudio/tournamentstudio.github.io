import type { PresentationSettings, SponsorCard } from "../domain/types";
export type { SponsorCard } from "../domain/types";
export function sponsorEntries(settings: PresentationSettings): SponsorCard[] {
  const tier = { main: 0, partner: 1, supporter: 2 };
  return [
    ...(settings.sponsorCards ?? []),
    ...settings.sponsors
      .filter((name) => name.trim())
      .map((name, index) => ({
        id: `legacy-sponsor-${index}`,
        name,
        tier: "partner" as const,
      })),
  ].sort((a, b) => tier[a.tier] - tier[b.tier]);
}
export function sponsorPages(settings: PresentationSettings): SponsorCard[][] {
  const entries = sponsorEntries(settings),
    pages: SponsorCard[][] = [];
  for (let index = 0; index < entries.length; index += 8)
    pages.push(entries.slice(index, index + 8));
  return pages;
}
