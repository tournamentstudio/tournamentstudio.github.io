# TournaStudio data formats

TournaStudio stores and transfers versioned JSON documents. The domain contract is in `src/domain/types.ts`; the parser and limits are in `src/domain/validate.ts`. Data imports never evaluate scripts.

## Tournament document

The first public schema is version `1`. A document has a stable `id`, integer `revision`, `revisionHash`, creation and modification timestamps, locale, timezone, sport, status, participants, stages, matches, scoring rules, theme, presentation, schedule, metadata, and audit history.

Entrants can be individuals or teams with rosters. Match slots contain an entrant ID, a winner or loser reference to an earlier match, or an empty place awaiting qualification. A match can contain more than two entrants. Results contain scores, winner IDs, an outcome, a timestamp, and optional sets and placements. Optional `liveScores` publish current totals without disclosing the private hand log; their length must match the slot count.

An optional participant `location` contains only finite numeric `latitude`
(-90 to 90) and `longitude` (-180 to 180), in decimal degrees. Both are required
when the object is present; unknown keys and numeric strings are rejected.
Absent locations remain absent, preserving older canonical documents. This
field represents an organizer-entered competition base and is excluded from
public projections and recipes. Private packages retain it.

Schedule resources may also contain an optional strict `location` with the same
coordinate schema. Venue coordinates are omitted from public projections and
recipes. Resource IDs, names and availability remain public. Private packages
preserve the complete resource object.

Stage configuration and metadata can preserve safe JSON extensions. Extensions cannot contain executable values. Unknown top-level properties are rejected, rather than silently discarded. Unknown schema versions fail with an instruction to keep the source file and update the application. There is no earlier published schema to migrate.

Validation checks duplicate entity IDs, entrant references, winner identities, match sources, and cycles in stage and match dependencies. Scoring legality and pairing rules are checked separately by the competition engine.

Current document limits:

| Item                                      |  Limit |
| :---------------------------------------- | -----: |
| Participants                              |    512 |
| Stages                                    |     64 |
| Matches                                   | 20,000 |
| Presentation scenes                       |    100 |
| Audit entries in the document             |    500 |
| JSON nesting depth                        |     40 |
| Serialized document                       | 16 MiB |
| Imported code or archive compressed bytes | 12 MiB |
| Embedded image data URL                   |  2 MiB |

The match cap means a full round robin with 512 entrants does not fit one document. Algorithm tests for a participant count do not imply every format fits that count.

## Stage advancement connections

Existing sources remain `{ "stageId": "...", "count": 2, "perGroup": true }`.
Two optional fields extend the version 1 schema without inserting defaults into
older documents, so parsing a legacy source does not change its revision hash.

`selection` can choose exact positions:

```json
{
  "stageId": "groups",
  "count": 2,
  "perGroup": false,
  "selection": {
    "kind": "positions",
    "picks": [
      { "group": "A", "rank": 1 },
      { "group": "B", "rank": 2 }
    ]
  },
  "bracketSlots": [1, 2]
}
```

Omit a pick's group to use overall stage standings. The count must equal the
number of picks. `bracketSlots` maps the source's output order to physical
first-round positions in single or double elimination. Slots are one-based;
adjacent pairs play each other. Every mapped qualifier needs a distinct slot.

A wildcard source selects a finishing position across round-robin groups:

```json
{
  "stageId": "groups",
  "count": 2,
  "perGroup": false,
  "selection": {
    "kind": "wildcard",
    "rank": 3,
    "groups": ["A", "B", "C", "D"],
    "comparison": "per-match",
    "tieBreakers": ["points", "differential", "scored"]
  }
}
```

Omitting `groups` includes every source group. Comparison is `total`,
`per-match`, or `discard-bottom`. Criteria are ordered and distinct; supported
values are `points`, `wins`, `differential`, `scored` and `seed`. The algorithms
and unresolved-tie behavior are described in [ARCHITECTURE.md](ARCHITECTURE.md).
Selections and slot mappings survive public snapshots, archives and patches.
Older app builds that do not recognize these fields reject the document safely;
update the app before importing it.

## Group draw rules

Groups and GSL stages can store an optional versioned `config.draw`:

