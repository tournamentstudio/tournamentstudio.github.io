# Pétanque standings review

Reviewed November 7, 2026 against the club organizer's supplied scoring policy.
This review covers that policy, not a federation's complete ruleset.

## Finding

The existing standings engine already supports the requested descending order:
`wins`, `differential`, `scored`. It totals completed results and preserves shared
ranks when those criteria are equal. There was no arithmetic defect in the
supplied six-game example. Normal tied scores were already rejected when draws
were disabled.

The difficulty was configuration and presentation. No Pétanque preset selected
the policy; generic defaults included standings points before wins. The Rules
editor called the whole ranking order a list of tiebreakers. The table emphasized
generic points, and exported graphics omitted the evidence for the three club
criteria.

## Changes

- Added the Pétanque preset with no draws and exactly the three club criteria.
  Creation suggests round robin and preserves an explicitly chosen format.
- Made the ranking order visible above Pétanque round-robin and group tables.
  Groups share one explanation. Columns show wins, losses, point difference,
  scored and conceded totals. Recorded historical draws remain visible.
- Renamed the Rules controls to Ranking order and explained cumulative scores,
  separate standings points, shared ranks and the effect of changing rules.
- Kept the target score editable and advisory. A decisive score need not reach
  13. The tied-score error now asks for the agreed final score after resolution.
- Added the three actual totals to Pétanque standings SVG/PNG output. Other
  activities retain their existing export rows.
- Added bilingual labels, wrapping ranking controls, isolated numeric direction
  and a local boules-and-jack icon. Existing Editorial and Minimal Light themes
  are available as related choices.

No engine algorithm, stored schema, result history or public function signature
was replaced. Other sport presets keep their rules. Old generic tournaments are
not silently converted; the user guide explains how to configure them.

## Reproduced results

Games: A 13-5 B; A 13-8 C; D 13-6 A; B 13-7 C; B 13-5 D; C 13-9 D.

| Rank | Entrant | Wins | Losses | Scored | Conceded | Difference |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A | 2 | 1 | 32 | 26 | +6 |
| 2 | B | 2 | 1 | 31 | 25 | +6 |
| 3 | D | 1 | 2 | 27 | 32 | -5 |
| 4 | C | 1 | 2 | 28 | 35 | -7 |

A precedes B on the third criterion; D precedes C on the second. A three-player
cycle with equal totals retains shared first place. No seed-based winner is
introduced.

## Regression coverage

- `src/standings/petanque.test.ts`: 25 tests for the example, criterion order,
  negative differences, equal ranks, incomplete games, BYEs, group isolation,
  administrative results, saved revisions and portable roundtrips.
- `src/sports/petanque.test.ts`: five tests for preset isolation, no draws,
  editable targets, saved presets and post-play replacement protection.
- `src/components/StandingsTable.test.ts`: 11 tests for ranking labels, columns,
  historical draws, shared ranks, special formats and group summary placement.
- `src/export/visuals.test.ts`: three added tests for English/Persian Pétanque
  totals, shared ranks, long mixed-script names and unchanged generic output.
- `tests/e2e/petanque.spec.ts`: four browser workflows for creation, all six saved
  results, equal-score rejection, shared ranks, rule edits, reload, SVG download,
  fresh-browser sharing, groups and responsive English/Persian layouts.

## Boundaries

- Administrative forfeits and explicit manual rulings are separate from normal
  played scores. Organizers remain responsible for agreeing such decisions.
- Turning draws off does not rewrite an older recorded draw. Correct that result
  explicitly if necessary. Rules remain locked after dependent-stage generation.
- Equal ranks at a qualification cutoff require an agreed resolution before
  advancing entrants. Cross-group comparison policies remain configurable.
- Standings CSV keeps its existing columns for compatibility. It includes wins,
  scored and conceded values; their difference can be calculated from the file.
- Phone tables scroll within a labeled region. Names and explanations align to
  the reading direction; numeric columns and compact controls stay centered.
- These checks cover the recorded workflows and viewport sizes. They do not
  establish that every possible configuration is free of defects.

See [USER_GUIDE.md](USER_GUIDE.md#run-a-p%C3%A9tanque-tournament) for organizer steps.

## Executed verification

`npm run check` passed TypeScript, ESLint, 1,389 unit/integration tests across
115 files and the production build. `npm run test:release` passed all four
publication-packaging tests. The prepared site contains 93 files, with 82
service-worker precache entries.

`npm run test:e2e -- tests/e2e/petanque.spec.ts --workers=1` passed 12 cases
across Chromium, Firefox and WebKit. It includes 18 accessibility scans against
WCAG AA rules, 72 responsive screenshots and three export previews. No page
errors, detected AA violations, page overflow or clipped controls were found.
Manual review covered standings, Rules and result dialogs in English and Persian
at 320, 390, 768 and 1280 pixels, plus the exported graphic.

A separate production-bundle Chromium run passed 87 cases from `tournament`,
`grouping-final`, `round-robin-groups`, `weighted-scoring`, `game-icons`,
`game-poster-art`, `ui-workspace`, `rtl-layout`, `language-switch-layout`,
`mixed-script-fields`, `presentation-refinement`, `exports`, `organizer` and
`participant-count`. These checks cover other scoring models, group playoffs,
Gol Ya Pooch, creation limits, navigation, live language switching, exports,
participant imports, local presentation, sharing, vaults and offline reload.

These were focused browser runs, not the entire repository's browser suite.
Initial new-test failures came from expecting engine error text instead of the
UI's message and passing an empty optional placement array in a fixture. Both
were corrected before the final passing runs.

GitHub Actions stays disabled. Publication uses the locally built `main/docs`
bundle. Hosted verification is recorded with the GitHub release after publishing.
