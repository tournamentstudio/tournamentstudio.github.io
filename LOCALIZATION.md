# Languages in TournaStudio

I want organizers to use their own language without changing the tournament they
are running. The header has one language menu, and its selection applies to
interface text, generated competition labels, standings and export labels.
Names, custom labels, scores, rules and historical records remain organizer data.

## Available languages

| Code | Language menu label | Formatting locale | Direction |
| ---- | ------------------- | ----------------- | --------- |
| `en` | English             | `en-US`           | LTR       |
| `fa` | فارسی               | `fa-IR`           | RTL       |
| `es` | Español             | `es-ES`           | LTR       |
| `it` | Italiano            | `it-IT`           | LTR       |
| `fr` | Français            | `fr-FR`           | LTR       |
| `de` | Deutsch             | `de-DE`           | LTR       |
| `pt` | Português           | `pt-BR`           | LTR       |
| `nl` | Nederlands          | `nl-NL`           | LTR       |
| `pl` | Polski              | `pl-PL`           | LTR       |
| `uk` | Українська          | `uk-UA`           | LTR       |
| `ru` | Русский             | `ru-RU`           | LTR       |
| `tr` | Türkçe              | `tr-TR`           | LTR       |
| `ar` | العربية             | `ar`              | RTL       |
| `hi` | हिन्दी              | `hi-IN`           | LTR       |
| `bn` | বাংলা               | `bn-BD`           | LTR       |
| `id` | Bahasa Indonesia    | `id-ID`           | LTR       |
| `vi` | Tiếng Việt          | `vi-VN`           | LTR       |
| `zh` | 简体中文            | `zh-CN`           | LTR       |
| `ja` | 日本語              | `ja-JP`           | LTR       |
| `ko` | 한국어              | `ko-KR`           | LTR       |

The existing English and Persian wording remains in source. The 18 added
catalogs began as automated translations. A separate agent review corrected
selected sports terms, including draws versus drawn results, seeding, draw pots,
BYEs, standings and ranking explanations. These catalogs have not had a full
review by native-speaking human translators. Complete key coverage is not proof
of natural phrasing or correct terminology in every context.

## What switching changes

The app loads a bundled pack before applying the selection. During loading the
current screen remains usable. If loading fails, the old language stays active
and a retry action appears. Only the latest requested language can take effect.
The selected code is remembered in this browser profile when storage is available.

Language changes update text, layout direction and number/date formatting without
restarting the workspace or rewriting a tournament. Persian and Arabic use RTL.
Participant names and editable titles follow their own text direction. Manual
bracket orientation stays under the organizer's control; **Follow language**
restores the automatic direction.

The browser's Intl implementation formats displayed values. Language does not
change a timestamp's stored instant or the tournament timezone. A locale may
display a different calendar or digit shapes. Formats intended for data exchange
retain their defined machine-readable representation.

Generated labels translate; organizer-written names, notes, match labels and
custom metric names do not. A custom metric's optional Persian name remains its
explicit Persian alternative. This prevents a custom field named like a common
interface word from being silently renamed.

## Offline and font behavior

Catalogs ship as static assets and use the app's existing cache. No runtime
translation provider is contacted. No tournament data is uploaded for translation.
Let the initial cache finish before relying on any language offline.

Inter and Vazirmatn are bundled for Latin and Persian/Arabic text. Hindi, Bengali,
Chinese, Japanese and Korean rely on suitable device fonts. The app does not fetch
fonts from a CDN. Missing device glyphs can affect both the interface and exported
SVG/HTML; PNG export records what the local browser can render. Inspect the chosen
script on the intended display before a tournament.

## Changing messages

The main files are:

- `src/i18n/locales.ts`: accepted codes, menu names, direction and Intl tags.
- `src/i18n/translate.ts`: bundled pack loading and message/template lookup.
- `src/i18n/messages.json`: extracted English message keys.
- `src/i18n/catalogs/<code>.json`: the 18 added catalogs.
- `src/i18n/overrides/<code>.json`: reviewed corrections retained separately from
  the initial translated catalog.
- `scripts/i18n-catalog.mjs`: extraction and structural checks.

The message manifest contains 3,517 keys at this update. Every added catalog must
include every key, with no empty values or obsolete keys. Numbered placeholders
such as `{0}` must survive translation so names, counts and other inserted values
remain intact. Their order can change to suit the language.

When editing an interface message, keep its English and Persian source pair,
then refresh the manifest:

```sh
node scripts/i18n-catalog.mjs --write
```

Update all added catalogs for any new or changed keys. For a reviewed wording
correction, edit its override entry and apply the corrections:

```sh
node scripts/i18n-catalog.mjs --apply-overrides
```

Do not translate
participant names, example personal details or saved tournament documents.

Run the catalog checker and normal local checks:

```sh
npm run translations:check
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test tests/e2e/languages.spec.ts
```

The checks verify source coverage, placeholder sets and protected technical
identifiers such as `.tourney`, timezone names and `Gol Ya Pooch`. They cannot assess
grammar, register, layout or the intended meaning of a sports term. Browser checks
exercise the rendered interface; the release report records what actually ran.
CI remains disabled and these commands run locally.

For a translation report, include the selected language, screen, current text and
suggested wording. Explain the tournament context when a word such as "draw" or
"seed" has more than one meaning. Native-speaking review is welcome, particularly
for long explanations and less common competition formats.
