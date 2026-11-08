import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleContext } from "../i18n";
import { languages, localeCodes, localeDirection } from "../i18n/locales";
import { LanguageSelector } from "./LanguageSelector";

describe("language selector", () => {
  it.each(localeCodes)(
    "offers all languages while %s is selected",
    (locale) => {
      const markup = renderToStaticMarkup(
        createElement(
          LocaleContext.Provider,
          {
            value: locale,
          },
          createElement(LanguageSelector, { locale, onChange: () => {} }),
        ),
      );
      expect(markup).toContain('<label class="language-selector">');
      expect(markup).toContain('<span class="sr-only">');
      expect(markup).toContain(
        `<select data-testid="language-select" lang="${locale}" dir="${localeDirection(locale)}">`,
      );
      expect(markup.match(/<option /g)).toHaveLength(20);
      expect(markup.match(/selected=""/g)).toHaveLength(1);
      expect(markup).toContain(
        `value="${locale}" lang="${locale}" dir="${localeDirection(locale)}" selected=""`,
      );
      for (const language of languages)
        expect(markup).toContain(language.nativeName);
    },
  );

  it("announces loading while keeping language selection available", () => {
    const markup = renderToStaticMarkup(
      createElement(LanguageSelector, {
        locale: "en",
        pending: true,
        onChange: () => {},
      }),
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status">Loading language...');
    expect(markup).not.toContain("disabled");
  });
});
