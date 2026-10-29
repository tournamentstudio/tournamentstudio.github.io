# TournaStudio release handoff

The October 29, 2026 follow-up fixes save recovery, canceled imports, wildcard
comparisons, ladder withdrawals and long-text graphic exports.

## Published application

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Safer recovery and tournament corrections](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-10-29.4).
- Publication: GitHub Pages serves the prepared files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Pending saves block route changes and competing imports. Failed saves keep their
recovery copy until it is resolved or explicitly discarded before leaving.
Reloading the confirmed document resets editor drafts. Browser close/reload
warnings are best effort; app updates wait for recovery. Vault locking still
clears decrypted drafts, including recovery copies.

An image upload finishing during another save can be rejected because a write
is already in progress. Its newer recovery candidate now remains exportable
whether the earlier save succeeds or fails. The two edits are not silently
merged, and the confirmed database state stays separate from the recovery file.

Closing a timezone import during preparation now prevents it from starting a
write. An already-started write may finish, but cannot reopen the dismissed
workspace or close a newer import draft. The checks also cover automatic vault
lock and delayed encrypted persistence.

Wildcard score and differential comparisons now follow lower-is-better weighted
rules for totals, per-match values and retained group results. New alternating
challenge rounds exclude withdrawn and disqualified entrants without erasing
history. The last two active entrants still pair on an offset round.

Sponsor slide exports grow their cards and rows around wrapped bilingual names
and logos. Compact overlay headers grow with long tournament titles, keeping
entrant cards separate. All three browser engines checked the actual exported
SVG geometry with the bundled fonts.

The previous release's game artwork, startup improvements, Gol Ya Pooch event
rehearsal and image-import limits remain in place. The performance numbers in
[PERFORMANCE.md](PERFORMANCE.md) are tied to that measured commit, not this build.
[FEATURES.md](FEATURES.md) and [USER_GUIDE.md](USER_GUIDE.md) describe the supported
behavior and recovery steps.

## Local verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,175 tests passed across 100 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed; 79 precache entries |
| Final browser selection | 67 tests passed |
| Cross-browser coverage | Ten new cases in Chromium, Firefox and WebKit |
| Existing workflow regression selection | 37 Chromium cases passed |
| Prepared publication | 90 application files verified against SHA-256 entries |
| Credentials and authored-text scans | No findings in the changes |

The browser checks cover quota failures, browser departure, recovery archive
contents, pending uploads, canceled timezone imports, vault locks, sponsor
layouts, overlay titles and Persian mobile recovery. Existing workflows cover
full tournaments, sharing, patches, same-revision conflicts, legacy timezone
review, vault security, presentation updates and offline operation. Actual export
and 320-pixel Persian dialog screenshots were inspected.

The new upload tests reproduced both original failures before the fix. Canceled
import tests also reproduced the prior release's failures. Earlier sponsor
capture stalled after the exported geometry checks had passed; capture now uses
an HTML wrapper with bounded waits, and the final combined run passed.

Repeat the selected checks locally:

```sh
npm run check
npm run test:release
npx playwright test tests/e2e/save-recovery.spec.ts tests/e2e/import-cancellation.spec.ts tests/e2e/export-card-layout.spec.ts tests/e2e/concurrent-save-recovery.spec.ts
npx playwright test tests/e2e/startup-loading.spec.ts tests/e2e/tournament.spec.ts tests/e2e/same-revision-conflicts.spec.ts tests/e2e/legacy-timezones.spec.ts tests/e2e/vault-inactivity.spec.ts tests/e2e/import-security.spec.ts --project=chromium
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
