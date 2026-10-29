# TournaStudio feature status

This matrix describes the code in this repository. An implemented row refers to
the behavior named in that row, within its stated limits. It does not imply that
every variant of a sport or competition format is supported.

Status meanings:

- **Implemented:** available through the application for the stated workflow.
- **Partially implemented:** a working subset exists, with the missing parts listed.
- **Not yet implemented:** no complete workflow is supplied.
- **Unsupported due to static-hosting constraints:** requires a service that this
  application deliberately does not run.

Deployment and browser-test results belong in the release report. A workflow file
or a test file alone is not evidence that deployment or a particular browser run
succeeded.

## Competition formats

| Capability | Status | Actual policy and limits |
| --- | --- | --- |
| Single elimination | Implemented | Power-of-two draws, seeded positions, automatic BYEs, winner progression, optional third place or full classification. Engine accepts one entrant; creation starts at two. |
| Irregular knockout sizes | Implemented | Tested with 3, 7, 13, 24, 31, 127 and other sizes through 512. |
| Double elimination | Implemented | Connected winners and losers brackets, correct winner-bracket drops, grand final and optional reset when the lower-bracket finalist wins. |
| Three-loss elimination | Implemented | Named `progressive-three-loss-v1` policy. Dynamic rounds pair by losses and seed; a third loss eliminates an entrant. This is not a claim of one universal triple-elimination bracket convention. |
| Round robin | Implemented | Circle-method pairings for odd and even counts, repeated meetings, alternating slot order for home/away. Standalone format is capped at 128 entrants. |
| Groups and pools | Implemented | Balanced snake distribution, uneven groups, round robin within each group, group standings, configurable qualifiers per group. |
| GSL groups | Implemented | Groups of exactly four with openers, winners match, elimination match and qualification decider. Field size must be divisible by four. |
| Swiss | Implemented | Score-ordered deterministic pairing, no rematches, fresh BYEs, side preferences, optional standalone late entries with explicit missed-round credits, and a validated editor for the latest unplayed round. Pairing failures are reported. |
| Swiss acceleration | Implemented | Named fixed-group-v1 policy assigns virtual pairing points to an explicit starting group for opening rounds. The group and bonus lock after drawing; official points, tie-breaks and bye order stay unchanged. Recipes remap group identities. |
| FIDE Dutch 2026 pairings | Implemented | Local BBP 6.0.0 with the pinned exchange-order correction, identified as bbp-6.0.0-ts1. Joint opponent/color decisions, fixed tournament pairing numbers, standard chess points, withdrawals and zero-credit late entry. Four upstream regression fixtures and native-reference comparisons cover actual opponents and colors. No independent FIDE endorsement; Burstein, federation acceleration variants and rating submission are outside this named policy. |
| Free-for-all | Implemented | More than two entrants per match, balanced heats, repeated rounds, placement scores and ties. A one-entrant heat is rejected. |
| Battle royale scoring | Implemented | Multi-entrant heats with placement awards, measured eliminations/survival values and weighted dimensions. Tied placements average the awards of occupied positions. Organizers enter the evidence; no game-server feed is required. |
| Gauntlet | Implemented | Lower seeds play first; each winner meets the next higher seed. |
| Challenge ladder | Implemented | Named alternating-adjacent-challenges policy, next-round generation and rank swaps after a successful challenge. |
| Arbitrary challenge invitations | Implemented | Persisted pending, approved, declined, canceled and resolved invitations; bounded rank gap, one approved match at a time, private notes and rank swaps after actual results. Cancel only before play; corrections require reviewed downstream recovery. |
| Time trial and race | Implemented | Lower numeric times win; select placement points or cumulative elapsed time. Cumulative ranking keeps incomplete entrants unranked until required runs are recorded. Use one agreed time unit. |
| Speedrun tooling | Implemented | Per-entrant persisted start/pause/reset timer, named splits and private evidence references; explicit transfer of elapsed seconds into score entry. Timing uses the device clock. Automated game/video verification and certified timing are outside this workflow. |
| Grand Prix | Implemented | Repeated events with cumulative configurable placement-point awards. |
| Multi-event weighted scoring | Implemented | Event collections combine completed-stage placement awards with per-competition weights. Unresolved tied places share the mean award; explicit bonuses and penalties retain their reasons. Raw scores from different games are not treated as the same unit. |
| Leagues and playoffs | Implemented | Round robin feeding playoffs, event divisions and season records, reasoned point adjustments, and reviewed promotion/relegation into new independent round-robin divisions. Original seasons remain unchanged; each new division needs 2 to 128 entrants. |
| King of the Hill | Implemented | Named incumbent-stays-loser-requeues policy. First seed starts as incumbent, winner stays, loser joins the queue tail, inactive entrants are skipped. Queue positions below the incumbent indicate waiting order, not performance rank. |
| Placement competitions | Implemented | Multi-entrant placement scoring, third place and full single/double-elimination classification. Double elimination classifies second-loss cohorts without changing championship/drop/reset fixtures; BYE gaps compact to real ranks. |
| Two-legged and aggregate ties | Implemented | Single/double elimination ties with 2 to 8 legs, high/low aggregate totals, partial leg progress, optional extra leg and agreed final ruling. Explicit forfeits and optional regulation away-goal tiebreaks are supported. Away goals require high scoring, even regulation legs and nonnegative scores; hosting alternates by slot and extra-leg goals never count toward that tiebreak. |
| Compiled format extensions | Implemented | Versioned source modules declare capabilities and validation; adding one requires implementation and tests. Imported executable plugins are deliberately unsupported by security policy, not a pending installation workflow. |

