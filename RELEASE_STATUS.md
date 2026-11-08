# TournaStudio release handoff

## Current language release

The November 8, 2026 release replaces the English/Persian toggle with a
20-language menu, including Italian and Spanish. The 18 added catalogs each
contain 3,517 interface messages. Switching loads the selected pack before
updating text, direction and formatting; it preserves entered forms and saved
tournament data. Failed downloads can be retried. All packs are bundled and
available offline after the application cache completes.

The local `npm run check` passed TypeScript, ESLint, 1,523 unit/integration tests
across 122 files, 12 catalog-tool tests and the production build. All four
release-packaging tests passed. The refined build contains 100 precache entries
and 111 publication files. Catalog and build checks were repeated after the
last terminology corrections.

The browser review covered all 20 languages on the welcome page and all three
creation steps at 320, 768 and 1280 pixels. The 36 multilingual cases across
Chromium, Firefox and WebKit cover persisted selection, offline packs, saved
scores, RTL, locale-aware search, notices, delayed downloads and retry behavior.
One WebKit storage-permission test needed a prototype-level mock; its corrected
case passed. The 87 existing regression cases across the three engines also
passed, including Pétanque, groups, exports, presentation and accessibility.

Independent screenshot reviews covered the main European languages, Persian,
Arabic, Hindi, Bengali, Chinese, Japanese and Korean. The review found and fixed
Russian creation-step overflow, Dutch/Indonesian demo-header overflow and header
collisions. Focused final captures verified the fixes in the actual built app.
Translation coverage does not certify natural phrasing: the new catalogs began
as automated drafts and still need full native-speaking human proofreading.
See [LOCALIZATION.md](LOCALIZATION.md) for the language list, font behavior and
contribution instructions.

GitHub Actions remains disabled. Publication uses locally prepared `main/docs`
files; hosted verification is recorded with the GitHub release after publishing.

## Previous Pétanque release

The November 7, 2026 Pétanque release adds the club ranking preset, clearer Rules
controls, on-screen ranking explanations and the actual ranking totals in
exported graphics. The existing standings algorithm and data schema remain
unchanged. Normal tied scores remain invalid when draws are disabled; equal
standings totals retain shared ranks. See [PETANQUE_REVIEW.md](PETANQUE_REVIEW.md)
for the reproduced example, test coverage and compatibility boundaries.

The final `npm run check` passed TypeScript, ESLint, 1,389 unit/integration tests
across 115 files and the production build. All four release-packaging tests
passed. The prepared bundle contains 93 files and 82 precache entries.

Production-bundle browser runs passed 99 cases with no retries: four new
Pétanque workflows in each of Chromium, Firefox and WebKit, plus 87 broader
Chromium regressions. English/Persian standings, Rules and result dialogs were
checked at 320, 390, 768 and 1280 pixels. Eighteen automated accessibility scans
found no AA violations. Narrow tables retain their own horizontal scrolling.

GitHub Actions remains disabled. Publication uses locally prepared `main/docs`
files; hosted verification is recorded with the GitHub release after publishing.

## Previous grouping release

The November 6, 2026 grouping release fixes home/away balance in newly generated
round robins and round ordering in the match desk. Sorting happens before
pagination, so early fixtures from other groups stay ahead of later rounds.
Saved draws, results, qualification references and the data schema are unchanged.
The audit and its boundaries are recorded in [GROUPING_REVIEW.md](GROUPING_REVIEW.md).

The final `npm run check` passed TypeScript, ESLint, 1,344 unit/integration tests
across 112 files and the production build. Four release-packaging tests passed.
The new suites add 105 unit tests and seven browser workflows. The build contains
81 precache entries and 92 prepared publication files.

The final production-bundle browser runs passed 135 cases: 55 in Chromium,
40 in Firefox and 40 in WebKit, with no retries. They cover group creation,
participant limits, manual and pot draws, restrictions, standings, playoff and
wildcard qualification, result isolation, reload and ordered pagination.
The broader Chromium run also passed sharing, vault, offline and presentation
checks. A separate visual capture check passed for all 16 viewport/language views.

Independent visual checks covered English and Persian standings and fixtures at
320, 390, 768 and 1440 pixels. The review found the round-order defect, then
verified its correction in a second pass. No additional text overlap, clipping
or page overflow was found. Narrow tables retain horizontal scrolling.

