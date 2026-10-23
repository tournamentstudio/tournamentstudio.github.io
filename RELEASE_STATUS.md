# TournaStudio release handoff

I am closing the current development cycle on October 22, 2026. The published
application remains available at [tournamentstudio.github.io](https://tournamentstudio.github.io/).
Development is on hold until I choose to return to it.

## Published application

- Repository: [tournamentstudio/tournamentstudio.github.io](https://github.com/tournamentstudio/tournamentstudio.github.io).
- Tested application commit: [`705a609`](https://github.com/tournamentstudio/tournamentstudio.github.io/commit/705a6090225363fdf45e3b4a028f92a99a358ea4).
- Publication: GitHub Pages serves the prepared static files from `main/docs`.
- GitHub Actions is disabled. There are no repository CI workflows.
- The hosted application does not need a development server running on my computer.
- The source, tests, deployment files and documentation are committed to `main`.

The final application change adds review of older backup times before import.
Organizers can choose source timezones, edit clock times, resolve daylight-saving
ambiguities and retain the original revision. Existing explicit offsets and
verified update packets stay unchanged. Corrected imports use save or fork to
preserve recovery history.

[FEATURES.md](FEATURES.md) records supported behavior.
[USER_GUIDE.md](USER_GUIDE.md) explains operation, and
[ARCHITECTURE.md](ARCHITECTURE.md) describes the module boundaries.

## Verification at closeout

These checks were run locally for the application release above:

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and integration suite | 1,061 tests passed across 89 files |
| Release packaging checks | 4 tests passed |
| Production build | Passed |
| Import, history, timezone and core browser regression selection | 117 tests passed across Chromium, Firefox and WebKit |
| Published-site regression selection | 39 Chromium tests passed |
| Published asset verification | All 71 files matched the prepared bundle |

Browser coverage included encrypted backup recovery, unchanged update packets,
cross-profile transfer, original revision recovery, offline import, local
presentation updates and Persian layouts at 320px and 390px. The Persian timezone
review also passed automated accessibility checks. These results are a dated
release record, not a claim of independent accessibility certification or a
guarantee about future browser changes.

The public site returned HTTP 200 with working manifest, icons and service worker.
The production smoke check found no page errors, failed assets or external
runtime requests. Credentials and authored-text scans found no issues in the
release changes.

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