The general document limit is 512 participants and 20,000 matches. The limit does
not mean every format at that size is quick to render or fits the match cap.
See [ARCHITECTURE.md](ARCHITECTURE.md) for algorithms and measured engine tests.

## Structure, draws and scoring

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Multi-stage competitions | Implemented | Add stages and combine top finishers, exact positions, wildcards or actual recorded match winners/losers. Standings selections wait for their source stage; outcome selections wait for referenced results. |
| Groups to knockout / Swiss to knockout | Implemented | Qualification refuses a tie crossing the cutoff rather than choosing a hidden winner. |
| Stage graph validation | Implemented | Cycles, missing stages, invalid sources and duplicate or excessive qualifiers are rejected. |
| Visual stage editor | Implemented | Movable nodes, output/input ports, pan, zoom, saved positions, inspector and keyboard/form alternatives. Connections validate as a complete draft before saving. |
| Parallel and multiple source stages | Implemented | Add, edit and remove multiple connections per destination. Cycles and duplicate selections are rejected; generated descendants lock input changes. |
| Exact cross-group slots and wildcard qualification | Implemented | Exact group/rank picks and physical first-round slots for single/double elimination. Group wildcards compare totals, per-match values or results after discarding bottom opponents, with ordered criteria and candidate previews. Unresolved ties block qualification. |
| Winner/loser routing between separate stages | Implemented | Select actual source matches and their recorded winners or losers, with explicit expected counts. Generated source references lock unsafe regeneration. Correction invalidates dependent stages with recovery; recipes reject these result-specific connections and direct users to full snapshots. |
| Manual qualifier overrides | Implemented | Review and confirm explicit entrant choices when source standings have a tied cutoff. Generated descendants and played draws remain protected. |
| Manual group composition / forbidden pairs | Implemented | Group membership editor validates every entrant, group sizes and stage locks. Swiss forbidden-pair controls reject duplicate, missing and self-pair references. |
| Seeded and reproducible random draws | Implemented | Ranked, random, snake and manual-order choices; stored seed and algorithm version. |
| Protected seeds | Implemented | Pin leading seeds to conventional positions or assign individual entrants to fixed knockout slots. Pins, qualifier slots, BYE entitlements and all configured draw restrictions are validated together. |
| Pot-based and geographic group draws | Implemented | Groups and GSL: editable seed pots, deterministic balanced preview, one entrant per pot per group, region/organization caps, missing-label checks and explicit infeasible/search-limit results. Played draws remain locked. |
| Restricted knockout draws | Implemented | Single/double elimination: pot separation in played first-round pairs, exact BYE recipients, fixed source slots, seeded preview and bounded search. Region and organization rules can extend through a selected winners-bracket round. |
| Later-round affiliation separation | Implemented | Version 2 rules place equal region or organization labels in separate bracket sections through a selected winners-bracket round, including BYEs and every possible result path. Each field can use a different round limit. |
| Losers-bracket affiliation separation | Implemented | Version 3 double-elimination rules protect regions and organizations through independently selected lower rounds for every result path. BYEs, fixed slots and winners restrictions are checked together. No reseeding after play. |
| Grand-final and reset affiliation separation | Implemented | Version 4 independently protects regions and organizations in either double-elimination final. Every entrant needs a unique label for the selected field: any pair can reach either match. Duplicate labels are rejected; earned finalists are never rerouted. |
| Third-place affiliation separation | Implemented | Version 4 separates possible semifinal losers using bracket-half constraints, checked with pots, winners rules, BYEs and fixed slots. This draw restriction targets the third-place match, not every classification match. |
| Geographic distance rules | Implemented | Version 5 knockout draws use manual base coordinates and an inclusive minimum/maximum kilometer range. Independent winners/losers round limits and existing final/third-place targets hold for every possible outcome. Checked jointly with pots, affiliations, pins and BYEs. Coordinates stay out of public snapshots. |
| Venue-distance restrictions | Implemented | Version 6 assigns existing courts, tables or rooms to selected knockout match positions and checks inclusive base-to-venue distance limits for every possible entrant. Covers winners, losers, final, reset and third-place slots, including automatic advances. Scheduling retains the assigned venue; public copies omit coordinates. |
| Automatic knockout venue selection | Implemented | Preview candidate venues for selected winners, losers, final, reset and third-place slots. A bounded deterministic search retains fixed assignments and checks all possible entrant paths. Optional availability testing finds a fresh whole-tournament schedule on a copy; saved times are not reserved or changed. Explicit application saves ordinary v6 rules. |
| Travel routes and cost optimization | Implemented | Bounded venue assignment for up to 12 scheduled matches using explicit spherical-distance assumptions, plus a private offline network of up to 128 locations and 512 directed/bidirectional links. Enter distances and durations, map homes/venues, then choose shortest-distance or shortest-time paths through confirmed bookings, including aggregate legs and return trips. Rest, late arrivals, overlap, missing links and unscheduled stops are reported. CSV/JSON export and reviewed network import work. No supplied road map, geocoding, traffic or measured travel time. |
| Draw safety | Implemented | Played/live stages cannot regenerate silently. Dependent generated stages block unsafe regeneration. |
| Draw preview and animation | Implemented | Group and knockout previews validate before application. An animated draw ceremony replays the exact preview order with manual, auto, replay and keyboard controls; it never changes the draw or results. |
| Tournament simulator | Implemented | Produces synthetic results in a separate preview; does not save them to the working tournament. |
| High/low/time/manual scoring | Implemented | Winner calculation follows the configured rule; explicit rulings require a selected entrant. |
| Best-of and set scores | Implemented | Odd best-of values, validated sets and prevention of sets after the match is already won. |
| Draws, forfeits and no-shows | Implemented | Draws where the format allows them; forfeit, walkover, no-show and disqualification rulings. |
| Postponed/contested/abandoned workflows | Implemented | Reviewed match status actions, explicit ruling before abandoned/contested matches count, restricted cancellation and downstream impact handling. Status changes do not invent a result. |
| Placement ties | Implemented | Tied entrants share the points of the positions occupied by the tie. |
| Judge scores and weighted dimensions | Implemented | Typed numeric, judge-panel and placement dimensions; sum/mean/trimmed mean, bounded weights and reproducible totals. Up to 20 dimensions and 20 judges per panel. Recorded scores must agree with weighted evidence; rules lock after play. |
| Ordered standings tie-breakers | Implemented | Points, wins, difference, scored, head-to-head mini-table, Buchholz, Median Buchholz, Sonneborn-Berger and optional seed. |
| Set ratios, point ratios, fair play | Implemented | Actual set/point evidence and explicit public sanctions feed ordered criteria. Missing evidence skips the criterion for the tied cohort; zero sanctions must be entered explicitly. No synthetic penalty or ratio is inferred. |
| Safe result correction | Implemented | Played downstream effects are listed before confirmation. Prior state is recoverable; invalid dependent results are reopened or removed. |
| Match result reopening | Implemented | Explicit reopen-to-unplayed review, match-state controls and recoverable downstream invalidation. Unsafe played dependencies require confirmation. |
| Undo/redo | Implemented | Up to 20 confirmed edits in the open session, with a restoration preview, played-match impact acknowledgement and strict saved revision/hash checks. Each action creates a new revision. External updates, reload, navigation and locking clear session stacks; saved History remains. |

