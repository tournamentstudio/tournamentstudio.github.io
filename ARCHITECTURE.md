# TournaStudio architecture

I built the application around a portable tournament document. The competition
engine takes a document and returns another document; it does not know about
React, IndexedDB, themes, or network connections.

## Modules and data flow

| Module             | Responsibility                                                                |
| ------------------ | ----------------------------------------------------------------------------- |
| `src/domain`       | Versioned TypeScript entities, defaults, Zod validation, compatibility checks |
| `src/engine`       | Draws, match dependencies, progression, stage validation, simulation          |
| `src/scoring`      | Result validation and winner calculation                                      |
| `src/standings`    | Recomputed standings and ordered tie-break policies                           |
| `src/scheduling`   | Resource scheduling, availability, rest, conflict detection                   |
| `src/persistence`  | Dexie repository, revisions, trash, local change notifications                |
| `src/security`     | Bounded codecs, safe JSON, raster validation, authenticated encryption        |
| `src/sharing`      | Public projections, portable transports, update and submission packets        |
| `src/themes`       | Appearance tokens and preset definitions                                      |
| `src/presentation` | Spectator scenes and local presentation updates                               |
| `src/export`       | Browser-generated graphics and printable documents                            |
| `src/app`          | Organizer screens and user interactions                                       |
| `src/i18n`         | English and Persian labels, direction, formatting                             |

An organizer action first produces a candidate document. Domain and engine
validation run before persistence. The repository checks the expected revision,
writes the document and revision snapshot in one IndexedDB transaction, and only
then publishes a BroadcastChannel notification. Other local tabs load the saved
revision. A notification never contains the tournament document or an unlocking
secret.

React state holds the current editor document and temporary form values.
Competition results are ordinary data. Standings and display layouts are derived
instead of being an independent source of truth.

## Engine contracts

The public entry point is `src/engine/index.ts`:

```ts
generateStage(tournament, stageId)
recordResult(tournament, matchId, result, confirmInvalidate?)
getCorrectionImpact(tournament, matchId)
getStandings(tournament, stageId?, group?)
previewAdvancement(tournament, stageId)
advanceStage(tournament, stageId)
validateGraph(tournament)
simulate(tournament)
getChampion(tournament)
```

Mutating operations return a cloned document. They leave the input untouched.
The caller owns saving, revision allocation, and UI confirmation. Draws use
FNV-1a string hashing and Mulberry32 with Fisher-Yates shuffling, recorded as
`fnv1a-mulberry32-v1`. This generator is for reproducible draws, not secrets.
Match identifiers are deterministic within a stage.

`formats` is a compiled registry of identifiers, versions, participant limits,
and capabilities. It is not an executable third-party plugin loader. Adding a
format requires implementing its algorithm, extending the schema and labels,
and adding tests. Unknown JSON extension metadata can be retained by private
documents; unknown format identifiers and unsupported versions fail validation.
No imported configuration executes code.

## Competition policies

| Format             | Implemented policy                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single elimination | Next power-of-two bracket, conventional seed positions, distributed BYEs, automatic winners, optional semifinal-loser third-place match                                               |
| Double elimination | Winner bracket plus alternating loser consolidation and winner-bracket drop rounds; one-loss entrants remain active; grand final optionally resets if the loser-bracket finalist wins |
| Triple elimination | `progressive-three-loss-v1`: dynamic rounds, active entrants sorted by losses and seed, pair nearby loss totals before minimizing prior meetings, eliminate on the third loss         |
| Round robin        | Circle method with a rotating idle slot for odd counts; repeated meetings reverse home/away order on alternating cycles                                                               |
| Groups             | Snake distribution into balanced pools, optional exact manual group lists, separate round-robin standings                                                                             |
| GSL                | Groups of exactly four: two openers, winners match, elimination match, decider; winners-match winner qualifies first and decider winner second                                        |
| Swiss              | Score-ordered pairing with deterministic backtracking, no rematches, optional forbidden pairs, lowest-ranked eligible bye, no repeated bye                                            |
| Gauntlet           | Lowest seeds start; each winner meets the next higher seed                                                                                                                            |
| Ladder             | `alternating-adjacent-challenges-v1`: adjacent challenges alternate between rank pairs; a successful lower-ranked challenger swaps places with the defender                           |
| Free-for-all       | Balanced fixed heats up to the configured capacity, repeated rounds, placement-point standings                                                                                        |
| Time trial         | All entrants in each round, lower elapsed values win, cumulative placement points                                                                                                     |
| Grand Prix         | All entrants in each event, repeated events, cumulative placement points                                                                                                              |

