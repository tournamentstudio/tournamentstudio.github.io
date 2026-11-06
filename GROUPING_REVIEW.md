# Grouping release review

I reviewed group generation, results, standings and qualification on November 6,
2026. The review found two defects and added regression coverage around
the existing grouping workflows. It did not replace the format engine or change
the saved document schema.

## Findings and corrections

In a four-entrant round robin, the previous rotation could put one entrant away
in all three games. Alternating every pairing on every round caused the rotating
entrants to lose their natural home/away balance.

`src/engine/formats.ts` now alternates the fixed entrant each round and preserves
the orientation of the rotating pairs. Return meetings reverse their previous
orientation. Each entrant's home/away totals differ by at most one. Opponents,
round numbers and match IDs remain the same.

This applies to newly generated standalone round robins, groups and league
divisions. Existing saved draws and recorded results are never rearranged.
An organizer who wants a different schedule must use the existing reset and
generation workflow, including its result-loss review.

The visual review also found that partially completed groups could put ready
rounds in the order 4, 5, 1, 2, 3. The match desk had kept each group's original
storage order after filtering completed matches. `src/app/match-order.ts` now
sorts the display by stage and numeric round before pagination. Sorting a copy
keeps saved match order and results unchanged. A browser regression with 58 ready
matches failed on the previous bundle and checks all three pages after the fix.

## Competition coverage

- Round robin: odd/even fields from 2 through 128 in representative samples;
  complete pair coverage, no duplicate entrant within a round, home/away balance
  and reversed return pairings at 1, 2, 3 and 12 meetings.
- Groups: uneven fields, singleton groups, complete membership and isolated
  standings, with representative fields through 512 entrants.
- Qualification: exact positions, manual decisions for unresolved ties,
  wildcard normalization after canceled fixtures and protected result correction.
- GSL: all 32 possible result paths in one group, multiple simultaneous groups,
  winners/decider qualification and two-loss elimination.
- League divisions: separate standings and season records.
- All 14 sport presets: completed uneven groups with repeated meetings, including
  set scoring, manual results, time scoring and placement scoring.
- Portability: public codes, complete unencrypted codes and archives preserve
  group identities, scores, standings and GSL qualifiers. Mixed Persian/English
  names and the older group-label policy survive roundtrips.

No additional defect was reproduced in standings or qualification. Independent
reviewers checked the pairing correction and the new regression assertions.

## Verification and limits

The exact release checks are recorded in [RELEASE_STATUS.md](RELEASE_STATUS.md).
The new unit suites contribute 105 tests. Seven new browser cases cover complete
group playoffs, GSL results, repeated meetings, large group labels, multi-entrant
heats and ordered pagination.

Standings and match screens were inspected in English and Persian at 320, 390,
768 and 1440 pixels. No additional text overlap, clipping or page overflow was
found. Standings tables keep their own horizontal scrolling on narrow screens.

The audit covers supported grouping variants and the current schema's older
group-label policy. It is not a claim that every historical application release,
every possible rule combination or every browser version has been tested.
Low-level generator tests can exceed the application's 20,000-match limit;
those cases check algorithm invariants and do not raise the product limit.

Saved draws are preserved, so older backups retain their original home/away
assignments. Passing checks cannot establish the absence of every possible bug.
CI remains disabled; release checks and preparation run locally.