## Creation, participants and organizer tools

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Account-free creation | Implemented | Three-step flow with title, sport, entrants, format and theme; generates an editable draw. |
| Advanced builder | Implemented | Stage connections and policies, groups, seed pots, restrictions, protected slots, scoring, qualification, scheduling, privacy and presentation have workspace editors. Supported policies and bounds are listed by capability below. |
| Format Advisor | Implemented | Compares six format structures against time, resources, entrant count and minimum games. Group/Swiss playoff recommendations prefill count, rounds, groups, qualifier count, match duration and resources in the builder. Estimates state their assumptions. |
| Participant entry | Implemented | Manual editing and bulk name paste, duplicate detection, Unicode names, seeds, organizations and participation status. |
| Participant file import | Implemented | TXT, quoted multiline CSV and JSON with names, seeds, regions, organizations, rosters, tags, availability and organizer records. Preview edits duplicate names before importing; fresh entrant and roster IDs are assigned. |
| XLSX import/export | Implemented | Values from the first worksheet import through the participant preview. Private participant workbooks export rosters and organizer records. Formulas, external relationships and active content are refused; 2 MiB input and 8 MiB expanded limits apply. |
| Team rosters | Implemented | Players, captains, substitutes and coaches can be added and edited. |
| Participant avatars and region editing | Implemented | Edit region, organization and validated PNG/JPEG/WebP logos. Images are decoded and resized locally; SVG and remote image URLs are refused. |
| Check-in sheets | Implemented | Check-in toggles, participant CSV and browser printing. |
| Registration exchange | Implemented | Export a form with typed questions, fill an imported form, export a response, preview and approve it with duplicate checks. |
| Result submission exchange | Implemented | Unsigned score proposals support numeric/weighted measurements and fair-play evidence. Import validates match identity, original public state and scoring before preview, then applies through the engine after organizer approval. |
| Waiting lists and eligibility administration | Implemented | Private waiting queue, approval/rejection, eligibility decisions and filtered review. Administrative decisions do not silently alter generated draws; participation status remains an explicit separate choice. |
| Payment-status tracking | Implemented | Private untracked/unpaid/paid/waived records and organizer notes. This records decisions only; it does not process payments or store payment credentials. |
| Typed custom fields | Implemented | Up to 50 versioned text/number/boolean/choice/date fields for tournaments, all entrants, teams or matches. Required values are checked on explicit save; missing drafts are reported. Private by default, with deliberate public sharing and recoverable confirmed deletion. |
| Referee/venue assignment | Implemented | Per-match assignments and organizer notes. |
| Announcements and sponsors | Implemented | Public announcement scenes and up to 24 sponsor cards with validated raster logos and tiers. Grid, strip and spotlight layouts paginate eight cards every five seconds. No remote message delivery or inbox. |
| Participant directory across tournaments | Implemented | Event directories use explicit entrant-to-directory bindings. Equal names do not merge automatically. One directory member cannot fill two entrant slots in one competition. |

