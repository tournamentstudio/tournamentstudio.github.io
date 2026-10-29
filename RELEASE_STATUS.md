# TournaStudio release handoff

The October 29, 2026 visual follow-up fixes text collisions with template icons,
podium cards, presentation controls and exported artwork.

## Published application

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Text and artwork spacing fixes](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-10-29.6).
- Publication: GitHub Pages serves the prepared files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Home template cards reserve an arrow lane and place their icons using the
interface direction. Previously, arrows covered Persian captions at mobile
and desktop widths.

Long unbroken theme preview titles wrap inside their cards. Podium places wrap
into rows and retain full names, including four tied first-place entrants.
Presentation controls have a separate row below a named, keyboard-focusable
scrolling region, so they cannot cover the final displayed name. Scenes grow
with their content to keep following sponsor bands separate.

The repeated header in exported graphics uses one measured line. Imported title
newlines no longer extend that header into scores, artwork or slide content.
The complete title remains in the header with normalized whitespace; saved
data, participant names and multiline subtitle behavior are unchanged.

Earlier sharing, recovery, qualification and graphic export fixes remain in
place, along with game artwork and startup improvements. The performance numbers in
[PERFORMANCE.md](PERFORMANCE.md) are tied to that measured commit, not this build.
[FEATURES.md](FEATURES.md) and [USER_GUIDE.md](USER_GUIDE.md) describe the supported
behavior and recovery steps.

## Local verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,188 tests passed across 102 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed; 79 precache entries |
| Browser selection | 115 distinct cases validated across the main run and targeted rerun |
| Cross-browser coverage | 29 cases in Chromium, Firefox and WebKit |
| Existing workflow regression selection | 28 further Chromium cases passed |
| Prepared publication | 90 application files verified against SHA-256 entries |
| Credentials and authored-text scans | No findings in the changes |

The first 115-case run passed 114 cases and caught one Firefox export header
wrapping defect. After that correction, all 36 affected export and long-text
cases passed across the three browsers. The rerun also checks the presentation
scroll region for horizontal overflow. Screenshots of the corrected home cards,
theme preview, podium and exported poster were inspected.

The live baseline passed 39 existing visual tests, but the added intersection
and long-text checks reproduced the defects above. These checks compare actual
text bounds with icon, card, toolbar and artwork bounds after fonts load. Layouts
include English and Persian at 320, 390, 768 and 1280 pixels where relevant.
Background watermarks are intentional; foreground text and controls must remain
readable. This review does not establish every possible content/theme combination.

Repeat the selected checks locally:

```sh
npm run check
npm run test:release
npx playwright test tests/e2e/home-icon-spacing.spec.ts tests/e2e/long-display-text.spec.ts tests/e2e/export-title-lines.spec.ts tests/e2e/rtl-layout.spec.ts tests/e2e/game-icons.spec.ts tests/e2e/game-poster-art.spec.ts tests/e2e/export-card-layout.spec.ts tests/e2e/themes.spec.ts tests/e2e/presentation-list-layout.spec.ts tests/e2e/presentation-localization.spec.ts
npx playwright test tests/e2e/tournament.spec.ts tests/e2e/display-design.spec.ts tests/e2e/assistive-navigation.spec.ts --project=chromium
```

The linked GitHub release records the exact published commit and the results
of post-publication asset and browser verification.

## Review boundaries

Physical Android/iPhone keyboard behavior and spoken Persian with assistive
technology still require those devices and human reviewers. Browser emulation,
keyboard tests, accessibility trees and axe do not replace that work. No
independent security or accessibility certification is claimed.

This follow-up changes no dependencies. The preceding dependency review found
zero production advisories and four low-severity build-tool entries traced to
an unpatched `deepmerge` advisory at that time. See [MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md)
and [ACCESSIBILITY.md](ACCESSIBILITY.md) for the recorded findings and limits.

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
