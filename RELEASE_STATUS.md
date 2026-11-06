# TournaStudio release handoff

The November 6, 2026 workflow review focuses on the words and controls organizers
use to create tournaments, enter results and share their work. I compared the
existing app with official public documentation from Bracket HQ, Challonge,
Tournify and Toornament. The findings, references and second independent review
are in [UX_REVIEW.md](UX_REVIEW.md).

## Publication

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- GitHub Pages serves prepared files from `main/docs`.
- GitHub Actions remains disabled; there are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Creation shows settings that affect the chosen format, explains seeding and
qualification, and catches duplicate names before the last step. Hidden invalid
round values no longer block switching to a format that does not use them.
Tablet layouts give the form enough room.

Matches now filter by stage. Generate next round appears only for formats that
need it and explains why it is unavailable while results are outstanding.
Enter result, Save result and Save changes describe their actual actions.
Set scoring is visible without opening referee details. Editing ordinary scores
recalculates the winner; manual decisions and forfeits keep their explicit
winner. Upstream corrections still require review before clearing later results.

Sharing starts with one guided choice and names the output before creating it.
Advanced controls remain available under More sharing options. Generated output
receives focus; copy feedback identifies the link or code. Import explains
independent copies, later updates and existing tournament identities. Its file
picker is keyboard accessible. Public tournament JSON is distinguished from a
private recovery backup.

Help follows five organizer tasks. Mobile Help and Import close the navigation
drawer before opening. Import also restores focus after its lazy loading dialog
is replaced, including WebKit. English and Persian describe the same actions.
The README screenshot shows the actual app with fictional tournaments.

No dependency, competition rule, cryptography or stored-data format changed.
The previous competition artwork and visual identity remain intact.

## Verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,236 tests passed across 107 files |
| Release packaging checks | 4 passed |
| Production build | Passed; 82 precache entries |
| Initial broad browser run | 246 passed; seven stale command assertions investigated across 253 Chromium cases |
| Initial cross-engine workflow run | 54 passed; two WebKit importer focus failures reproduced across 56 cases |
| Final production-bundle correction run | 26 of 27 passed; the remaining Firefox case passed unchanged in isolation |
| Firefox diagnostic repeats | Three serial repeats passed; parallel repeats had two passes and one internal browser protocol failure |
| New workflow regressions | 28 bilingual cases across creation, results, sharing and help |
| Visual review | Creation, Matches, Share, Import and Help in English and Persian at phone, tablet and desktop widths |
| Responsive regression | Persian mixed-script workflows checked at 320, 390, 768 and 1280 pixels |
| Accessibility | Dialog, focus, keyboard and scoped axe checks on the changed workflows |
| Prepared publication | 93 local files verified by SHA-256 |

Repeat the checks locally:

```sh
npm run check
npm run test:release
npm run test:e2e
```

New regressions live in `tests/e2e/ux-creation.spec.ts`,
`tests/e2e/ux-match-controls.spec.ts`, `tests/e2e/ux-sharing.spec.ts` and
`tests/e2e/ux-help.spec.ts`. Existing browser tests use the new command labels
and explicitly open the advanced sharing controls when testing those tools.
Before and after screenshots and logs are retained in the ignored local audit
folder.

The initial cross-engine run reproduced a WebKit focus problem when closing a
freshly loaded importer from mobile navigation. The correction restores the
navigation trigger after the importer closes. Regression tests exercise both
Escape and the close button, with cold and warm module loading.

All seven outdated command assertions were updated and passed against the final
bundle. A Firefox case exceeded the workspace-load deadline once; its asset
requests succeeded and an unchanged isolated run passed. Repeated parallel checks
then found a different Firefox automation error while axe closed its temporary
page, with an internal `Browser.removeBrowserContext` error. These observations
are retained in the test logs rather than treated as application fixes. No
timeouts or retry settings were relaxed.
Three further serial Firefox runs passed the same creation, scoring, keyboard,
accessibility and reload checks without code changes.

The focused browser runs cover the changed screens and existing tournament,
sharing, vault, offline, accessibility, keyboard and RTL workflows. They are
not a rerun of every browser test in the repository. Hosted verification is
recorded with the [GitHub releases](https://github.com/tournamentstudio/tournamentstudio.github.io/releases).

## Review boundaries

Passing checks do not establish that every possible input and workflow is free
of bugs. Visual checks used desktop browser engines with resized viewports.
Physical Android/iPhone keyboard behavior and spoken Persian with assistive
technology still need those devices and human reviewers. No independent security
or accessibility certification is claimed. Competitor research used public
pages and documentation, not account-based trials. Usability sessions with
tournament organizers remain useful follow-up work.

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