## Scheduling

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Multiple courts/tables/rooms | Implemented | Named resources with availability windows. |
| Automatic scheduling | Implemented | Greedy dependency-aware scheduler with rest, possible future opponents, resource windows and assigned referees. Regeneration is blocked after results, live/contested play, scored legs, hands or recorded clocks, even when the match is postponed. Unplayed booking edits and reviewed duration extensions remain. Venue-restricted matches retain their configured resource and reject invalid distances or unavailable time windows. |
| Manual scheduling | Implemented | Edit start times, resources and referees in the schedule table. |
| Aggregate leg scheduling | Implemented | Every regulation leg has its own time, venue and duration, with an optional extra-leg reservation. Rest/dependencies, conflicts, timeline moves, exports and event schedules use individual jobs. Scored legs cannot move; an ordinary final result releases an unused extra booking. |
| Conflict detection | Implemented | Conflicting entrants, resources, referees, dependency timing, availability and rest are reported. |
| Participant availability | Implemented | Edit start/end availability in the device timezone. Invalid ranges are blocked; the scheduler checks possible entrants against the saved bounds. |
| Duration estimator | Implemented | Match/resource lower bound and saved schedule span, with assumptions displayed. It cannot forecast ungenerated dynamic rounds. |
| Drag-and-drop timeline | Implemented | Schedule timeline with draggable match blocks and equivalent form/keyboard controls. Changes are previewed, conflict checked and confirmed before saving. |
| Calendar and schedule exports | Implemented | CSV, ICS and print-friendly schedule. |
| Delay propagation and optimal scheduling | Implemented | Preview delays and propagated later start times while retaining started results. A bounded branch-and-bound solver handles up to 10 jobs and four venues and distinguishes a proved optimum from the best candidate before its search limit. Larger schedules use the greedy scheduler. |

