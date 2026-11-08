import { Globe2, LoaderCircle } from "lucide-react";
import type { Locale } from "../domain/types";
import { useI18n } from "../i18n";
import { isLocale, languages, localeDirection } from "../i18n/locales";
import "./language-selector.css";

export function LanguageSelector({
  locale,
  onChange,
  pending = false,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  pending?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="language-selector">
      {pending ? (
        <LoaderCircle size={16} className="spin" aria-hidden="true" />
      ) : (
        <Globe2 size={16} aria-hidden="true" />
      )}
      <span className="sr-only">{t("Language", "زبان")}</span>
      <select
        data-testid="language-select"
        value={locale}
        lang={locale}
        dir={localeDirection(locale)}
        aria-busy={pending || undefined}
        onChange={(event) => {
          if (isLocale(event.target.value)) onChange(event.target.value);
        }}
      >
        {languages.map((language) => (
          <option
            key={language.code}
            value={language.code}
            lang={language.code}
            dir={language.direction}
          >
            {language.nativeName}
          </option>
        ))}
      </select>
      {pending && (
        <span className="sr-only" role="status">
          {t("Loading language...", "در حال بارگذاری زبان...")}
        </span>
      )}
    </label>
  );
}