```json
{
  "version": 1,
  "pots": [
    {
      "id": "pot-1",
      "name": "Top seeds",
      "participantIds": ["team-1", "team-2"]
    },
    {
      "id": "pot-2",
      "name": "Next seeds",
      "participantIds": ["team-3", "team-4"]
    }
  ],
  "restrictions": [
    { "field": "region", "maxPerGroup": 1 },
    { "field": "organization", "maxPerGroup": 1 }
  ]
}
```

Pots must assign every active stage entrant once, with at most one entrant from
each pot in a group. An empty `pots` list permits restrictions without pots.
Region and organization use participant fields. The rule schema rejects unknown
properties, duplicate pots, duplicate entrants, missing participant references
and repeated restrictions. Semantic draw checks run separately, so a draft can
remain stored while a source stage is unfinished.

Generated `metadata.groups`, `drawSeed`, `drawOrder` and `drawAlgorithm` record
the draw. This configuration survives public snapshots, archives, encrypted
backups and update packets. Pot names and affiliations are public data. Unknown
configuration versions fail safely. Absent optional draw fields remain absent,
preserving the canonical form of older documents.
Older app releases can preserve this configuration as extension data but do not
enforce it when regenerating groups. Update the app before drawing a shared
tournament that uses these rules.

New recipes use `participantReferences: "positions"` and replace participant
identifiers in pots and other configuration lists with `slot-1`, `slot-2`, and
so on. Import resolves these positions to new participant identifiers. Recipes
retain restrictions but omit participant affiliations; the recipient must fill
those fields before drawing. Legacy recipes without this marker retain their
original interpretation.

## Knockout draw rules

Single and double elimination accept an optional, separate `config.knockoutDraw`:

```json
{
  "version": 1,
  "pots": [
    {
      "id": "pot-1",
      "name": "Top seeds",
      "participantIds": ["team-1", "team-2"]
    },
    {
      "id": "pot-2",
      "name": "Next seeds",
      "participantIds": ["team-3", "team-4"]
    }
  ],
  "restrictions": ["region", "organization"],
  "protectedSeeds": 2
}
```

With pots enabled, each active stage entrant must appear exactly once. Entrants
from the same pot cannot meet in the first round. Each selected affiliation
restriction also forbids matching two equal normalized labels in that round.
Empty pots and restrictions permit seed protection alone. Version 1 restricts
only the first round.

Version 2 adds a required nonempty `separation` array for later-round rules:

```json
{
  "version": 2,
  "pots": [],
  "restrictions": ["region", "organization"],
  "protectedSeeds": 2,
  "separation": [
    { "field": "region", "throughRound": 3 },
    { "field": "organization", "throughRound": 2 }
  ]
}
```

Each separation field must also appear in `restrictions`, and may appear only
once in `separation`. `throughRound` is an integer from 2 to 9 and cannot exceed
the number of winners-bracket rounds in the actual draw. Restrictions without
a separation entry keep their version 1 first-round meaning. Pot separation
always applies only to the first round.

For a rule through round `r`, equal normalized labels must occupy different
blocks of `2^r` consecutive physical opening slots. This guarantees they cannot
meet through that winners-bracket round for any results. BYE recipients count
toward the rule. A field with sixteen slots has four blocks for round 2, so no
region can have more than four entrants under that rule. Protecting through the
winners final requires every entrant's restricted label to be unique.

Version 2 does not cover the losers bracket, double-elimination grand finals
or resets, or third-place matches. The solver does not change pairings after
results are entered. Regions are participant labels, not geographic distances.
Older version 1 configurations retain their representation and algorithm.
Setting every restriction back to round 1 in the editor restores version 1.

Version 3 adds double-elimination losers-bracket protection:

```json
{
  "version": 3,
  "pots": [],
  "restrictions": ["region"],
  "protectedSeeds": 0,
  "separation": [],
  "losersSeparation": [{ "field": "region", "throughRound": 1 }]
}
```

`separation` keeps its version 2 meaning but may be empty. `losersSeparation`
contains one or two unique field rules, with integer `throughRound` values from
1 to 16. The chosen round must exist in the actual losers bracket. A two-entrant
double-elimination draw has no losers-bracket rounds and cannot use these rules.
Only double-elimination stages accept version 3.

Losers fields are independent of `restrictions`: a region can be protected in
the losers bracket without restricting winners-bracket pairings. Every entrant
needs a nonempty normalized label for each enabled field in either bracket.
The draw considers every possible first defeat and subsequent lower path,
including BYEs. Equal labels cannot meet through the chosen losers round for
any result sequence. Grand finals, resets and placement matches are excluded.
No match is rerouted after results are entered.