## Appearance and presentation

| Capability | Status | Actual behavior |
| --- | --- | --- |
| SVG knockout visualizations | Implemented | Real source links, upper/lower bracket lanes, conditional finals, selectable matches and long-name labels. |
| Other competition displays | Implemented | Match grids, group/overall standings and multi-entrant scores. |
| Bracket controls | Implemented | Zoom, fit, keyboard scrolling, round/stage selection, participant highlighting, score/seed visibility and RTL orientation. |
| Advanced bracket layouts | Implemented | Horizontal, vertical, centered-final and compact layouts, RTL connectors and matching SVG export. Collapse/reopen individual rounds; optional pointer panning and keyboard scrolling. Centered finals require a single championship tree. |
| Theme presets | Implemented | 50 presets across 14 game collections, with 17 original vector motifs and 12 material treatments as well as typography, geometry and color tokens. Original preset IDs remain compatible. |
| Related game themes | Implemented | At least two related choices for each activity. Game-specific creation previews, workspace identity, match cards, scorekeeper artwork and presentation backgrounds. |
| Theme Studio | Implemented | Game recommendations, bilingual search, full-catalog browsing, live preview, colors with contrast warning, fonts, size, spacing, borders, corners, connectors, raster background/logo and reduced motion. |
| Custom theme portability | Implemented | Versioned theme JSON import/export, applied to the current tournament without changing results. |
| Saved personal theme library | Implemented | Up to 50 named theme-only copies, with apply, duplicate, rename, delete, export and reload. Images require an explicit opt-in; the personal library is separate from vaults. |
| Advanced design controls | Implemented | Structured two-color gradients, angle, weight, alignment, card surfaces, table variants, shadows, winner emphasis, animation duration, bracket layout and sponsor position. Imported CSS, HTML and code are rejected. |
| Presentation playlist | Implemented | Add/remove/reorder scenes, duration/title/public text, rotation, pause and manual controls. |
| Presentation scenes | Implemented | 21 types, including title, participant list and introductions, brackets, standings, scoreboard, upcoming/results/schedule/statistics, countdown, break, rules, sponsors, announcement, semifinals/final introductions, champion, podium, trophy and QR. |
| Dedicated introductions and celebrations | Implemented | Selected-participant introductions, semifinal and final introductions, and a trophy scene backed by an actual decided champion. Reduced motion and offline slide export are supported. |
| Display modes | Implemented | Fullscreen, 16:9, 4:3, portrait and strip/stacked/compact overlays with transparent, chroma or theme backgrounds. SVG/PNG overlays retain transparency; window capture can be opaque. |
| Local live display | Implemented | Confirmed saves notify same-origin tabs; displays reload saved state. Protected tabs must be unlocked separately. |
| OBS use | Implemented | Capture the unlocked browser window, use chroma backgrounds, or export overlay images. Separate OBS browser sources do not share another browser profile's IndexedDB. |
| QR generation | Implemented | Creates a QR for links up to the conservative 1,800-byte limit; otherwise recommends a file/code. |
| QR camera scanning / multipart transfer | Implemented | Local PNG/JPEG decoding, explicit camera start/stop, and numbered multipart QR export/reassembly. Canceling or changing import input invalidates pending reads and releases late camera streams. Up to 128 parts of 900 characters with part/package checksums. Incomplete or mixed transfers cannot be imported; camera hardware availability varies. |

Theme collections:

| Activity | Related choices |
| --- | --- |
| Open competition | Minimal Light, Minimal Dark, Modern Glass, Editorial, Professional Corporate, Championship Gold, Festival, Boxing, Classic Sports Broadcast, Winter, Summer |
| Football | Football Stadium, Football Chalkboard |
| Futsal | Futsal After Hours, Futsal Parquet |
| Basketball | Basketball Arena, Basketball Street Court |
| Volleyball | Volleyball Court, Volleyball Coastline |
| Tennis | Tennis Championship, Tennis Clay Club |
| Table tennis | Table Tennis Spin, Table Tennis Clubhouse |
| Badminton | Badminton Featherlight, Badminton Midnight Hall |
| Chess | Chess Classic, Chess Manuscript |
| Esports | Esports Neon, Retro Arcade, Cyber Arena, Esports Pearl Console, Esports Terminal |
| Racing | Racing, Racing Pit Lane, Racing Desert Rally |
| Board games | Fantasy Championship, Board Game, Board Game Mahogany, Board Game Hex Atlas |
| Quiz | University, Quiz Academy, Quiz Laboratory |
| Gol Ya Pooch | Persian Heritage, Gol Ya Pooch Traditional, Modern, Night, Saffron, Courtyard, Velvet, Ink House |