The triple policy is a stated convention rather than a claim of a universal
triple-elimination bracket. With no withdrawals, every nonchampion records three
losses. An odd field gives the bye to an entrant with the fewest previous byes,
then more losses, then a lower seed.

The Swiss search is bounded at 150,000 search nodes. It reports an impossible
pairing or search-limit error rather than silently inserting a rematch. Score
proximity is a deterministic search preference, not a claim of globally optimal
pairing or federation compliance. Withdrawn entrants are excluded from future
rounds. No late-entry credit, federation-specific color rules, or manual pairing
editor is supplied.

Free-for-all heats do not automatically merge into a final. Add a destination
stage and qualification rule for a final. A capacity that creates a one-entrant
heat is rejected. Grand Prix and time trials use the configured placement-point
table; they do not implement weighted event combinations or cumulative elapsed
time as the primary ranking.

The engine has no two-legged aggregate ties, automatic promotion/relegation,
challenge invitations, multi-season rating database, or arbitrary tournament
format scripting.

## Stage graph and qualification

A stage lists its input stages in `sources`. Each connection selects top entrants,
top entrants per group, exact finishing positions, or wildcards from a chosen
finishing position across round-robin groups. Sources must exist and form a
directed acyclic graph. Qualification waits for all sources to complete.
Duplicate qualifiers, impossible counts and unresolved cutoff ties block a draw.

`previewAdvancement` is a pure calculation. It returns each candidate's source
rank, original metrics, compared metrics, retained match count, selection status
and reasons. Direct qualifications resolve before wildcards, regardless of the
order of the connections. Wildcards exclude entrants already selected directly.
Inactive wildcard candidates are excluded; an inactive direct qualifier blocks
advancement rather than silently reducing the field.

Wildcard policies are explicit:

- `total` compares the candidates' full group totals.
- `per-match` compares each selected metric divided by played matches. The
  comparator cross-multiplies values so display rounding cannot decide a place.
- `discard-bottom` retains the top places up to the smallest selected group size
  and recomputes candidate metrics without matches against lower places. Source
  finishing positions stay based on the original group standings. A tie at the
  discard boundary blocks this comparison.

Each policy uses ordered points, wins, differential, scored and optional seed
criteria. Source-position ties, zero played comparison matches and a tie crossing
the wildcard cutoff are reported. Seed provides stable display order but decides
qualification only when explicitly selected as a criterion. The optional
`manualQualifiers` configuration may resolve an eligible cutoff tie; it must
retain every clear qualifier and cannot bypass eligibility rules.

For single and double elimination, connections can assign one-based physical
first-round bracket slots. Slots 1 and 2 meet, then 3 and 4, and so on. Reserved
slots are unique and within the destination's next-power-of-two draw size.
Unassigned entrants fill the remaining positions using the draw's seed order.
Without explicit slots, source order supplies destination seeds as before.

The editor keeps connection drafts separate until Apply validates the complete
graph. The canvas supports node movement, ports, panning and zoom, with keyboard
controls and a form alternative. Bounded node coordinates persist as
`stage.metadata.canvasPosition`. Editing inputs of a stage with an existing draw
or drawn descendants is blocked. Winner/loser routing between separate stages
still needs dedicated rules and controls.

Match slots reference either an entrant or a source match's winner/loser.
Resolution waits until the source is terminal. A BYE can carry one entrant or
no entrants; missing inputs are not treated as BYEs while their sources remain
unfinished. The optional double-elimination reset is canceled only when the
undefeated finalist wins the first grand final.

## Pot draws and group restrictions

`previewGroupDraw(tournament, stageId)` resolves active entrants and returns a
candidate group assignment without changing the document. `generateStage` uses
the same function after checking draw locks. The optional `config.draw` object
is supported for Groups and GSL only. Without it, the original seeded, random,
snake or manual-group behavior is preserved.

Pots partition the active entrants. Each pot contributes at most one entrant
to a group. Groups have fixed balanced capacities, differing by at most one;
GSL capacities are exactly four. Restrictions cap entrants with the same region
or organization in each group. Missing labels block restricted draws. Labels
are compared after Unicode normalization, case folding, whitespace cleanup,
and normalization of common Persian/Arabic Yeh and Kaf forms. Labels such as
country abbreviations and full country names are not inferred to be equivalent.

