import type { SupportedLocale } from "./locales";
import persianReference from "./persian-reference.json" with { type: "json" };

type Catalog = Record<string, string>;
type Template = {
  prefix: string;
  suffix: string;
  literals: string[];
  specificity: number;
  pattern: RegExp;
  indices: number[];
  translated: string;
};
const loaders: Partial<
  Record<SupportedLocale, () => Promise<{ default: Catalog }>>
> = {
  es: () => import("./catalogs/es.json", { with: { type: "json" } }),
  it: () => import("./catalogs/it.json", { with: { type: "json" } }),
  fr: () => import("./catalogs/fr.json", { with: { type: "json" } }),
  de: () => import("./catalogs/de.json", { with: { type: "json" } }),
  pt: () => import("./catalogs/pt.json", { with: { type: "json" } }),
  nl: () => import("./catalogs/nl.json", { with: { type: "json" } }),
  pl: () => import("./catalogs/pl.json", { with: { type: "json" } }),
  uk: () => import("./catalogs/uk.json", { with: { type: "json" } }),
  ru: () => import("./catalogs/ru.json", { with: { type: "json" } }),
  tr: () => import("./catalogs/tr.json", { with: { type: "json" } }),
  ar: () => import("./catalogs/ar.json", { with: { type: "json" } }),
  hi: () => import("./catalogs/hi.json", { with: { type: "json" } }),
  bn: () => import("./catalogs/bn.json", { with: { type: "json" } }),
  id: () => import("./catalogs/id.json", { with: { type: "json" } }),
  vi: () => import("./catalogs/vi.json", { with: { type: "json" } }),
  zh: () => import("./catalogs/zh.json", { with: { type: "json" } }),
  ja: () => import("./catalogs/ja.json", { with: { type: "json" } }),
  ko: () => import("./catalogs/ko.json", { with: { type: "json" } }),
};
const catalogs = new Map<SupportedLocale, Catalog>();
const templates = new Map<SupportedLocale, Template[]>();
const pending = new Map<SupportedLocale, Promise<void>>();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function compile(catalog: Catalog): Template[] {
  return Object.entries(catalog)
    .filter(([key]) => /\{\d+\}/.test(key))
    .map(([key, translated]) => {
      const parts = key.split(/\{\d+\}/);
      return {
        prefix: parts[0],
        suffix: parts.at(-1)!,
        literals: parts.slice(1, -1).filter(Boolean),
        specificity: parts.join("").length,
        pattern: new RegExp(`^${parts.map(escape).join("([\\s\\S]*?)")}$`),
        indices: [...key.matchAll(/\{(\d+)\}/g)].map((match) =>
          Number(match[1]),
        ),
        translated,
      };
    })
    .sort(compareTemplates);
}
const compareTemplates = (a: Template, b: Template) =>
  b.prefix.length - a.prefix.length || b.specificity - a.specificity;
function containsLiteralParts(message: string, template: Template): boolean {
  if (
    !message.startsWith(template.prefix) ||
    !message.endsWith(template.suffix)
  )
    return false;
  const end = message.length - template.suffix.length;
  let position = template.prefix.length;
  for (const literal of template.literals) {
    const next = message.indexOf(literal, position);
    if (next < 0 || next + literal.length > end) return false;
    position = next + literal.length;
  }
  return position <= end;
}
function render(message: string, patterns: Template[]): string | undefined {
  if (message.length > 32768) return;
  for (const template of patterns) {
    // Check fixed text before wildcard matching to bound rejected long notices.
    if (!containsLiteralParts(message, template)) continue;
    const match = template.pattern.exec(message);
    if (!match) continue;
    const values = new Map<number, string>();
    let consistent = true;
    template.indices.forEach((index, position) => {
      const value = match[position + 1];
      if (values.has(index) && values.get(index) !== value) consistent = false;
      values.set(index, value);
    });
    if (consistent)
      return template.translated.replace(
        /\{(\d+)\}/g,
        (token, index: string) => values.get(Number(index)) ?? token,
      );
  }
}
const reverse = new Map<string, string>();
const reversePatterns: Template[] = [];
const sourceKeys = new Set<string>();
function indexMessages(catalog: Catalog) {
  for (const [source, translated] of Object.entries(catalog)) {
    sourceKeys.add(source);
    if (!reverse.has(translated)) reverse.set(translated, source);
  }
  reversePatterns.push(
    ...compile(
      Object.fromEntries(
        Object.entries(catalog).map(([key, value]) => [value, key]),
      ),
    ),
  );
  reversePatterns.sort(compareTemplates);
}
catalogs.set("fa", persianReference);
templates.set("fa", compile(persianReference));
indexMessages(persianReference);

/** Recover app-owned notices captured before a language switch. Never use for organizer content. */
export function sourceMessage(message: string): string {
  if (sourceKeys.has(message)) return message;
  return reverse.get(message) ?? render(message, reversePatterns) ?? message;
}

/** Load a bundled language before changing the visible interface. */
export async function loadLanguage(locale: SupportedLocale): Promise<void> {
  if (locale === "en" || locale === "fa" || catalogs.has(locale)) return;
  const existing = pending.get(locale);
  if (existing) return existing;
  const loader = loaders[locale];
  if (!loader) throw new Error("This language is not available in this build.");
  const loading = loader()
    .then(({ default: catalog }) => {
      catalogs.set(locale, catalog);
      templates.set(locale, compile(catalog));
      indexMessages(catalog);
    })
    .finally(() => pending.delete(locale));
  pending.set(locale, loading);
  return loading;
}

/** Translate interface messages only; inserted organizer text remains verbatim. */
export function translate(
  locale: SupportedLocale,
  en: string,
  fa?: string,
): string {
  if (locale === "en") return en;
  if (locale === "fa" && fa !== undefined) return fa;
  const catalog = catalogs.get(locale);
  if (!catalog) return en;
  if (Object.hasOwn(catalog, en)) return catalog[en];
  return render(en, templates.get(locale) ?? []) ?? en;
}
