# Implementation record

The starting local folder and GitHub repository were empty on 20 October 2026.

- [x] Inspect repository, identity, permissions, and deployment target
- [x] Establish typed domain, validation, and static React application
- [x] Implement and test competition engine, scoring, and scheduling
- [x] Implement IndexedDB persistence, revisions, vaults, and portable data
- [x] Build operator workspace, theme controls, and local presentation
- [x] Exercise offline editing, cross-profile sharing, and privacy boundaries
- [x] Document supported behavior and remaining work
- [x] Finish browser validation, including corrected assertion reruns
- [x] Configure the main-branch GitHub Pages release workflow

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

## Validation checkpoint

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

## Remaining work

The main product gaps are exact stage-slot mappings and wildcard comparison,
aggregate ties, richer battle-royale scoring, complete Persian diagnostics,
event/season collections, large-list rendering, and broader graphic exports.
The feature matrix records narrower UI and format limits in
[FEATURES.md](FEATURES.md).

GitHub Pages routing, base-path handling, and the deployment workflow are
configured. Every main-branch deployment runs the checks and 19 Chromium cases
before publishing. Actual deployment outcomes and source revisions are recorded
in the repository's GitHub Actions runs; a workflow file alone does not prove
that publication succeeded.

User constraints: work on main, keep existing history, use the configured user author, no coauthor trailers, commit subjects under 50 characters.
