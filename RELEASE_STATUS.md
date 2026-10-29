# TournaStudio release handoff

The October 29, 2026 correction release finishes the language and layout review.
The application remains available at [tournamentstudio.github.io](https://tournamentstudio.github.io/).
I can leave it published without running a local development server.

## Published application

- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Language and export corrections](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-10-29).
- Publication: GitHub Pages serves the prepared static files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted application does not need a development server running on my computer.
- The source, tests, deployment files and documentation are committed to `main`.

This release fixes live English/Persian switching in mounted brackets. Default
orientation follows the interface language; a manual choice remains until
Follow language resets it. Names and scores have separate text areas, larger
fonts enlarge cards, and long names retain their full accessible labels.

Editable titles, participant names, rosters and stage names follow the text's
direction. SVG, PNG and print include bundled fonts. Print verifies those fonts
loaded before opening the print dialog. Generated match labels translate in
graphics, schedules, CSV, calendars and presentation slides; organizer labels
and stored competition data remain unchanged.

Shared SVG clipping definitions keep a 512-entry bracket inside the existing
page element-count limit. The older-backup timezone review from the previous
release remains available.

[FEATURES.md](FEATURES.md) records supported behavior.
[USER_GUIDE.md](USER_GUIDE.md) explains operation, and
[ARCHITECTURE.md](ARCHITECTURE.md) describes the module boundaries.

## Local verification

These checks were run locally against the correction build:

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,091 tests passed across 91 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed |
| Final browser regression selection | 46 tests passed across Chromium, Firefox and WebKit |
| Mixed-script form checks | 12 tests passed across Chromium, Firefox and WebKit |
| Prepared publication | 71 application files with SHA-256 entries |

The final browser selection includes 21 language-switch and export cases,
three 512-participant checks, 15 core Chromium workflows and seven WebKit
accessibility interaction cases. Earlier targeted runs also checked display
layouts, mixed-script fields, Persian controls at 320 to 1280 CSS pixels, and
presentation localization. The print-font and SVG element-count failures found
during that work were fixed and their cases passed on the final build.

Core workflows include knockout completion, groups and playoffs, Swiss,
independent snapshot copies, versioned patches, encrypted backup recovery,
safe result correction, confirmed presentation updates and offline scoring.
Desktop and mobile browser screenshots were inspected. Credentials and
authored-text scans found no issues in the release changes.

Repeat the final local checks with:

```sh
npm run check
npm run test:release
npx playwright test tests/e2e/language-switch-layout.spec.ts tests/e2e/performance.spec.ts
npx playwright test tests/e2e/tournament.spec.ts --project=chromium
npx playwright test tests/e2e/assistive-navigation.spec.ts --project=webkit
```

The linked GitHub release records the published commit and post-publication
asset and browser verification. GitHub Actions remains disabled.

## Review boundary

The code fixes identified by the finishing audit are complete. Physical-phone
testing and human review of spoken Persian with assistive technology still need
those devices and reviewers. Browser emulation, keyboard tests, accessibility
trees and axe checks do not replace that work. [ACCESSIBILITY.md](ACCESSIBILITY.md)
records the exact scope; no independent accessibility certification is claimed.

## Returning to development

Use the existing `main` checkout and inspect its state before changing anything:

```sh
git status
git pull --ff-only origin main
npm ci
npm run dev
```

Stop the development server with Ctrl+C when finished. Run the local checks in
[README.md](README.md#run-it-locally) before publishing another application change.
Prepare the static bundle with `npm run pages:prepare`, commit the source and
generated files together, push `main`, then verify GitHub Pages and its asset
paths. Do not enable CI as part of that workflow.

Documentation-only updates do not need a new application build. Keep the prepared
bundle unchanged unless application source or production assets change.

## Data and operating boundaries

Tournament data belongs to the browser profile where it was entered. It is not
stored in this repository, and a GitHub commit is not a tournament backup. Export
`.tourney` files for recovery and keep encrypted-backup secrets separately.
Localhost and the public site use separate browser storage.

Shared snapshots are independent copies. Live updates work between tabs in the
same browser profile; there is no cross-device cloud synchronization. Browser
storage can be cleared or evicted. See [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md)
for the vault and sharing boundaries, and [ACCESSIBILITY.md](ACCESSIBILITY.md)
for the scope of accessibility testing.

Future maintenance can resume from `main` when I return to the project.