## Sports and Gol Ya Pooch

| Capability | Status | Actual behavior |
| --- | --- | --- |
| Sport presets | Implemented | Generic, football, futsal, basketball, volleyball, tennis, table tennis, badminton, chess, esports, racing, board games, quiz/academics and Gol Ya Pooch. |
| Sport-specific statistics | Implemented | Typed entrant-level measured/judge/placement dimensions and private roster-player observations with sport templates and custom numeric metrics. Sum/mean/min/max summaries use actual entered evidence. Missing measurements stay missing. |
| Player-event timeline | Implemented | Match/team/player identity, period, elapsed time, notes and recorded value; private totals, match history and CSV. Corrections/removal/restoration keep reasons and prior values. Result or roster changes quarantine affected observations for review. Public projections omit the entire extension. Limits: 50 metrics, 5,000 events and 30 prior edits per event, plus tournament revisions. |
| Custom reusable sport presets | Implemented | Named local library with save, apply, import/export and delete. Presets contain rules, entrant kind, duration and theme ID; no entrants, results or raster assets. Applying replacement rules is blocked after play. |
| Gol Ya Pooch teams and rosters | Implemented | Default three-player rule; organizer enters the actual player names and roles in Participants. |
| Gol Ya Pooch quick scoring | Implemented | Enter totals and confirm the result through the normal match engine. |
| Gol Ya Pooch referee mode | Implemented | Concealing/guessing teams, hand awards, possession switch, structured cards, hand undo, live public totals and private concealed-position field. |
| Gol Ya Pooch timer | Implemented | Persisted accumulated time and running timestamp survive close/reload and private backups. Device-clock timing is capped at seven days. Start/pause/reset commit changes; display ticks stay in memory. |
| Gol Ya Pooch rules | Implemented | Manual confirmation, target plus margin or timed periods; target/sudden-death wins finalize through the engine after a hand. Expired periods require an explicit ruling. Players, points and policies remain configurable. |
| Gol Ya Pooch overtime/abilities | Implemented | Manual, sudden-death or extra-time tie policy. Structured cards define role eligibility, match/period limits, multiplier, points, possession and clock effects. Latest-hand undo preserves ordered effects; no imported executable rule code. |
| Referee-secret exclusion | Implemented | Public projections omit private position, hand log, notes and rosters; only explicit live totals reach displays. Complete private backups intentionally retain them. |

## Persistence, portability and privacy

