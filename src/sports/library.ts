import { z } from "zod";
import type { Tournament } from "../domain/types";
import { uid } from "../domain/types";
import { rulesSchema, themeSchema } from "../domain/validate";
import { canonicalize, safeParse } from "../security/codec";
import { db } from "../persistence";
import { sports } from "./index";

export const savedSportSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1).max(160),
    name: z.string().trim().min(1).max(120),
    sport: z.string().refine((id) => sports.some((s) => s.id === id)),
    kind: z.enum(["individual", "team"]),
    rules: rulesSchema,
    theme: themeSchema,
    duration: z.number().int().min(1).max(1440),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type SavedSport = z.infer<typeof savedSportSchema>;
const key = "sport-preset-library-v1";
const library = z
  .object({ version: z.literal(1), presets: z.array(savedSportSchema).max(50) })
  .strict();
function parse(value?: string) {
  return value ? library.parse(safeParse(value)).presets : [];
}
export async function loadSportPresets() {
  return parse((await db.preferences.get(key))?.value).sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
  );
}
async function change(update: (items: SavedSport[]) => SavedSport[]) {
  return db.transaction("rw", db.preferences, async () => {
    const items = library.parse({
      version: 1,
      presets: update(parse((await db.preferences.get(key))?.value)),
    });
    const value = canonicalize(items);
    if (new TextEncoder().encode(value).length > 2 * 1024 * 1024)
      throw new Error("The sport preset library exceeds 2 MiB.");
    await db.preferences.put({ key, value });
  });
}
export async function saveSportPreset(name: string, t: Tournament) {
  const theme = structuredClone(t.theme);
  delete theme.logo;
  delete theme.backgroundImage;
  const entry = savedSportSchema.parse({
    version: 1,
    id: uid(),
    name,
    sport: t.sport,
    kind:
      t.participants[0]?.kind ??
      sports.find((s) => s.id === t.sport)?.kind ??
      "team",
    rules: t.rules,
    theme,
    duration: t.schedule.matchMinutes,
    updatedAt: new Date().toISOString(),
  });
  await change((items) => {
    if (items.length >= 50)
      throw new Error("The sport preset library is limited to 50 presets.");
    return [...items, entry];
  });
  return entry;
}
export async function deleteSportPreset(id: string) {
  await change((items) => items.filter((item) => item.id !== id));
}
export async function importSportPreset(text: string) {
  if (new TextEncoder().encode(text).length > 128 * 1024)
    throw new Error("Sport preset files must be smaller than 128 KiB.");
  const entry = savedSportSchema.parse(safeParse(text));
  entry.id = uid();
  entry.updatedAt = new Date().toISOString();
  delete entry.theme.logo;
  delete entry.theme.backgroundImage;
  await change((items) => {
    if (items.length >= 50)
      throw new Error("The sport preset library is limited to 50 presets.");
    return [...items, entry];
  });
  return entry;
}
export function applySavedSportPreset(
  t: Tournament,
  input: SavedSport,
): Tournament {
  const preset = savedSportSchema.parse(input);
  if (
    t.matches.some(
      (match) =>
      (match.result && match.status !== "bye") ||
        match.hands?.length ||
        match.status === "live" ||
        match.status === "contested",
    )
  )
    throw new Error(
      "Sport presets cannot replace rules after play begins. Edit the agreed current rules instead.",
    );
  return {
    ...t,
    sport: preset.sport,
    rules: structuredClone(preset.rules),
    theme: structuredClone(preset.theme),
    participants: t.participants.map((p) => ({ ...p, kind: preset.kind })),
    schedule: { ...t.schedule, matchMinutes: preset.duration },
  };
}
