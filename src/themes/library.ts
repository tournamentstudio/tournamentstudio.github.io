import { z } from "zod";
import type { ThemeSettings } from "../domain/types";
import { uid } from "../domain/types";
import { themeSchema } from "../domain/validate";
import { themeDesignSchema, type ThemeDesign } from "../domain/display-options";
import { db } from "../persistence";
import { canonicalize, safeParse } from "../security/codec";

export type DesignedTheme = ThemeSettings & { design?: ThemeDesign };
export const designedThemeSchema = themeSchema
  .extend({ design: themeDesignSchema.optional() })
  .strict();
export const portableThemeSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    theme: designedThemeSchema,
  })
  .strict();
const savedThemeSchema = z
  .object({
    id: z.string().min(1).max(160),
    name: z.string().trim().min(1).max(120),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    theme: designedThemeSchema,
  })
  .strict();
const librarySchema = z
  .object({ version: z.literal(1), themes: z.array(savedThemeSchema).max(50) })
  .strict();
export type SavedTheme = z.infer<typeof savedThemeSchema>;
const libraryKey = "personal-themes-v1";
const maxBytes = 16 * 1024 * 1024;

function parseLibrary(value: string | undefined): SavedTheme[] {
  if (!value) return [];
  return librarySchema.parse(safeParse(value)).themes;
}

export async function loadPersonalThemes(): Promise<SavedTheme[]> {
  const row = await db.preferences.get(libraryKey);
  return parseLibrary(row?.value).sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

async function mutateLibrary(change: (themes: SavedTheme[]) => SavedTheme[]) {
  return db.transaction("rw", db.preferences, async () => {
    const stored = await db.preferences.get(libraryKey);
    const next = librarySchema.parse({
      version: 1,
      themes: change(parseLibrary(stored?.value)),
    });
    const value = canonicalize(next);
    if (new TextEncoder().encode(value).length > maxBytes)
      throw new Error(
        "The personal theme library exceeds 16 MiB. Remove saved images or delete unused themes.",
      );
    await db.preferences.put({ key: libraryKey, value });
    return next.themes;
  });
}

export async function savePersonalTheme(
  name: string,
  theme: DesignedTheme,
  includeImages = false,
): Promise<SavedTheme> {
  const copy = designedThemeSchema.parse(structuredClone(theme));
  if (!includeImages) {
    delete copy.logo;
    delete copy.backgroundImage;
  }
  const at = new Date().toISOString();
  const entry = savedThemeSchema.parse({
    id: uid(),
    name,
    createdAt: at,
    updatedAt: at,
    theme: copy,
  });
  await mutateLibrary((themes) => {
    if (themes.length >= 50)
      throw new Error(
        "The personal theme library is limited to 50 themes. Delete an unused theme before saving another.",
      );
    return [...themes, entry];
  });
  return entry;
}

export async function renamePersonalTheme(
  id: string,
  name: string,
): Promise<void> {
  const parsedName = savedThemeSchema.shape.name.parse(name);
  await mutateLibrary((themes) => {
    if (!themes.some((theme) => theme.id === id))
      throw new Error("This saved theme no longer exists. Reload the library.");
    return themes.map((theme) =>
      theme.id === id
        ? { ...theme, name: parsedName, updatedAt: new Date().toISOString() }
        : theme,
    );
  });
}

export async function deletePersonalTheme(id: string): Promise<void> {
  await mutateLibrary((themes) => themes.filter((theme) => theme.id !== id));
}

export function parsePortableTheme(text: string): DesignedTheme {
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw new Error("The theme file exceeds 8 MiB.");
  return portableThemeSchema.parse(safeParse(text)).theme;
}

export function serializePortableTheme(theme: DesignedTheme): string {
  return JSON.stringify(
    { version: theme.design ? 2 : 1, theme: designedThemeSchema.parse(theme) },
    null,
    2,
  );
}
