export const localeCodes = [
  "en",
  "fa",
  "es",
  "it",
  "fr",
  "de",
  "pt",
  "nl",
  "pl",
  "uk",
  "ru",
  "tr",
  "ar",
  "hi",
  "bn",
  "id",
  "vi",
  "zh",
  "ja",
  "ko",
] as const;

export type SupportedLocale = (typeof localeCodes)[number];

export const languages: readonly {
  code: SupportedLocale;
  nativeName: string;
  tag: string;
  direction: "ltr" | "rtl";
}[] = [
  { code: "en", nativeName: "English", tag: "en-US", direction: "ltr" },
  { code: "fa", nativeName: "فارسی", tag: "fa-IR", direction: "rtl" },
  { code: "es", nativeName: "Español", tag: "es-ES", direction: "ltr" },
  { code: "it", nativeName: "Italiano", tag: "it-IT", direction: "ltr" },
  { code: "fr", nativeName: "Français", tag: "fr-FR", direction: "ltr" },
  { code: "de", nativeName: "Deutsch", tag: "de-DE", direction: "ltr" },
  { code: "pt", nativeName: "Português", tag: "pt-BR", direction: "ltr" },
  { code: "nl", nativeName: "Nederlands", tag: "nl-NL", direction: "ltr" },
  { code: "pl", nativeName: "Polski", tag: "pl-PL", direction: "ltr" },
  { code: "uk", nativeName: "Українська", tag: "uk-UA", direction: "ltr" },
  { code: "ru", nativeName: "Русский", tag: "ru-RU", direction: "ltr" },
  { code: "tr", nativeName: "Türkçe", tag: "tr-TR", direction: "ltr" },
  { code: "ar", nativeName: "العربية", tag: "ar", direction: "rtl" },
  { code: "hi", nativeName: "हिन्दी", tag: "hi-IN", direction: "ltr" },
  { code: "bn", nativeName: "বাংলা", tag: "bn-BD", direction: "ltr" },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    tag: "id-ID",
    direction: "ltr",
  },
  { code: "vi", nativeName: "Tiếng Việt", tag: "vi-VN", direction: "ltr" },
  { code: "zh", nativeName: "简体中文", tag: "zh-CN", direction: "ltr" },
  { code: "ja", nativeName: "日本語", tag: "ja-JP", direction: "ltr" },
  { code: "ko", nativeName: "한국어", tag: "ko-KR", direction: "ltr" },
];

export function isLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" && localeCodes.some((locale) => locale === value)
  );
}

export function localeDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "fa" || locale === "ar" ? "rtl" : "ltr";
}

export function localeTag(locale: SupportedLocale): string {
  return languages.find((language) => language.code === locale)!.tag;
}

const preferenceKey = "tournastudio-locale";

export function readLocalePreference(
  storage?: Pick<Storage, "getItem">,
): SupportedLocale {
  try {
    const value = (storage ?? globalThis.localStorage).getItem(preferenceKey);
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}

export function saveLocalePreference(
  locale: SupportedLocale,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? globalThis.localStorage).setItem(preferenceKey, locale);
  } catch {
    // The selected language still applies when browser storage is unavailable.
  }
}
