# TournaStudio data formats

TournaStudio stores and transfers versioned JSON documents. The domain contract is in `src/domain/types.ts`; the parser and limits are in `src/domain/validate.ts`. Data imports never evaluate scripts.

## Tournament document

The first public schema is version `1`. A document has a stable `id`, integer `revision`, `revisionHash`, creation and modification timestamps, locale, timezone, sport, status, participants, stages, matches, scoring rules, theme, presentation, schedule, metadata, and audit history.

Entrants can be individuals or teams with rosters. Match slots contain an entrant ID, a winner or loser reference to an earlier match, or an empty place awaiting qualification. A match can contain more than two entrants. Results contain scores, winner IDs, an outcome, a timestamp, and optional sets and placements. Optional `liveScores` publish current totals without disclosing the private hand log; their length must match the slot count.

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
- Stage configuration extensions: `groups`, `forbiddenPairs`, `manualQualifiers`, and validated `draw` rules.
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

Archives contain the full current document and its audit entries. They do not contain the separate IndexedDB revision snapshot table. An old backup remains a recovery point, even after the browser trims its local snapshot history.

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

Import creates new IDs and numbered entrants. Assigned groups, pairing restrictions, and manual qualifiers use `slot-1`, `slot-2`, and later participant positions, marked by `participantReferences: "positions"`. Import remaps these positions to the new entrant IDs. It rejects unknown positions. Older recipes without participant assignments remain supported. The import interface generates the stage from these settings. A recipe describes one starting stage, not a complete multi-stage template.

## Update packets

`TSP1` uses the same transport framing. A packet contains:

- `format: "tournastudio-patch"` and `version: 1`.
- Patch `id` and `tournamentId`.
- `baseRevision`, `baseHash`, `targetRevision`, and `targetHash`.
- An ordered `operations` array.
- A SHA-256 `checksum` of the canonical packet with the checksum omitted.

Operations use `set` or `remove`. Paths address an allowed top-level field, or an entity ID under `participants`, `stages`, or `matches`. The format does not allow arbitrary JavaScript property paths. Conflicting or repeated paths are rejected. IDs cannot be changed by an entity replacement.

Changed matches are transferred individually. Adding, removing, or reordering entities transfers the affected collection to preserve ordering. The packet carries the target audit history when it changes.

Application requires an exact tournament ID, revision, and base hash. The result is schema-validated and hashed before the write transaction. A duplicate target is rejected. Divergent local edits are rejected without replacing local data. There is no selective merge interface.

Use a public projection at both ends when generating spectator updates. Private update packets can include notes, rosters, and referee data. Patch codes are not encrypted; use a protected full archive when confidentiality is required.

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