GitHub Actions remains disabled. Publication uses the locally prepared `main/docs`
bundle. Hosted verification is recorded with the
[GitHub releases](https://github.com/tournamentstudio/tournamentstudio.github.io/releases).

## Previous welcome-page release

The November 6, 2026 welcome-page release gives new visitors a working tournament
example before asking them to create their own. The design and independent
reviews are recorded in [LANDING_REVIEW.md](LANDING_REVIEW.md). Earlier workflow
and interface reviews remain in [UX_REVIEW.md](UX_REVIEW.md) and
[UI_REVIEW.md](UI_REVIEW.md).

## Publication

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- GitHub Pages serves prepared files from `main/docs`.
- GitHub Actions remains disabled; there are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

First-time visitors see a full-width welcome page with a playable four-team
bracket. Choosing a result advances an actual winner through the existing
competition engine. A champion announcement and reset finish the example.
Nothing from the example is written to the local tournament library.

Football, Esports and Gol Ya Pooch programs use the existing original game
artwork at a larger scale. Each opens an editable creation setup. Phone layouts
use shorter landscape covers. The page explains local files and independent
shared copies without invented testimonials or activity counts.

Returning organizers keep their library, including protected and trashed
entries. The initial database read now finishes before choosing the page.
Commands wait for that decision before becoming interactive. Slow storage shows
loading, and failed storage offers retry. This avoids both a welcome-page flash
and controls moving during an early interaction.

English and Persian have separate headline treatment, with more room for
Persian glyphs. Score fractions keep their numeric direction. Keyboard focus
follows sample results and reset, and Try a match brings the control into view
on a short phone screen. The README image is an actual rendered screenshot.

No dependency, competition rule, cryptography or stored-data format changed.
The scoring engine remains lazy-loaded until the example is used.

## Verification

TypeScript, ESLint, the production build and 1,239 unit/integration tests across
108 files passed. Four release-packaging tests passed. The bundle has 81 precache
entries; all 92 prepared publication files are checked by SHA-256.

The final production-bundle runs passed 144 browser cases: 112 in Chromium,
16 in Firefox and 16 in WebKit. The Firefox and WebKit cases cover welcome,
the playable example and initial-library recovery. The broader Chromium run
also covers the existing organizer workflows listed below.

The welcome page was inspected in English and Persian at 320, 390, 768 and
1440 pixels, with keyboard, reduced-motion, overflow and automated WCAG A/AA
checks. Three independent reviewers covered visual direction, the creation path
and responsive accessibility. A second critique led to shorter phone covers,
contrast corrections and clearer focus behavior.

The browser checks cover the new page plus existing creation, match control,
group playoffs, Swiss, Gol Ya Pooch, sharing, encrypted backups, offline use,
local presentation updates, timezone review and saved-data recovery. Two new
fault-injection cases exercise delayed and failed IndexedDB reads. They check
that an existing library never briefly appears as a new visitor's empty browser.

Early runs found outdated import-command assertions and the initial library
interaction race. Those were corrected. One simultaneous test run also removed
another run's trace files; later runs use separate output directories. Concurrent
Firefox launches stalled, so final Firefox checks run serially. The first storage
failure fixture targeted a cursor API that the browser bypassed; it now intercepts
the actual native read transaction. No retries or timeouts were relaxed.

Repeat the checks locally:

```sh
npm run check
npm run test:release
npm run test:e2e
```

Before and after screenshots and logs are retained in the ignored local audit
folder. Hosted verification is recorded with the
[GitHub releases](https://github.com/tournamentstudio/tournamentstudio.github.io/releases).

## Review boundaries

Passing checks do not establish that every possible input is free of bugs.
Visual review used desktop engines with resized viewports. Physical phone
keyboards, spoken Persian with assistive technology and usability sessions with
organizers remain useful follow-up work. There is no independent accessibility
certification or measured claim about visitor conversion. The focused browser
runs are not every browser test in the repository.

## Returning to development

Use the existing `main` checkout and inspect it before changing anything:

```sh
git status
git pull --ff-only origin main
npm ci
npm run dev
```

Stop the development server when finished. Run local checks, prepare the static
bundle with `npm run pages:prepare`, commit source and prepared files together,
push `main`, then verify the actual Pages deployment and its assets. Do not
enable CI. Documentation-only updates need no new application build.

Tournament data belongs to its browser profile. A GitHub commit is not a backup
of that data. Export `.tourney` files and keep encrypted-backup secrets separately.
Shared snapshots are independent copies; live updates work only between tabs in
the same browser profile. Browser storage can be cleared or evicted. See
[PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md).