| Capability | Status | Actual behavior |
| --- | --- | --- |
| IndexedDB persistence | Implemented | Versioned documents behind a repository interface, transactional saves and confirmed-save feedback. |
| Save failure recovery | Implemented | Errors are shown; an unsaved copy can be exported or the saved document reloaded. |
| Revision history | Implemented | Last 50 logical revisions with command deltas and periodic full checkpoints. Restore creates a new revision; individual revisions and retained history can be exported. |
| Event-sourced history and visual diffs | Implemented | Validated command-v1 updates between checkpoint-v1 documents, full checkpoint every tenth consecutive revision or large change, atomic pruning/rebasing, encrypted protected history and paged revision comparisons. Private fields are hidden by default. |
| Multi-tab conflicts | Implemented | Revision, content hash and protection-state checks reject stale writes, including same-revision reimports and vault secret changes. BroadcastChannel notifications follow the successful transaction. Document saves and vault transitions retain concurrent favorite, trash, restore and backup changes. |
| Trash and permanent deletion | Implemented | Restore from trash; separate confirmation before permanent deletion. |
| Library tools | Implemented | Search, recent/name sorting, grid/list view, favorites, in-progress/trash filters and duplication. |
| Sport/format library filters | Implemented | Filter local tournaments by sport and any included stage format. Protected library entries omit sport and format metadata. |
| Storage Health | Implemented | Browser quota/usage estimates, persistence request, last save and manual-backup record. |
| Automated backup scheduling/reminders | Implemented | Opt-in reminders run while the app is open, with interval and snooze controls. Backups remain explicit downloads; revision-aware metadata prevents an older export from marking newer edits as backed up. |
| Protected vault | Implemented | Encrypted current document and every revision command/checkpoint, secret required to open and explicit lock. Protected library entries omit private title, sport and format metadata. |
| Inactivity locking | Implemented | Protected tournament/event tabs lock after 15 inactive minutes by default, with off/1/5/15/30/60 settings. Trusted input resets only that tab; incoming saves do not. Lock discards decrypted previews and unconfirmed drafts, retains confirmed encrypted writes, and guards late callbacks. |
| Cryptography | Implemented | AES-256-GCM, random salts/nonces, PBKDF2-SHA256 at 600,000 iterations and authenticated contexts. |
| Signed packets and trusted keys | Implemented | TSS1 uses ECDSA P-256/SHA-256 around bounded portable data, including encrypted codes. Public-key trust requires a separately confirmed fingerprint. Private keys stay in memory with encrypted backups and explicit/inactivity locks. Verification leads to extraction and normal import review, never automatic approval. No claim of verified human identity, trustworthy timestamps or remote revocation. |
| Password reset | Unsupported due to static-hosting constraints | There is no account or recovery authority. An encrypted archive needs its correct secret. |
| Snapshot link and text code | Implemented | Compressed, versioned data-bearing fragment and `TS1` code with integrity checks, Unicode and optional encryption. |
| Separate-secret encrypted sharing | Implemented | Link, code or archive can require a separately supplied secret. |
| Embedded-key encrypted links | Implemented | TSK1 wraps an encrypted snapshot with a generated 192-bit secret. Anyone holding the full link can decrypt it; the interface explains this before sharing. |
| `.tourney` archives | Implemented | Validated two-entry ZIP with current document, embedded raster assets, theme and audit entries; optional encryption. |
| Full revision-table export | Implemented | Optional archive v2 includes the current document and up to 50 retained snapshots. Each revision is validated and hashed; history imports atomically and can remain encrypted. Version 1 archives still import. |
| Import preview / local copy / fork | Implemented | Preview first; preserve identity for a local copy or assign a new identity for an independent fork. Changing the selected input invalidates pending previews and errors from the previous selection. |
| Replace current document | Implemented | Explicit confirmation and a recoverable previous revision. |
| Compact recipe | Implemented | TSR1 handles single stages and TSR2 recreates multi-stage configuration with new IDs, positional entrant references and venue placeholders. Names, results, sponsor content and assets are omitted. Connections to recorded match outcomes require a full snapshot. |
| Incremental updates | Implemented | Versioned `TSP1` packets with exact ID/base revision/base hash, target hash, allowed operations, preview and transactional application. |
| Divergent update merge | Implemented | Explicit operation selection against the verified saved base, local and sender versions. Results replay through the engine and require confirmation for affected played matches. Unsafe generated-structure rewrites require a separate fork. |
| Patch encryption | Implemented | TSP1 update packets can use authenticated encryption with a separately supplied secret. Wrong secrets and damaged ciphertext are rejected. |
| Transfer advice | Implemented | The local assistant estimates snapshot size, recommends a transport for the selected purpose/privacy and performs the actual link, archive, recipe or update export. |
| Read-only viewing | Implemented | Import preview and spectator display. This is a UI behavior, not copy protection. |
| Remote revocation / live cross-device sync | Unsupported due to static-hosting constraints | Shared snapshots are independent and cannot be revoked; later changes require another packet or file. |

## Exports, records and platform

