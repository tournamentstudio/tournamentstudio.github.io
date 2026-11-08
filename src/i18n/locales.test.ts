import { describe, expect, it } from "vitest";
import {
  isLocale,
  languages,
  localeCodes,
  localeDirection,
  localeTag,
  readLocalePreference,
  saveLocalePreference,
} from "./locales";

describe("supported languages", () => {
  it("defines one native name and a usable Intl locale for every language", () => {
    expect(localeCodes).toHaveLength(20);
    expect(new Set(localeCodes).size).toBe(20);
    expect(languages.map((language) => language.code)).toEqual(localeCodes);
    for (const language of languages) {
      expect(isLocale(language.code)).toBe(true);
      expect(language.nativeName.trim()).not.toBe("");
      expect(localeDirection(language.code)).toBe(language.direction);
      expect(localeTag(language.code)).toBe(language.tag);
      expect(Intl.DateTimeFormat.supportedLocalesOf(language.tag)).toHaveLength(
        1,
      );
      expect(Intl.NumberFormat.supportedLocalesOf(language.tag)).toHaveLength(
        1,
      );
    }
  });

  it("uses right-to-left layout for Persian and Arabic only", () => {
    expect(
      localeCodes.filter((locale) => localeDirection(locale) === "rtl"),
    ).toEqual(["fa", "ar"]);
  });

  it.each([undefined, null, "", "EN", "en-US", "unknown", 1, {}, "__proto__"])(
    "rejects an unsupported preference: %s",
    (value) => {
      expect(isLocale(value)).toBe(false);
      expect(
        readLocalePreference({ getItem: () => value as string | null }),
      ).toBe("en");
    },
  );

  it.each(localeCodes)(
    "remembers the %s selection without changing any other key",
    (locale) => {
      const values = new Map<string, string>([
        ["tournament-title", "Original title"],
      ]);
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
      saveLocalePreference(locale, storage);
      expect(readLocalePreference(storage)).toBe(locale);
      expect(values.get("tournament-title")).toBe("Original title");
      expect(values.size).toBe(2);
    },
  );

  it("keeps the application usable when browser storage is blocked", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("Storage is blocked");
      },
      setItem: () => {
        throw new Error("Storage is blocked");
      },
    };
    expect(readLocalePreference(unavailable)).toBe("en");
    expect(() => saveLocalePreference("it", unavailable)).not.toThrow();
  });
});