Removing the last losers rule restores version 2 when later winners rules
remain, or version 1 otherwise. Existing version 1 and 2 configurations retain
their representation and deterministic behavior.

Version 4 adds final and third-place targets:

```json
{
  "version": 4,
  "pots": [],
  "restrictions": [],
  "protectedSeeds": 0,
  "separation": [],
  "losersSeparation": [],
  "finalsSeparation": [
    { "field": "region", "targets": ["grand-final", "reset"] },
    { "field": "organization", "targets": ["grand-final"] }
  ]
}
```

`finalsSeparation` contains one or two unique fields. Each rule has a nonempty
array of unique targets from `grand-final`, `reset` and `third-place`. Final
fields are independent of first-round and later-round fields. `separation`
and `losersSeparation` retain their earlier meanings and may both be empty.
Unknown keys, fields, targets and duplicate entries are rejected.

`grand-final` requires double elimination. `reset` also requires the stage's
`grandFinalReset` setting. Either target requires a nonempty, distinct normalized
label for every active entrant in the selected field. Any pair can reach both
finals, so a duplicate cannot be resolved by moving entrants in the draw.

`third-place` requires single elimination with `thirdPlace` enabled and at least
three active entrants. The solver prevents matching affiliations among the two
possible semifinal losers from occupying opposite halves. An opening BYE in a
four-slot bracket has no loser and is excluded from this encounter test. With
three entrants the third-place match has no pair to separate. No other placement
matches are implied. Both selected fields still require labels for all entrants.

Version 4 uses `knockout-finals-fnv1a-mulberry32-v4`. All rules, pots, fixed slots
and BYE entitlements apply together. Removing all final targets restores version
3 if lower rules remain, version 2 if only later winners rules remain, or version
1 otherwise. Versions 1, 2 and 3 retain their canonical representation and draw
algorithms; they are not silently upgraded.

Version 5 adds a required `distance` rule and permits empty affiliation arrays:

```json
{
  "version": 5,
  "pots": [],
  "restrictions": [],
  "protectedSeeds": 0,
  "separation": [],
  "losersSeparation": [],
  "finalsSeparation": [],
  "distance": {
    "minKm": 100,
    "maxKm": 900,
    "winnersThroughRound": 1,
    "losersThroughRound": 0,
    "finals": []
  }
}
```

At least one of `minKm` and `maxKm` must be present. Bounds are finite numbers
from 0 to 20016 kilometers, inclusive; minimum cannot exceed maximum. Missing
bounds mean no limit on that side, while zero remains an explicit limit.
`winnersThroughRound` ranges from 0 to 9 and `losersThroughRound` from 0 to 16.
Zero disables that bracket; a positive limit protects all rounds from 1 through
the selected round, which must exist in the actual draw. `finals` contains unique
targets from `grand-final`, `reset` and `third-place`. At least one bracket range
or final target must be enabled. The same distance interval applies to every
selected target, independently of affiliation rules.

Lower and grand-final targets require double elimination. Reset protection also
requires the reset setting; third place requires the existing single-elimination
third-place match. Every active entrant needs valid coordinates before preview or
generation, including BYE recipients. Distances use a Haversine calculation on a
sphere with radius 6371.0088 km. Comparisons use unrounded values and include the
limits; preview rounding does not decide eligibility. This is a versioned
competition policy, not a road-distance or ellipsoidal survey calculation.

Version 5 uses `knockout-distance-haversine-fnv1a-mulberry32-v5`. Pairwise incompatibilities
are checked against every possible selected match path without transitive
location grouping. Removing distance rules restores version 4, 3, 2 or 1 as
needed by the remaining affiliation rules. Existing rule versions retain their
representation and draw algorithm. Public packages retain distance rules and
generated matches but omit coordinates, so regeneration needs new locations.
Private packages and private updates retain both; recipes retain only the rules.

Version 6 adds required `venueRules` and makes the opponent `distance` optional:

```json
{
  "version": 6,
  "pots": [],
  "restrictions": [],
  "protectedSeeds": 0,
  "separation": [],
  "losersSeparation": [],
  "finalsSeparation": [],
  "venueRules": [
    {
      "resourceId": "west-court",
      "maxKm": 500,
      "targets": [{ "bracket": "winners", "round": 2, "index": 0 }]
    }
  ]
}
```

