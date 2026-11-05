# TournaStudio release handoff

The November 5, 2026 update corrects participant-count editing and round-robin
settings, and keeps large group draws safe to save and share.

## Published application

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Participant count and group draw fixes](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-11-05.1).
- Publication: GitHub Pages serves the prepared files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Creation and the format advisor require whole participant counts from 2 to 512.
An empty field stays editable instead of becoming zero; a fractional count can
no longer create a silently truncated entrant list. Pasted names determine the
displayed count. Invalid values receive linked English or Persian messages before
continuing, and format-specific limits are checked at the same step.

Reducing the count adjusts group and Swiss defaults after editing. Switching to
Groups or GSL ignores a hidden rounds draft left from another format. Standalone
round robin has one field, GSL has four entrants per group, and manually assigned
groups determine their own count. The structure editor now explains these rules
instead of presenting an ignored group-count setting.

The saved-document schema now accepts the same 1 to 12 meetings supported by the
editor and engine. New groups use A through Z, then AA onward. Large valid draws
no longer generate punctuation or control-character identifiers. Existing valid
legacy identifiers remain unchanged. Unsafe legacy drafts can upgrade only when
result and dependency guards allow it; group qualification references are mapped
by index, and match-result connections must be removed before upgrading.

Ordinary round-robin pairing and isolated group standings were correct in the
unchanged baseline. The investigation added coverage for uneven groups, singleton
BYEs, repeated meetings, scoring, reload and language switching without replacing
that logic. Existing presentation, sharing and layout fixes remain in place.

[FEATURES.md](FEATURES.md), [USER_GUIDE.md](USER_GUIDE.md) and
[DATA_FORMAT.md](DATA_FORMAT.md) describe the supported behavior.

## Local verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,233 tests passed across 106 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed; 80 precache entries |
| Full browser run | 922 passed, 7 fixture setup failures corrected, 4 existing skips |
| New browser regressions | All 60 runs passed across Chromium, Firefox and WebKit |
| Scheduling fixture rerun | 18 tests passed across Chromium, Firefox and WebKit |
| Swiss reset fixture rerun | 6 tests passed across Chromium, Firefox and WebKit |
| Validation layout | English and Persian messages fit at 320 and 1280 pixels in Chromium |
| Prepared publication | 91 files verified by SHA-256; compiled assets match the browser-tested build |
| Credentials and authored-text scans | No findings in the changes |

The first browser run exposed older scheduling fixtures that now require the
explicit legacy-timezone import review, and a Dutch Swiss fixture that omitted
loading the synchronous pairing engine. Correcting their setup restored the
intended test paths without bypassing app validation. See the November 5 entry in
[MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md).

The main run and corrective reruns validate all 929 executed browser cases. Four
camera-mocking runs are intentionally skipped in Firefox and WebKit by the existing
suite; their Chromium versions passed. No new skips or retries were added.

The new participant and group coverage adds 45 unit/integration checks and 20
browser cases. Persian standings and mobile validation screenshots were inspected.

Repeat the checks locally:

```sh
npm run check
npm run test:release
npm run test:e2e
```

The two focused browser files are `tests/e2e/participant-count.spec.ts` and
`tests/e2e/round-robin-groups.spec.ts`. They cover English and Persian, invalid and
boundary counts, format switching, manual and uneven groups, and saved results.
The linked GitHub release records the exact published commit and post-publication
asset and browser verification.

## Review boundaries

Passing checks do not establish that every possible input and workflow is free of
bugs. Physical Android/iPhone keyboard behavior and spoken Persian with assistive
technology still require those devices and human reviewers. No independent
security or accessibility certification is claimed.

This update changes no dependencies. The October 29 dependency review found zero
production advisories and four low-severity build-tool entries traced to a
`deepmerge` advisory at that time. See [MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md)
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