The `group-csp-fnv1a-mulberry32-v1` algorithm uses the saved seed to order
candidates, chooses the most constrained next entrant, and backtracks when a
placement prevents completion. Equivalent group states are pruned. It never
weakens a restriction. The search stops after 100,000 nodes or 20,000,000
candidate checks. Exhaustion reports that feasibility is unknown; a completed
unsuccessful search reports infeasibility. A valid result is reproducible, but
is not advertised as uniform sampling of every possible valid draw.

The editor retains rule changes as drafts. Preview is required before applying
them, and applying revalidates the current document. Changes to the saved stage
invalidate stale drafts. Participant changes invalidate the displayed preview.
Existing draws and generated descendants remain protected. Pot rules cannot
coexist with exact manual group lists; the editor explains when applying rules
will replace those lists.

## Knockout draw constraints

`previewKnockoutDraw(tournament, stageId)` handles the optional
`config.knockoutDraw` rules for single and double elimination. It resolves the
same qualifiers as generation and returns exact first-round slots, BYE
recipients, fixed positions and localized issue codes. Generating a constrained
stage passes all occupied positions to the existing elimination generator.
The winners bracket, loser drop paths and final-reset logic remain shared with
standard draws.

Pots partition the active entrants. Played first-round pairs must differ in pot
and every selected affiliation field. Label normalization matches group draws.
The next power-of-two bracket supplies exactly the required number of BYEs, assigned to the leading
entrants in the selected draw order. Random seeding randomizes this order.
Protected seeds pin a leading count to standard seed positions. Source slot
mappings are also pins; inconsistent pins or occupied opponents of a fixed BYE
recipient are errors.

Version 1's `knockout-matching-fnv1a-mulberry32-v1` policy first validates fully pinned
pairs. It builds a compatibility graph for remaining played entrants, removing
edges between entrants pinned to different matches. A deterministic
most-constrained-first search finds pairs, with seeded candidate ordering and a
preference for standard seeded opponents. It then fits the pairs and BYEs around
the pinned positions. The search budget is 100,000 nodes or 20,000,000 work
units. A budget failure reports unknown feasibility and returns no partial draw.
Successful assignments are reproducible, without a uniform-random guarantee.

Version 2 adds per-field `separation` rules through a chosen winners-bracket
round. Equal normalized labels must occupy different blocks of `2^r` initial
slots for round `r`. The least common ancestor of any two equal labels is
therefore later than `r`, proving the guarantee for every possible result path.
BYE entrants occupy those same paths and count toward section capacities.
Losers brackets, grand finals, resets and placement matches are outside this
guarantee.

`knockout-subtrees-fnv1a-mulberry32-v2` assigns entrants to opening matches with
one bounded search for pairing and section placement together. It chooses
entrants with the fewest remaining match positions, prefers the standard seed
position, then follows a seeded candidate order. Each placement removes
incompatible positions from remaining entrants' domains. Backtracking restores
those positions; equivalent empty matches within the same protected sections
are skipped. A locally valid opening pair can be undone when it prevents the
rest of the bracket from satisfying a later-round rule.

Fixed source positions, protected seeds and BYE recipients remain constraints.
Prechecks reject excess affiliation counts, conflicting fixed positions, and
round limits beyond the actual bracket. Version 2 uses the same node and work
budgets as version 1 and reports unknown feasibility on exhaustion. It does not
partially return or silently weaken a rule.

Version 3 adds independent `losersSeparation` rules for double elimination.
It reads the lower drop and winner paths from the generated match graph rather
than assuming the winners-bracket section geometry applies to lower rounds.
Every opening match contains either two entrants or one designated BYE
recipient. A regular entrant can first lose in any winners round; a BYE
recipient cannot lose in the opening round.

For each pair of opening positions, the path model considers compatible first
defeats. If their winners paths first meet in round `m`, both cannot remain
undefeated after that meeting. Their first defeats can both be before `m`, or
one can be before `m` and the other at or after it. When both first defeats are at or after `m`,
one must occur at `m` and the other later. From each compatible pair of drops,
the first shared match on their lower winner paths is a possible meeting.
The minimum such round determines whether two equal labels can occupy those
opening positions.

This distinguishes real drop paths from phantom losers of BYE matches. It also
allows two entrants with the same label to face each other in the winners
bracket when only lower protection is requested. Pairing, BYE placement,
winner sections and lower paths are solved together; no result-time rerouting
is needed. Grand finals, resets and placement matches remain outside the rule.