There must be 1 to 64 venue rules and at most 1024 total targets. Each rule needs
an existing schedule resource, at least one target and at least one inclusive
`minKm` or `maxKm` bound from 0 to 20016 km. Minimum cannot exceed maximum. Zero
remains distinct from an absent bound. A target has a bracket (`winners`,
`losers`, `final`, `reset` or `placement`), a one-based round and zero-based match
index. It must identify an actual match in the configured single/double bracket.
No target can occur twice, including across different rules. Disabled optional
matches and targets invalidated by a field-size change are rejected.

Every active entrant and referenced venue needs coordinates to preview or
generate the draw. All possible entrants in a selected match slot must satisfy
its base-to-venue bound, including entrants receiving automatic advances.
Recorded results do not weaken eligibility. Generation writes the selected
resource ID to the target match, and scheduling preserves that assignment.
Missing coordinates do not prevent importing public copies or scoring saved
matches. Public copies need coordinates before scheduling or regenerating these
draws. The algorithm identifier is `knockout-venue-haversine-fnv1a-mulberry32-v6`.
Versions 1 through 5 retain their canonical representation and draw algorithm.

Venue recipes add optional `venueResources` to the version 1 recipe envelope.
This bounded list contains only unique IDs and names. Export replaces source
resource identities and names with numbered venue placeholders, remaps the
rules, and omits coordinates and availability. Import creates fresh resources
and remaps every rule again. Missing, duplicate or unknown references fail;
unknown fields such as coordinates in this recipe list also fail. Legacy recipes
without venue rules retain their previous representation.

`protectedSeeds` pins the first specified number of entrants in the selected
draw order to their standard seed positions. For a field of `n`, the bracket
has the next power-of-two slot count and exactly `slotCount - n` BYEs. The first
that many entrants in the selected order receive those BYEs. Random seeding
therefore randomizes BYE recipients and protected entrants too. Explicit source
`bracketSlots` remain fixed. Contradictory pins, protection and BYE entitlements
fail rather than changing the source mapping or awarding extra BYEs.

The optional object is validated on import and retained by public snapshots,
files, encrypted backups and updates. Pot names and affiliations remain public.
Recipes remap its pot references to new entrant IDs, without carrying names or
affiliations. Absent fields remain absent in older documents and their hashes.
Unknown rule versions are rejected. A release that supports only versions 1 to 5
rejects version 6 instead of ignoring its venue rules. Earlier releases
from before knockout-rule validation may preserve the entire object as extension
data without enforcing it; update the app before regenerating a shared tournament
that uses it.

Automatic venue selection is an editor operation. Its candidate pool and
availability preference are temporary; applying a proposal writes ordinary
version 6 `venueRules`. Existing bounds and targets remain intact, and matching
resource/bound rules may receive more targets. A proposal does not add a new
persisted algorithm version, resource identity or schedule entry. Public
projections still omit coordinates, private backups retain them, and recipes
replace venue identities and require new coordinates before a new draw.

## Canonical form and hashes

JSON object keys are sorted recursively; array order remains significant. Optional properties with `undefined` values are omitted in the same way as `JSON.stringify`. Non-finite numbers and unsafe object keys are rejected.

`revisionHash` is the URL-safe, unpadded Base64 encoding of SHA-256 over the canonical document with `revisionHash` omitted. Timestamps, revision, history, and array order are included. Public and private projections of the same revision have different hashes.

These hashes detect accidental changes. A sender can change data and recompute a checksum. Hashes do not establish authorship.

## Snapshot codes and links

The code format is:

```text
TS1:<base64url(gzip(payload))>.<base64url(sha256(compressed-bytes))>
```

Whitespace in a pasted code is ignored. The checksum is checked before decompression. Decompression counts actual emitted bytes and rejects oversized output.

An unencrypted payload has this shape:

```json
{
  "format": "tournastudio-snapshot",
  "version": 1,
  "scope": "public",
  "hash": "<document-revision-hash>",
  "tournament": {}
}
```

The `tournament` value is the complete validated document. A private package uses `"scope": "private"`. An encrypted payload replaces this wrapper with the encryption envelope described below.

