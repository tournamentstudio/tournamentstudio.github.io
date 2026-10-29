# TournaStudio release handoff

The October 29, 2026 maintenance release adds activity artwork to graphic
exports, reduces startup code, fixes mixed-script poster layout and protects
received share codes when the import screen cannot load.

## Published application

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Game posters and safer local imports](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-10-29.3).
- Publication: GitHub Pages serves the prepared files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Fourteen original activity scenes now appear in scoreboard and champion
exports. Gol Ya Pooch uses closed hands, a bead, a bell, cards and an arch.
Participant logos remain available. Each wrapped SVG line now has its own
position and text direction, fixing mixed Persian/Latin overflow in Firefox
and WebKit without discarding the names.

The Dutch solver loads inside the competition worker when needed. Creation,
imports, storage settings and the advisor also load on demand. Initial home
JavaScript transfer fell from 500,061 to 272,504 bytes, about 46%, in the
recorded localhost setup. Offline caching still includes those modules.
[PERFORMANCE.md](PERFORMANCE.md) records the method and the 512-entrant check.

A scoped import recovery dialog keeps incoming share codes in memory after a
module-loading failure. It supports copying, selected-text fallback, explicit
download, retry and close. Codes are not restored to the URL or persisted to
browser storage. Closing discards the temporary code.

PNG, JPEG and WebP imports receive container and dimension checks before
rendering or decoding. The limits are 16 million pixels and 16,384 pixels per
axis, with a combined animation frame budget. Existing byte limits remain.
The browser decoder still validates compressed pixels.

A complete eight-team Gol Ya Pooch rehearsal covers two groups, semifinals,
a final, hand undo, timer pause, offline scoring, projector updates, private
information exclusion and archive recovery in a fresh browser profile.

The previous releases' result-correction safeguards, timezone review,
transactional saves and bilingual bracket behavior remain in place.
[FEATURES.md](FEATURES.md) records supported behavior; [USER_GUIDE.md](USER_GUIDE.md)
explains operation.

## Local verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,161 tests passed across 98 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed |
| Final browser selection | 80 tests passed across Chromium, Firefox and WebKit |
| Simulated slower mobile check | 1 test passed with 512 entrants and 4x CPU slowdown |
| Prepared publication | 90 application files verified against SHA-256 entries |
| Production dependency audit | Zero advisories |
| Full dependency audit | Four low-severity build-tool entries; see maintenance review |

The final browser selection includes 15 core tournament workflows, exported
SVG/PNG/HTML/slides, the Gol event rehearsal, failed and canceled import loading,
Dutch pairing under the production CSP, vault replacement safety, mixed-script
fields and Persian keyboard/AA checks. Actual desktop and mobile screenshots
were inspected. An earlier Firefox export run had a browser-context teardown
protocol error; its unchanged single-case repeat and the final combined run
passed. Credentials and authored-text scans found no issues in the changes.

Repeat locally after installing the browsers:

```sh
npm run check
npm run test:release
npx playwright test tests/e2e/startup-loading.spec.ts tests/e2e/game-poster-art.spec.ts tests/e2e/event-rehearsal.spec.ts tests/e2e/fide-dutch.spec.ts tests/e2e/import-security.spec.ts tests/e2e/i18n-accessibility.spec.ts tests/e2e/exports.spec.ts
npx playwright test tests/e2e/tournament.spec.ts tests/e2e/mixed-script-fields.spec.ts tests/e2e/performance.spec.ts --project=chromium
npx playwright test --config playwright.performance.config.ts
```

The linked GitHub release records the exact published commit and the results
of post-publication asset and browser verification.

## Review boundaries

Physical Android/iPhone keyboard behavior and spoken Persian with assistive
technology still require those devices and human reviewers. Browser emulation,
keyboard tests, accessibility trees and axe do not replace that work. No
independent security or accessibility certification is claimed.

The dependency review updated `serialize-javascript` to its patched release.
The remaining low-severity `deepmerge` advisory has no patched release at the
time of review and is confined to the local build dependency chain. See
[MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md) and [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Returning to development

Use the existing `main` checkout and inspect it before changing anything:

```sh
git status
git pull --ff-only origin main
npm ci
npm run dev
```

Stop the development server with Ctrl+C when finished. Run the local checks,
prepare the static bundle with `npm run pages:prepare`, commit source and
prepared files together, push `main`, then verify the actual Pages deployment
and its assets. Do not enable CI. Documentation-only updates need no new build.

Tournament data belongs to its browser profile. A GitHub commit is not a
backup of that data. Export `.tourney` files and keep encrypted-backup secrets
separately. Shared snapshots are independent copies; live updates work only
between tabs in the same browser profile. Browser storage can be cleared or
evicted. See [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md).