The `knockout-paths-fnv1a-mulberry32-v3` search tracks each entrant's remaining
opening-match positions. Placing an entrant removes positions that violate an
enabled field's upper or lower rule. Backtracking restores those domains.
The version 2 empty-section symmetry shortcut is not used: positions within
the same winners section can have different lower paths. Version 3 retains the
100,000-node and 20,000,000-work limits, with unknown feasibility reported when
the search budget is exhausted.

Version 4 adds independent `finalsSeparation` targets for grand finals, enabled
resets and the single-elimination third-place match. Any pair of entrants can
reach a double-elimination grand final together. The lower finalist can then
win and trigger a reset with that same pair. Guaranteeing separation for either
match therefore requires every active entrant's normalized label to be unique.
Duplicate labels are rejected before search; seeding cannot solve that conflict.

Third place receives the losers of opposite semifinals. Every entrant can lose
a semifinal in brackets of eight or more slots; in a four-slot bracket, an
opening BYE recipient cannot lose that semifinal. Two eligible entrants can
meet in third place exactly when they start in opposite halves. The v4 solver
therefore keeps matching labels in one half, accounting for BYE eligibility.
With three entrants, only one semifinal has a loser and third place has no
two-entrant encounter. Two-entrant stages have no third-place match to protect.

`knockout-finals-fnv1a-mulberry32-v4` extends the joint path search with this
third-place pair constraint. Pots, pins, BYE entitlements and winner sections
remain active in the same search. A third-place rule can conflict with a winners
rule that requires matching affiliations to occupy opposite halves. The same
node/work budgets apply; exhaustion returns unknown feasibility and no slots.
Final policies require their actual stage format and enabled match settings.
There is no generator for other placement matches and no final-time reseeding.

Version 5 adds an inclusive distance interval and independent match targets.
Participant `location` fields are optional strict latitude/longitude objects.
All active entrants need them when drawing with distance rules. The computation
uses the [Haversine formula](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.pairwise.haversine_distances.html)
with the fixed policy radius 6371.0088 km. Longitude differences wrap across the
dateline, identical poles have zero distance, and the Haversine value is clamped
to [0, 1] before taking its inverse. This approximates the shortest surface arc
on a sphere. It does not calculate roads, travel time or terrain.
Threshold comparisons use unrounded values; displayed distances are rounded.

`knockout-distance-haversine-fnv1a-mulberry32-v5` computes an incompatibility
graph for entrant pairs outside the chosen interval. Distance is not a label:
A can be near B and B near C while A and C are far apart. The solver keeps these
pairwise edges instead of converting locations into transitive groups.
An incompatible pair loses positions where it can meet through a selected
winners or losers round, or in third place. The existing encounter predicates
account for exact drop paths and BYEs. A grand-final/reset target, or protection
through either bracket's final, requires every entrant pair to be within range.
Those universal conflicts fail before search. Pot membership, affiliation rules,
fixed qualifiers and seed protection remain active in the same draw.

When all active rules concern only the opening round, v5 first finds compatible
entrant pairs with a bounded most-constrained-first matching search, then fits
them around fixed slots and the exact BYE recipients. This avoids exploring
equivalent placements of every potential pair across empty opening matches.
Later-round targets use the joint path solver. Both searches retain the
100,000-node and 20,000,000-work limits and distinguish exhausted search from
proved infeasibility. Candidate order is deterministic, with no claim of uniform
sampling over all valid draws. Earlier draw versions keep their existing search.

The distance graph is recomputed, not persisted in tournament metadata.
Coordinates stay out of public projections and recipes, which retain the rules
and any saved matches. A public copy therefore needs new base locations before
regeneration. Full private packages preserve locations. The existing canonical
form omits absent fields, so adding support for locations does not change hashes
of older documents. Versions 1 through 4 keep their draw policies.

Version 6 adds venue eligibility as a per-entrant restriction on opening-match
positions. Each rule references an existing schedule resource, distance bounds
and exact `{bracket, round, index}` match targets. Resource coordinates use the
same strict schema and Haversine policy as participant bases. Up to 64 rules and
1024 distinct targets are accepted. Optional opponent-distance rules and all
earlier affiliation, pot, seed and qualifier restrictions remain active.