The application puts the URI-encoded code after `#/open/`, using the current origin and path. The fragment carries the data. A short local tournament ID alone is not a cross-device transfer mechanism. The import screen presents a preview before anything is saved.

The public projection removes organizer notes, referee identities, concealed positions, hand logs, rosters, check-in state, participant tags, arbitrary metadata, the tournament description, and audit history. It retains participant names and configured public affiliations, results, scheduling, theme, and presentation content.

The following structural metadata is retained through a typed allowlist because it affects standings or progression:

- Stages: `drawOrder`, `groups`, `championId`, `ladderOrder`, `policy`, `drawAlgorithm`, `drawSeed`, and bounded `canvasPosition`.
- Matches: `championship`, `qualifier`, `conditionalReset`, `undefeatedFinalist`, `pairingBye`, `ladderChallenge`.
- Stage configuration extensions: `groups`, `forbiddenPairs`, `manualQualifiers`, and validated `draw` and `knockoutDraw` rules.
- Participants: a bounded finite numeric `pointsAdjustment`, because it changes public standings and qualification. Other participant metadata stays private.

Presentation scene text is deliberately public. Do not put private information in an announcement, rules slide, or other published scene.

## Tournament archives

A `.tourney` file is a ZIP archive containing exactly two entries:

```text
manifest.json
tournament.json
```

An encrypted archive uses `encrypted.json` in place of `tournament.json`. Images are validated embedded raster data URLs inside the document. Separate arbitrary asset files are not accepted.

The manifest contains:

```json
{
  "format": "tournastudio-archive",
  "version": 1,
  "document": "tournament.json",
  "hash": "<sha256-of-document-file-bytes>",
  "encrypted": false,
  "createdAt": "<ISO-timestamp>"
}
```

`manifest.json` is limited to 4 KiB. The document entry is limited to 16 MiB, including any encryption envelope overhead. The ZIP directory, footer, entry names, entry count, declared size, and actual decompressed size are checked. Duplicate entries, path traversal, extra files, multipart archives, ZIP comments, unsupported compression, and damaged containers are rejected.

Version 1 archives contain the current document and its audit entries. Version 2 archives can include up to 50 retained revision snapshots inside a `tournastudio-history-backup` envelope. Its `current` snapshot package and `revisions` array share the encryption envelope when encrypted. Each revision carries its action label and document; IDs, unique revision numbers and hashes are verified before one import transaction. Revision numbers cannot exceed the current document. Existing archive byte and file-count limits still apply to the entire backup. An old backup remains a recovery point after local history is trimmed.

## Encryption envelope

