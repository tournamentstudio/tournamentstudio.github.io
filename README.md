# TournaStudio

I built TournaStudio so a tournament can belong to the people running it. Open the app, make a draw, record results, and take the whole competition with you as a file. There is no account, subscription, or application server.

**[Open TournaStudio](https://tournamentstudio.github.io/)** · [User guide](USER_GUIDE.md) · [Feature status](FEATURES.md)

![TournaStudio home with its local tournament library](docs/screenshots/home.png)

The application is a static React and TypeScript bundle hosted on GitHub Pages. Tournament documents live in IndexedDB. After a successful initial cache, the app works offline. Every production font, icon, and library ships with the build.

## What you can run

- Single elimination with arbitrary fields up to 512 entrants, automatic BYEs, third place, and safe result corrections.
- True double elimination with loser drop paths and a conditional grand-final reset.
- A documented progressive three-loss elimination policy.
- Round robin, balanced uneven groups, GSL groups of four, Swiss, and qualifying stages feeding playoffs.
- Multiple qualifying sources, exact cross-group bracket slots, and wildcard comparisons by totals, per-match values or retained group results.
- Multi-entrant free-for-all heats, time trials, Grand Prix points, gauntlets, and an adjacent-challenge ladder.
- Schedules with multiple resources, rest periods, referee conflicts, and CSV or calendar export.

These are defined local rulesets, not claims of federation certification. Swiss uses score-based constrained pairing. Three-loss elimination uses dynamic rounds rather than a universal fixed bracket. The ladder uses adjacent challenges. Exact policies and limits are in [ARCHITECTURE.md](ARCHITECTURE.md).

## At the tournament desk

Quick Create accepts numbered entrants or pasted names. The workspace includes participant rosters, check-in, match control, standings, a stage graph, schedules, statistics, rules, themes, presentation, portable sharing, offline registration/result exchange, revision history, and vault settings.

English and Persian labels, local Inter and Vazirmatn fonts, and RTL layouts are included. The interface is designed for desktop and phones. Some engine validation messages remain English. [FEATURES.md](FEATURES.md) records that limitation along with other partial features.

The 50 theme presets include game collections for all 14 activities. Original court diagrams, paddles, chess pieces, Persian geometry and other vector artwork sit on paper, wood, felt, tile and other material treatments. Theme Studio recommends related choices and lets you search the full catalog. The selected identity appears in creation, the workspace, match cards and scorekeeping.

Presentation Studio has 17 scene types, playlists, keyboard controls, fullscreen, and three aspect ratios. A second tab in the same browser profile reloads confirmed revisions. That is local communication, not synchronization across devices.

Gol Ya Pooch has a three-player default roster, editable target and hand points, configurable cards with use limits, a quick score form, and a hand-by-hand referee form. Its scorecards show progress toward the configured target. Public projections contain live totals but exclude hand logs and concealed positions. Traditional, Modern, Night, Saffron, Courtyard, Velvet and Ink House themes also work in presentation mode. Both sides receive identical decorative emblems, independent of concealed gameplay information.

![Gol Ya Pooch theme collection in TournaStudio](docs/screenshots/gol-theme-gallery.png)

## Run it locally

Use Node.js 22.12 or later and npm.

```sh
npm ci
npm run dev
```

The development server binds to `127.0.0.1`. No environment secrets or external services are required.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests use the production bundle at port 4173. Run the build first. `playwright.config.ts` defines the browser projects. The deployment workflow runs Chromium; local Firefox and WebKit runs can be selected by project.

For a local production preview:

```sh
npm run preview -- --port 4173
```

## Keep and share your data

Confirmed writes create a new revision inside an IndexedDB transaction. The last 50 compressed revision snapshots are retained. Competing tabs use revision checks, and a rejected save offers a recovery export. Trash is recoverable until explicitly purged.

Share Center offers:

- A public data-bearing snapshot link or `TS1` text code.
- A full `.tourney` backup, optionally encrypted with a separate secret.
- A `TSR1` recipe with structure and settings rather than results.
- A `TSP1` update packet for an exact prior revision.
- SVG and PNG brackets, CSV tables, calendar files, and print output. PDF uses the browser's Save as PDF option.

Snapshot links carry their data in the URL fragment. An arbitrary local ID cannot retrieve another person's tournament. Recipients have independent copies, and distributed snapshots cannot be revoked. A read-only preview does not prevent copying.

Protected vaults use Web Crypto AES-GCM and PBKDF2-SHA-256 with 600,000 iterations and random salts/nonces. The secret stays in memory while unlocked. Titles and private document fields are encrypted in storage. There is no password reset or remote recovery. Export an encrypted backup and keep its secret separately.

Browser storage can be lost through data clearing, eviction, private browsing, or device loss. Use Storage Health and export backups. Encryption cannot protect data from someone already using an unlocked session. Details are in [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md) and [DATA_FORMAT.md](DATA_FORMAT.md).

## Deploy to GitHub Pages

The `main` branch is the source of truth. `.github/workflows/deploy.yml` installs dependencies, checks types and lint, runs unit tests, builds, runs Chromium flows, and deploys the `dist` artifact with the official Pages action.

For a fork, enable **Settings > Pages > Build and deployment > GitHub Actions**. Repository administration permission is needed for that setting.

`vite.config.ts` reads `GITHUB_REPOSITORY` during CI. Repositories ending in `.github.io` use `/`; project repositories use `/<repository>/`. Hash routes keep refreshes and snapshot links compatible with static hosting. Share links derive their origin and path from the running app.

The service worker caches the application shell and bundled assets. It offers an update prompt and does not remove the tournament database. Local preview and GitHub Pages use separate browser storage because they have different origins.

## Project map

`src/domain` defines and validates data. `src/engine`, `src/scoring`, `src/standings`, and `src/scheduling` implement competition rules independently of React. `src/persistence` handles local transactions. `src/security` and `src/sharing` handle untrusted imports and portable packages. `src/themes`, `src/presentation`, and `src/export` render public views. `src/app` connects these modules to the interface.

See [ARCHITECTURE.md](ARCHITECTURE.md) for contracts and [FEATURES.md](FEATURES.md) for the full status matrix.

## Practical boundaries

There is no hosted registration service, account system, payment processing, cloud storage, or cross-device live collaboration. Registration and scorekeeper responses are explicit file exchanges.

Some requested capabilities remain unfinished: pot and geographic draw restrictions, two-legged ties, full season/event records, prediction brackets, XLSX, slide-file exports, advanced broadcast overlays, and parts of the theme editor. Counts are capped at 512 entrants and 20,000 matches per document. A 512-entrant round robin exceeds the match cap; the limit is not a promise that every format supports the same field size.

Modern Chromium, Firefox, and WebKit are the browser targets. PWA installation and persistent-storage permission vary by browser. A secure context is required for crypto and service workers; HTTPS and localhost qualify.

## License

The application is MIT licensed. See [LICENSE](LICENSE). Bundled fonts use the SIL Open Font License. Dependency acknowledgments are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