`knockout-venue-haversine-fnv1a-mulberry32-v6` derives reachability from the
actual elimination graph for each opening position and two entrant variants:
a regular entrant, and a BYE recipient who cannot lose the opening match.
Winner and loser edges propagate possible paths to every selected venue. An
entrant outside a venue's bound loses every opening position that can reach
that target. This is eligibility for a match slot, including automatic advances,
not an estimate of journeys taken. It covers both final matches and third place
without inventing extra routes or rerouting earned finalists.

Fixed positions are checked before search. When pair restrictions concern only
the opening round, the v6 solver matches entrant pairs and incrementally assigns
those pairs and BYEs to eligible venue positions using augmenting paths. This
checks venue capacity during pairing instead of waiting for a complete draw.
Later-round pair restrictions use the joint path solver with venue domains.
Both retain the 100,000-node and 20,000,000-work limits and return no partial draw
on exhaustion. Generation assigns each target's resource ID.
The concrete-bracket validator follows original source paths even after
scores populate downstream slots; past results cannot silently remove an entrant
from eligibility checks. Scheduling checks these distances again, reserves the
assigned resource and its time window, and retains venue assignments on BYEs
without allocating playing time. The schedule table locks these resource
selectors. Referenced resources cannot be deleted through the editor. Coordinate
changes preserve results and surface conflicts instead of changing the bracket.

Public resource serialization uses an explicit allowlist that excludes venue
coordinates. Portable public rules and saved matches still reference resource
IDs and public names. Recipes replace venue identities with placeholders and
rebind them to fresh resource IDs on import. Existing recipe representations
remain unchanged when no venue rules exist. Structure drafts include participant
and resource data in their stale-state check; schedule drafts require a reload
after another revision changes the document.

The editor follows the same draft, preview, revalidation and draw-lock rules as
group drawing, with previews of protected winners sections, lower rounds and
selected final and distance targets. The optional configuration stays absent in
legacy documents. Removing distance or final rules restores the earliest rule
version that still represents the remaining settings.
Public projections validate it explicitly, and recipes remap its pot entrant
references instead of leaking or reusing original participant identifiers.

## Scores and standings

Results support high scores, low scores, time values, manual decisions, completed
sets, forfeits, and placement tables with ties. Sets require two entrants and an
odd best-of count. The engine rejects sets after the required wins have been
reached. A played result's selected winner must agree with the scoring policy.
Forfeits and other explicit rulings require a selected entrant.

Standings apply configured tie-breakers in order. Head-to-head uses a mini-table
inside the remaining tied cohort, avoiding a nontransitive pairwise comparator.
Buchholz sums opponents' points. Median Buchholz drops one high and one low
value when at least three opponents exist. Sonneborn-Berger weights opponents'
points by one for a win and one-half for a draw. A Swiss bye earns win points,
but is not counted as a played match or opponent.

Placement ties split the points occupied by their tied positions. For example,
two entrants tied first share the first- and second-place awards. Seed order is
only a ranking criterion when selected in the rules. Otherwise it provides a
stable display order while the shared rank remains explicitly tied.

Completed elimination rankings follow elimination depth, with the champion
first. Entrants eliminated at the same depth share a rank unless the optional
third-place match separates them. Several independent groups do not declare one
overall champion.

## Corrections and persistence

Before changing a recorded result, the engine finds dependent matches and all
derived stages. Future dynamically paired rounds are dependent on earlier
results, even without match-slot edges. Played, live, or contested dependents
require `confirmInvalidate`. Confirmation keeps the previous affected state in
`metadata.correctionRecovery`, bounded to five correction records, and clears or
removes invalidated results. Source-derived stages return to draft.

The repository keeps the last 50 revision snapshots per tournament. Ordinary
snapshots are compressed; protected snapshots are encrypted. Snapshots are
stored per confirmed save rather than as an event-sourced log with periodic
checkpoints. This is a deliberate simpler implementation with a storage cost.
Expected-revision checks reject conflicting edits from another tab.

The revision hash is SHA-256 over canonical JSON, excluding its own field.
It detects inconsistent content and anchors update packets. It does not identify
an author or prove that the content came from a trusted organizer.

## Scheduling

Automatic scheduling follows match and stage dependencies, resource time
windows, participant availability, assigned referees, and rest periods. For an
unresolved slot it conservatively reserves every entrant who could reach it.
That prevents possible conflicts but can produce a longer schedule than one
based on known results. Regenerating after results resolve can reduce the
reserved time.

