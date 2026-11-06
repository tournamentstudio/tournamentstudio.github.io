# TournaStudio release handoff

The November 6, 2026 update refines the organizer interface and corrects narrow
screen controls in English and Persian. The tournament engine and saved-document
formats are unchanged.

## Publication

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- GitHub Pages serves prepared files from `main/docs`.
- GitHub Actions remains disabled; there are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Home puts saved tournaments first for returning users. New users get a shorter
introduction and starter formats with actual counts and formats. The bracket
illustration retains its purpose without the rings, glow or tilted cards.
Search stays usable on phones, filters wrap on tablets, and empty search or
favorite lists explain why no tournament matches.

The workspace gives the tournament title priority over theme metadata. A compact
status panel and metric strip bring ready matches higher on the page. Larger
operational text, quieter match cards and one surface per group make results
more readable. A labeled section picker exposes all sixteen sections, beside the
tabs on desktop and below them on small screens.

Presentation puts scene editing before overlay and sponsor tools. Sponsor
controls use the shared button styles. Mobile scene actions move below fields,
so title inputs no longer shrink to a few characters. Sponsor drafts survive
scene changes and both persist after saving.

Creation and studio headings describe their tasks directly in both languages.
Empty name placeholders follow the interface direction; entered English or
Persian names keep automatic direction. The Persian creation counter uses words
to avoid a reversed fraction. Tournament headings have enough line height for
Persian glyphs and long mixed-script names. Original game icons, Gol Ya Pooch themes, keyboard
focus styles and detailed privacy explanations remain.

The prioritized audit and second independent review are in
[UI_REVIEW.md](UI_REVIEW.md). No dependency, competition rule or storage schema
changed in this release.

## Verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed, including the final navigation adjustment |
| Unit and integration suite | 1,233 tests passed across 106 files |
| Release packaging checks | 4 passed |
| Production build | Passed; 80 precache entries |
| Full browser run | 947 passed, 18 failures investigated, 4 existing camera skips |
| Import and backup corrective run | All 24 checks passed across Chromium, Firefox and WebKit |
| Final production-bundle regression run | All 48 checks passed across Chromium, Firefox and WebKit |
| New browser regression cases | 12 bilingual cases added for search, direction, navigation, standings and presentation |
| Responsive review | 48 sampled views at 320, 390, 768 and 1440 pixels, no page-wide overflow |
| Workspace capture matrix | All 16 sections at 390, 768 and 1440 pixels in both languages, 96 views without page-wide overflow |
| Independent accessibility scans | 20 axe A/AA scans reported no violations |
| Prepared publication | 91 local files verified by SHA-256 |
| Credentials and authored-text scan | No findings |

Repeat the checks locally:

```sh
npm run check
npm run test:release
npm run test:e2e
```

Focused regressions live in `tests/e2e/home-refinement.spec.ts`,
`tests/e2e/ui-workspace.spec.ts` and `tests/e2e/presentation-refinement.spec.ts`.
Before and after screenshots are retained in the ignored local audit folder.

The first full run found six tests still selecting the removed duplicate Import
button and twelve instances of Persian title glyphs extending beyond the new
heading line box. The selectors now use the retained Import control; the title
has more line height. The original text-containment assertion is unchanged.
All eighteen failed cases passed in corrective runs. Across the full run and
those reruns, 965 of 969 browser cases passed; four existing camera-mock cases
remain skipped in Firefox and WebKit. The final 48-case run used the rebuilt
production bundle and included every new regression and all long-title RTL cases.

Hosted verification is recorded with the [GitHub releases](https://github.com/tournamentstudio/tournamentstudio.github.io/releases).

## Review boundaries

Passing checks do not establish that every possible input and workflow is free
of bugs. Visual checks used desktop browser engines with resized viewports.
Physical Android/iPhone keyboard behavior and spoken Persian with assistive
technology still need those devices and human reviewers. No independent security
or accessibility certification is claimed.

The earlier participant-count and round-robin corrections remain covered by the
existing suite. See the November 5 entry in [MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md)
for that investigation. No new skips or retries were added for this release.

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

Tournament data belongs to its browser profile. A GitHub commit is not a backup
of that data. Export `.tourney` files and keep encrypted-backup secrets separately.
Shared snapshots are independent copies; live updates work only between tabs in
the same browser profile. Browser storage can be cleared or evicted. See
[PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md).
