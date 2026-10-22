# Implementation record

The starting local folder and GitHub repository were empty on 20 October 2026.

- [x] Inspect repository, identity, permissions, and deployment target
- [x] Establish typed domain, validation, and static React application
- [x] Implement and test competition engine, scoring, and scheduling
- [x] Implement IndexedDB persistence, revisions, vaults, and portable data
- [x] Build operator workspace, theme controls, and local presentation
- [x] Exercise offline editing, cross-profile sharing, and privacy boundaries
- [x] Document supported behavior and platform boundaries
- [x] Finish browser validation, including corrected assertion reruns
- [x] Configure local builds and GitHub Pages publication from main/docs

## Working implementation

The engine supports single and double elimination, the documented progressive
three-loss policy, round robin, groups, GSL groups, Swiss, free-for-all heats,
gauntlets, adjacent challenge ladders, time trials, and Grand Prix points.
Source stages can feed a knockout draw after qualification is resolved.
Corrections calculate downstream impact and retain recovery data before
invalidating played dependents.

The document limit is 512 entrants and 20,000 matches; standalone round robin
is capped at 128 entrants. Swiss uses bounded rematch-free pairing and reports
an impossible or search-limited draw. These limits do not promise equal browser
performance across formats or devices.

The workspace includes participants and rosters, rules, schedules, standings,
statistics, theme and presentation editors, and Gol Ya Pooch referee controls.
Portable links, text codes, archives, recipes, exact-base update packets, and
manual registration/result packets work without a backend. Vault documents and
their revision snapshots are encrypted. Public projections exclude referee
secrets and private notes.

## Initial validation checkpoint

As of 20 October 2026:

- `npm run check` passed type checking, lint, 128 unit/integration tests,
  and the production build.
- The engine subset passed 57 tests, including irregular brackets through 512
  entrants and randomized double-elimination outcomes.
- All 57 browser cases passed across Chromium, Firefox, and WebKit after
  targeted reruns. The combined run passed 53 cases; four import-security
  assertions needed a corrected selector and passed with
  `npm run test:e2e -- --last-failed`.
- Automated accessibility checks found no violations in the tested home,
  operator sections, and score dialog. This is not a certification of every
  theme or possible user configuration.
- `npm audit` reported zero known vulnerabilities. Source scans found no
  embedded credentials or third-party contact data.
- Root and project-site production base paths were checked. Desktop and
  mobile screenshots were inspected.

Browser cases cover completed 13-entrant knockouts, 16-team groups and playoffs,
Gol Ya Pooch groups and playoffs, Swiss with 17 entrants and five rounds,
cross-profile imports, encrypted recovery, update conflicts, safe corrections,
local presentation updates, Persian mobile layout, and cached offline editing.

## Completion checkpoint, 21 October 2026

The initial stage-slot, wildcard, aggregate, battle-royale, localization,
collection, rendering and export gaps were implemented in later revisions.
Multi-format predictions, private player observations, signed packets and
organizer-entered travel networks are also working. [FEATURES.md](FEATURES.md)
records each supplied policy and its bounds.

The final two partial feature rows have working implementations:

- FIDE Dutch 2026 uses the compiled local BBP engine with a pinned exchange-order
  correction. It retains pairing numbers, assigns opponents and colors together,
  handles withdrawals and zero-credit late entry, and runs in cancelable workers.
- Mobile focus containment, inert backgrounds, current-page semantics, route
  titles/focus, section announcements and public scoreboard announcements are
  implemented for English and Persian. Browser accessibility-tree assertions and
  keyboard tests cover their behavior.

New regression coverage also checks fresh-season resets, Swiss correction
recovery, source qualifier changes and recipes with subsets or manual order.
Previous policies remain recoverable when an upstream correction invalidates a
Swiss stage. Repeated events keep player metric definitions and clear last
season's observations.

Local type checking, lint, production build and all 991 unit/integration tests
passed. The full Chromium, Firefox and WebKit run passed 595 cases, with two
camera-fixture cases skipped on Firefox and WebKit. All 150 rounds in 30
deterministic tournaments matched native BBP opponents and colors. The final
27-case structure/acceleration/reset run passed in all three browsers, including
six new checks for resetting and redrawing qualified Swiss entrants. Separate
golden fixtures cover the intentional local
exchange-order correction. The 21 focused pairing/worker browser cases passed
in Chromium, Firefox and WebKit, including cached offline generation and
cross-profile reconstruction. A 512-player engine check completed six rounds;
draws took 5.3 to 8.9 seconds on the local desktop, which is why browser work is
cancelable and isolated from the interface.

No software feature row is currently marked partial or unimplemented. Static
hosting excludes central accounts, remote synchronization and password recovery.
FIDE endorsement, human assistive-device speech-quality audits and independent
certification are not claimed. These are external verification boundaries,
not hidden implementations.

GitHub Actions is disabled. There are no repository CI workflows. Tests and
builds run locally; GitHub Pages publishes the checked-in static output from
`main/docs`. A release is verified by its Pages deployment state and the hashes
of the files served at the production URL.

User constraints: work on main, keep existing history, use the configured user author, no coauthor trailers, commit subjects under 50 characters.

## Post-release audit, 21 October 2026

The audit reproduced and corrected these defects:

- Persian card names containing half-spaces could widen a 320-pixel screen to
  405 pixels. Fieldsets now shrink within their parent and legends wrap. Mobile
  roster names use a full row, with role and removal controls underneath.
- Presentation schedules and correction reviews displayed generated English
  match labels in Persian mode. They now use the shared label translator.
  Countdown seconds, rule values and revision numbers use localized digits.
- Bracket panning and table arrow keys could change the presentation scene.
  Scene shortcuts now respect nested controls, and Persian scene direction
  matches the arrow buttons. Broadcast scores have public status announcements.
- A delayed file import could replace the preview of a newer selection or
  display an obsolete error. Results are bound to the selected input and current
  document; changing either invalidates pending work.
- Document saves and vault transitions could overwrite concurrent favorite,
  trash, restore and backup changes. The final IndexedDB transaction now retains
  the current library metadata.
- A new schedule's UTC start was interpreted as local wall time. New starts now
  include their UTC suffix. Start and resource availability inputs convert
  absolute timestamps to device-local time, and edited values retain their
  instant across devices. Legacy zone-less timestamps retain their interpretation.

Regression tests cover these cases, including saving and reloading Persian
forms, delayed valid and invalid imports, and concurrent library operations.
The feature matrix retains its stated format and static-hosting limits.

The audit browser run passed 631 cases with two camera-fixture skips. After the
timezone correction, the rebuilt bundle passed all 120 affected scheduling and
core tournament checks across Chromium, Firefox and WebKit. The final source
passed 1,005 unit/integration tests, TypeScript checking, lint and production
build. All four release tests passed; the production dependency audit reported
zero vulnerabilities. GitHub CI remains disabled.