The duration estimator's minimum is total playing time divided by resources.
It is a lower bound, not a promised finish time. Dependencies, rest, availability,
and ungenerated dynamic rounds can increase the duration. Scheduling is greedy;
there is no optimal constraint solver or drag-and-drop timeline.

## Theme identities

The 50 presets combine color, typography and geometry tokens with 17 original
vector motifs and 12 material treatments. `identities.ts` maps presets to the
14 activity collections; `getThemesForSport` supplies creation and gallery
recommendations. The original 27 preset IDs remain stable.

`ThemeMotif` accepts a preset identifier and layout variant. It never receives
matches, hand logs, possession or concealed positions. `GameIdentity` receives
only sport, preset and locale. Theme artwork therefore cannot reveal a referee
secret through a different emblem, position or color. Material textures and
vector paths are local static definitions, without remote assets.

Theme settings remain the existing version 1 data contract. The richer identity
is derived from the preset ID, so exports do not duplicate artwork or create new
executable fields. Predefined text, accent and muted tokens are checked for 4.5:1
contrast on card and base backgrounds. Custom colors can reduce contrast; the
editor warns about the text/background pair. This is not a claim of a full
accessibility audit.

## Security boundaries

All external packages are size-bounded and schema-validated before import.
The public projection uses field allowlists. Referee secrets, private notes,
rosters, arbitrary metadata, history, and correction backups are omitted.
Only typed engine metadata needed for brackets and standings is retained.
Hiding a control is not the boundary for private information.

Protected documents use AES-256-GCM, random salts and nonces, and
PBKDF2-SHA256 with 600,000 iterations. Decrypted documents and secrets exist in
memory while unlocked. Browser memory cannot be guaranteed to be physically
erased, and access to an unlocked session is access to its unlocked data.

Service-worker caches hold application files. IndexedDB holds tournament
documents. A deployment update does not reset the local database. Browser-data
deletion remains outside the application's control.

## Measured engine coverage

On the Windows development machine, the following command passed the 54-test
baseline on 2026-10-20:

```sh
npx vitest run src/engine/engine.test.ts --reporter=verbose
```

The run took 2.13 seconds, including 1.91 seconds in tests. Selected single
elimination tests generated the draw, recorded every match, validated the graph,
and checked the champion:

| Entrants | Played matches | Observed test time |
| -------- | -------------- | ------------------ |
| 13       | 12             | 2 ms               |
| 127      | 126            | 60 ms              |
| 128      | 127            | 63 ms              |
| 256      | 255            | 244 ms             |
| 512      | 511            | 992 ms             |

These are one-run Node test measurements, not browser rendering benchmarks or
service guarantees. Tests cover all requested irregular knockout sizes and
randomized double-elimination outcomes, Swiss fields, and round-robin pairings.
The subsequent 56-test run, including default-rule hybrid simulation and BYE
statistics, passed in 2.25 seconds.
The general document limit is 512 participants and 20,000 matches. Standalone
round robin is capped at 128 entrants. Large SVG layouts, long lists, and repeated
whole-document saves need further browser performance measurement; the engine
limit does not imply equal responsiveness on every device.

On the same machine, a later v4 draw check at 512 entrants measured 8.80 ms for a
grand-final/reset preview with distinct labels, 13.69 ms for third place with
repeated labels, and 16.43 ms with third-place, opening restrictions and two pots
together. The respective generation calls took 10.99, 16.76 and 19.11 ms. A
duplicate-label final rule was rejected in 0.57 ms before search. These Node
measurements cover preview and generation, not scoring every match or rendering.

A v5 opening-round check placed equally spaced equatorial bases under a maximum
distance of 12,000 km. The 128, 256 and 512 entrant previews took 3.54, 8.62 and
30.37 ms respectively, visiting one pairing node per played opening match.
These are local Node measurements for that case, not worst-case bounds. Constraint
combinations can still exhaust the bounded search and return unknown feasibility.

The initial production bundle also passed `npx playwright test`: 36 cases across
Chromium, Firefox, and WebKit in 1.5 minutes. Each browser ran 12 workflows,
including a completed 13-entrant bracket, private and public transfers, encrypted
recovery, correction confirmation, same-profile live presentation, Persian
mobile layout, and offline editing after closing and reopening a cached tab.
The vault race test delays encryption, locks the workspace before the save
finishes, waits for the committed revision, and verifies that unlocking is still
required.
