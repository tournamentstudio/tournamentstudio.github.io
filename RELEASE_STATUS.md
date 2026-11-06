# TournaStudio release handoff

The second November 6, 2026 design pass gives the interface the character of
competition programs, fixture sheets and scorecards. English and Persian keep
the same functions and data. The tournament engine and saved-document formats
are unchanged.

## Publication

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- GitHub Pages serves prepared files from `main/docs`.
- GitHub Actions remains disabled; there are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Home uses illustrated competition covers and a factual first-use program. The
library stays first for returning users. Fourteen original SVG scenes extend
the existing game icons into courts, boards and tabletop compositions. Gol Ya
Pooch uses closed fists, a separate bead, bell, cards and an arch. Protected
library entries reveal no sport or format. Artwork receives no match state.

The match desk groups fixtures by stage and round, with aligned scorecard rows.
Completed tournaments show recorded final results and a champion report. Title
and champion presentation scenes use a program spread, current matches use a
scorecard, and recent results use a fixture sheet. Draw ceremonies have a reveal
ticket and progress based on actual assignments. Theme overrides still apply.

Warm paper surfaces and ruled navigation connect the working pages. Artwork has
its own space, leaving long English, Persian and mixed-script names readable.
The README screenshot shows the actual updated app with fictional tournaments.

Validation corrected a tablet list-view layout, a Home/presentation CSS class
collision, bracket zoom contrast, and a status badge splitting a word beside
long titles. Recent results now respect the Show scores setting; this was a
pre-existing presentation defect. Regression tests cover both languages.
Long names also no longer squeeze large result scores into vertical digits on
narrow screens. The final regression checks nine-digit scores and language
switching in all three browser engines.

The prioritized audit and second independent review are in
[UI_REVIEW.md](UI_REVIEW.md). No dependency, competition rule or storage schema
changed in this release.

## Verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,236 tests passed across 107 files |
| Release packaging checks | 4 passed |
| Production build | Passed; 80 precache entries |
| Initial browser regression run | 276 passed; six failures investigated across 282 cases in 21 files |
| Final production-bundle correction run | All 36 cases passed across Chromium, Firefox and WebKit |
| New browser regression cases | 16 bilingual cases for covers, scorecards, completion, draw progress and presentation |
| Independent visual review | 80 sampled views in both languages at 320, 390, 768 and 1440 pixels, no page-wide overflow |
| Workspace capture matrix | All 16 sections at 390, 768 and 1440 pixels in both languages, 96 views without page-wide overflow |
| Independent accessibility scans | 20 axe A/AA scans reported no violations |
| Presentation specialist checks | 50 captures including 4:3 and portrait; 40 axe and reduced-motion checks passed |
| Prepared publication | 91 local files verified by SHA-256 |
| Credentials and authored-text scan | No findings |

Repeat the checks locally:

```sh
npm run check
npm run test:release
npm run test:e2e
```

New regressions live in `tests/e2e/home-program-covers.spec.ts`,
`tests/e2e/workspace-art-direction.spec.ts` and
`tests/e2e/competition-moments.spec.ts`.
Before and after screenshots are retained in the ignored local audit folder.

The focused browser run covers the changed screens and existing tournament,
sharing, vault, offline, accessibility, keyboard and RTL workflows. It is not a
rerun of every browser test in the repository. The earlier full-suite results
remain in [release-2026-11-06.1](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-11-06.1).

An initial unit assertion expected a score element without its new CSS class.
Two new draw tests initially imported a generated bracket, which correctly
locked the draw preview. Two older result-list tests expected the previous
combined score markup. Their fixtures and semantic assertions were corrected;
long-name containment assertions were retained and extended to entrant rows.
The new score-readability assertion also reproduced the narrow-screen score
problem against the earlier build. Its CSS correction passed a separate six-case
run across Chromium, Firefox and WebKit before the final production rebuild.
The rebuilt bundle then passed all 36 presentation and result-list cases, covering
all six initial failures. Across the initial and corrective runs, all 282 targeted
cases passed. No skips or retries were added.

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