Encryption uses browser Web Crypto. The envelope fields are:

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "<16-random-bytes-base64url>",
  "nonce": "<12-random-bytes-base64url>",
  "context": "package",
  "ciphertext": "<ciphertext-with-authentication-tag-base64url>"
}
```

The authentication tag is 128 bits. The additional authenticated data is `TournaStudio:1:<context>`. Context is `tournament`, `package`, or `revision`. Each encryption generates a new salt and nonce. The password is never included in the envelope.

Secrets must contain 8 to 1024 characters. A longer random secret is preferable to a short password. `createRecoverySecret()` generates 24 random bytes, encoded as 32 URL-safe characters. The current sharing interface supports a separately supplied secret. It does not embed the decryption secret in a link.

## Compact recipes

`TSR1` uses the same compression and checksum framing as snapshot codes. A recipe contains the first stage's format and settings, entrant count, sport, scoring rules, theme settings, and presentation defaults. It omits participant names, matches, results, uploaded logos, backgrounds, sponsors, and scene text.

Import creates new IDs and numbered entrants. Assigned groups, pairing restrictions, and manual qualifiers use `slot-1`, `slot-2`, and later participant positions, marked by `participantReferences: "positions"`. Import remaps these positions to the new entrant IDs. It rejects unknown positions. Older recipes without participant assignments remain supported. The legacy import interface generates the first stage from these settings. New exports use `TSR2`: all stages, stage dependencies, exact positions, wildcards, fixed slots and required venue placeholders are included. Stage and entrant identifiers are replaced with positional references, then new IDs on import. Names, uploaded images, results, private metadata and coordinates are excluded. Venue rules need replacement coordinates before a new constrained draw.

## Update packets

`TSP1` uses the same transport framing. A packet contains:

- `format: "tournastudio-patch"` and `version: 1`.
- Patch `id` and `tournamentId`.
- `baseRevision`, `baseHash`, `targetRevision`, and `targetHash`.
- An ordered `operations` array.
- A SHA-256 `checksum` of the canonical packet with the checksum omitted.

Operations use `set` or `remove`. Paths address an allowed top-level field, or an entity ID under `participants`, `stages`, or `matches`. The format does not allow arbitrary JavaScript property paths. Conflicting or repeated paths are rejected. IDs cannot be changed by an entity replacement.

Changed matches are transferred individually. Adding, removing, or reordering entities transfers the affected collection to preserve ordering. The packet carries the target audit history when it changes.

Application requires an exact tournament ID, revision, and base hash. The result is schema-validated and hashed before the write transaction. A duplicate target is rejected. Divergent copies require the actual stored base with the packet's hash. Review compares each operation against base, local and incoming state. Selected changes create a new local revision. Match results replay through the engine; affected played/live matches require an impact confirmation. Generated structure removal and other blocked operations require a separate fork. A stale preview cannot overwrite a later local save.

Use a public projection at both ends when generating spectator updates. Private update packets can include notes, rosters, and referee data. Patch codes can wrap the packet in the existing authenticated encryption envelope with `context: "package"`. Decryption precedes strict patch validation. The secret is supplied separately; unencrypted legacy codes remain supported.

`repository.applyUpdate` keeps the packet's exact target revision and hash. A normal edit through `repository.save` creates a new local revision and will intentionally diverge from the sender's copy.

## Offline exchange packet APIs

`src/sharing/packets.ts` defines registration forms, registration responses, and proposed match results. Each has a format identifier and version `1`, and can be serialized as JSON.

Registration fields support text, numbers, booleans, and fixed choices. Required fields and choice values are validated. Response approval checks tournament identity, duplicate packet IDs, duplicate entrant names, and duplicate entrant IDs.

A result proposal contains a tournament ID, match ID, original public match hash, base revision, proposed result, timestamp, and notes. The hash excludes private notes and referee data so a proposal created from a public snapshot can be checked against the organizer's private copy. Validation rejects proposals after the public match state changes. Approval must still pass through the competition engine to validate scoring and downstream effects.

These packet APIs are independent of transport. They do not prove a registrant's or scorekeeper's identity. See `FEATURES.md` for interface availability.

## Local database

Dexie manages the `TournaStudio` IndexedDB database with schema version `1`:

| Store         | Content                                                                |
| :------------ | :--------------------------------------------------------------------- |
| `documents`   | Current tournament or encrypted envelope, revision, and library fields |
| `snapshots`   | Up to 50 recoverable revisions per tournament                          |
| `preferences` | Reserved key/value application preferences                             |

Standard snapshots are compressed. Protected snapshots contain encrypted envelopes. A document update and its revision snapshot commit in the same transaction. Writes compare the expected revision with the current saved revision. A stale writer receives a conflict instead of overwriting another tab.

Restoring a snapshot creates a new revision. Trash is a reversible library flag. Permanent deletion requires a tournament to be in trash and removes both document and snapshots.

## Participant tables

CSV supports quoted fields, doubled quotes and embedded newlines. Headers include name, seed, shortName, kind, status, region, organization, checkedIn, roster, tags, availableFrom, availableUntil, registration, eligibility, payment and note. Roster cells contain a JSON array; tags use semicolons. Availability uses ISO timestamps. JSON imports preserve valid participant fields and safe metadata while assigning fresh participant and roster IDs.

The XLSX reader uses bounded ZIP expansion and native XML parsing for the first worksheet. It reads inline/shared strings, numeric values and booleans. Formulas must be converted to values before import. Active content, external relationships, entity definitions and invalid paths are refused. The table is limited to 512 entrants plus a header and 64 columns. Dates for availability must be ISO text. Workbook exports use typed cells and explicit strings, so formula-looking names remain data. The implementation follows [SpreadsheetML cell definitions](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell).

## Visual archive

Export Studio writes standalone SVG files with embedded local font data, a versioned slide manifest, and a static HTML viewer in a ZIP. Every scene first receives the public projection. Lists are paginated and output sizes are bounded. Files represent the current saved view; animation clocks and later scores do not run inside the archive.
