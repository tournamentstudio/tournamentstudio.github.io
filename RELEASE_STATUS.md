# TournaStudio release handoff

The October 29, 2026 follow-up fixes stale sharing output, canceled private
downloads, delayed workspace edits, placement validation and presentation lists.

## Published application

- App: [tournamentstudio.github.io](https://tournamentstudio.github.io/).
- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Release: [Sharing safety and presentation fixes](https://github.com/tournamentstudio/tournamentstudio.github.io/releases/tag/release-2026-10-29.5).
- Publication: GitHub Pages serves the prepared files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted app needs no development server running on my computer.

## What changed

Generated codes now belong to their exact document and sharing settings. Changing
privacy, encryption or transfer options hides stale output and cancels pending
generation. Output labels state its actual privacy and protection. Pending
private backup, revision and multipart QR downloads stop when their screen
closes or the vault locks. Files already sent to the browser cannot be recalled.

Signing keeps its chosen input fixed until the operation finishes. Previously,
the generated-code button could replace the displayed input while its old
contents were being signed.

Workspace callbacks reject delayed edits from an earlier session, including
when the same tournament is reopened after leaving, locking or reloading a
saved version. Ordinary edits retain their session undo history.

Supplied placement tables now pass the same validation before every scoring
branch and during import. This prevents incomplete manual rulings from creating
invalid standing points. Absent optional ranks and valid tied ranks remain
supported.

Live participant, result and schedule lists wrap long names, scores and resource
labels inside their cards. Tests switch English and Persian in both directions
and check mobile and projector widths. The full content remains available.

The previous release's recovery, qualification and graphic export fixes remain
in place, along with game artwork and startup improvements. The performance numbers in
[PERFORMANCE.md](PERFORMANCE.md) are tied to that measured commit, not this build.
[FEATURES.md](FEATURES.md) and [USER_GUIDE.md](USER_GUIDE.md) describe the supported
behavior and recovery steps.

## Local verification

| Check | Actual result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,185 tests passed across 101 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed; 79 precache entries |
| Final browser selection | 88 tests passed |
| Cross-browser coverage | 15 cases in Chromium, Firefox and WebKit |
| Existing workflow regression selection | 43 further Chromium cases passed |
| Prepared publication | 90 application files verified against SHA-256 entries |
| Credentials and authored-text scans | No findings in the changes |

The new browser checks hold encryption, image decoding, QR rendering and signing
until after the relevant user action. They reproduced stale output, private
downloads, a mismatched signing input and edits from closed sessions before the
fixes. Presentation checks retain full mixed-script names and exact scores at
320 and 1280 pixels. Actual English and Persian screenshots were inspected.

The first combined browser run caught a WebKit revision-download race after DOM
removal. Unmount guards now run in layout cleanup. Five focused repetitions and
the final 88-case selection passed with the original cancellation assertions.

Repeat the selected checks locally:

```sh
npm run check
npm run test:release
npx playwright test tests/e2e/workspace-session.spec.ts tests/e2e/sharing-output-safety.spec.ts tests/e2e/presentation-list-layout.spec.ts tests/e2e/signatures.spec.ts
npx playwright test tests/e2e/tournament.spec.ts tests/e2e/history-commands.spec.ts tests/e2e/transfer-tools.spec.ts tests/e2e/qr-transfer.spec.ts tests/e2e/display-design.spec.ts tests/e2e/save-recovery.spec.ts tests/e2e/concurrent-save-recovery.spec.ts tests/e2e/import-cancellation.spec.ts --project=chromium
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