| Capability | Status | Actual behavior |
| --- | --- | --- |
| SVG / PNG bracket export | Implemented | Text is escaped; PNG size is bounded. SVG is preferable for large graphs. |
| PDF | Implemented | Browser print dialog offers Save as PDF where the platform supports it. No separate PDF rendering engine. |
| Print-friendly HTML | Implemented | Standalone public tournament HTML download with standings, schedule and stage brackets, escaped content and printable pages, alongside browser print output. |
| Participant/match CSV and schedule ICS | Implemented | Portable tabular data and calendar events, with formula/injection defenses. |
| Scoreboard images, posters and slide files | Implemented | SVG/PNG scoreboards, champion posters and paginated standings. Width-aware text wrapping preserves graphemes, scores keep every digit, and long introduction descriptions continue on extra slides. Selected presentation scenes export as a ZIP of standalone SVGs, manifest and offline HTML viewer. These are snapshots; no PPTX or running countdown is implied. |
| Statistics | Implemented | Recorded wins/losses/draws, win percentage, scores, difference, points, recent results and a points chart; BYEs do not inflate played totals. |
| Elo and rating history | Implemented | Configurable Elo from completed played/drawn two-entrant matches, explicit cross-tournament identity mappings and TSH1 result packets. |
| Multi-format predictions | Implemented | TSB1 version 2 supports generated static stages and dynamic-round scopes: winner/loser paths, draws, conditional resets and full placement rankings with ties. Swiss, three-loss and challenge formats predict only the generated round. Exact correct outcomes score one point, with shared ranks and separate scope/schema leaderboards. Legacy version-1 packets remain readable. Imported identity/time claims remain unverified. |
| Events and seasons | Implemented | Collections, divisions, explicit shared directory, weighted standings, reasoned adjustments, shared schedule conflicts, public presentation, archive/restore and encrypted packages. Reviewed promotion/relegation creates new independent league divisions; source seasons remain unchanged. |
| English/Persian interface | Implemented | Bilingual main screens, RTL, locale formatting, mixed-script names, bundled fonts, generated match labels and mapped engine/import diagnostics. Unknown external errors retain their original details after a Persian explanation. |
| Live language changes and bilingual exports | Implemented | Default bracket direction follows language changes; manual orientation has a Follow language reset. Editable names follow their content direction. SVG labels reserve separate score areas, cards scale with fonts, and graphics/print embed local Persian/Latin fonts. Generated export labels translate without rewriting organizer labels or tournament data. |
| Keyboard and screen-reader support | Implemented | Named controls/regions, hints, modal and mobile-drawer focus containment/restoration, inert backgrounds, current-route states, route titles/focus, section/save announcements, public scoreboard announcements and keyboard alternatives to dragging. Cross-browser English/Persian interaction, accessibility-tree, AA-rule and reflow checks are repeatable. ACCESSIBILITY.md distinguishes these checks from human speech-quality audits and independent certification. |
| Reduced motion | Implemented | Presentation respects OS preference and the theme setting. |
| Offline PWA | Implemented | Manifest, local icons, app-shell precache, update prompt and offline state. Initial caching must finish before offline use. Browser test results are reported separately. |
| GitHub Pages configuration | Implemented | Static hash routes, owner/repository-derived base and local build publication from main/docs. No repository CI workflows. Actual publication depends on GitHub permissions/settings. |
| Runtime external dependencies | Implemented | Core assets, fonts and libraries are bundled. No backend, required runtime CDN, remote database or analytics service. |
| Import hardening | Implemented | Schema checks, bounded JSON/decompression, archive entry/path checks, safe raster validation and no executable imported code. |
| Data migrations | Implemented | Schema-1 legacy fixtures and untagged revision snapshots remain readable without rewriting their bytes. Known optional extensions are validated; unsupported schema/command versions fail without modifying storage. No hypothetical earlier document schema is fabricated. |
| Legacy backup timezone review | Implemented | Tournament import previews flag schedule values without offsets. Select fields, source timezones and optional wall-time edits; preview UTC instants and resolve repeated daylight-saving times explicitly. Corrected save/fork imports retain the original revision and append a correction atomically. Keeping original times requires acknowledgement. Explicit offsets, audit times and verified patches remain unchanged. |
| Browser performance | Implemented | Participants, matches and schedule use bounded pages with full search. Draw and venue searches run in cancelable module workers; fallback is explicit. Dutch generation, advancement, simulation and recipe reconstruction use a separate cancelable worker without a blocking fallback. Indexed conflict candidates and memoized graph lookups reduce repeated scans. Browser checks cover 512 entrants; practical format and match limits remain. |
| Automated verification | Implemented | Engine/property, storage, sharing, cryptography, security and visual/export tests exist and are executable. Use the release report for commands and actual results. |
| Central accounts, registration, payments, notifications | Unsupported due to static-hosting constraints | Manual registration/result packets and portable snapshots replace selected exchange workflows. No payment processing or remote message delivery. |

## Platform and verification boundaries

The working policies above do not imply federation certification or support for
every tournament convention. The named Dutch engine supplies its documented
pairing/color algorithm; other federation systems, automated video/game
verification and certified timing are outside the supplied policies.
Travel paths require organizer-entered network data; live maps, geocoding,
traffic and measured travel times are not supplied. Accessibility has browser
accessibility-tree, automated and keyboard coverage. Human assistive-device
speech-quality audits and independent WCAG certification are not claimed.

These are distinct from the hosted services this static application deliberately
does not supply. New formats and rule variants need explicit contracts and tests
before their status changes.
