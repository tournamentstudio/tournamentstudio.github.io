# Privacy and security

I built TournaStudio to keep tournament management in the browser. The application does not require an account, external database, analytics service, or remote API for its competition features.

GitHub Pages serves the application files. GitHub can receive ordinary site request information, such as the network address and user agent. Tournament documents are not sent to GitHub by the application.

## Local storage

Tournament data lives in IndexedDB for the current origin and browser profile. The service worker's application cache is separate from that database. Updating the application cache does not delete tournament records.

Standard mode stores readable tournament documents in IndexedDB and reopens them without a secret. Anyone who can use the same browser profile may access those tournaments.

Browser storage is not permanent safekeeping. Clearing site data, deleting a browser profile, using private browsing, storage eviction, or device failure can remove access. Persistent-storage permission can reduce eviction risk when a browser grants it; it is not a backup.

Export `.tourney` backups to a place you control. The library records when a backup was requested, but the application cannot verify that a downloaded file was retained or copied to another device.

## Protected vault

Protected mode encrypts the complete tournament before it reaches IndexedDB. Titles, sport, status, rosters, notes, referee information, and audit entries are inside the encrypted document. Library rows show a generic title. The row still exposes an opaque tournament ID, revision, update time, encryption state, trash state, favorite state, backup time, ciphertext size, and a ciphertext fingerprint. The plaintext document hash stays inside the encryption envelope.

Revision commands and checkpoints are encrypted too. Protecting a previously standard tournament reconstructs and encrypts every retained revision, then replaces private library metadata in one transaction. The outer hash of a protected record fingerprints ciphertext, not the plaintext document.

The vault unlocking secret is held in application memory while the document is open. It is not saved in local storage or IndexedDB. A separately requested embedded-key share link deliberately carries its own newly generated sharing secret; this is a different transport choice, not vault key storage. Locking must close the document and clear the application references to its plaintext and secret.

JavaScript memory cannot be guaranteed to be physically erased on demand. A person with developer tools, a compromised extension, malware, or access to an already unlocked browser can read data in memory. Local encryption does not provide server-side identity or permissions.

Converting an existing plaintext tournament to protected mode cannot erase copies that may remain in browser backups, operating-system snapshots, old downloads, or other open tabs. For sensitive data, create the tournament in protected mode from the start and close any other unlocked views.

## Cryptography

Web Crypto provides AES-256-GCM encryption with a 128-bit authentication tag, a fresh 96-bit nonce, and a fresh 128-bit salt for every encryption. Keys come from PBKDF2-HMAC-SHA-256 with 600,000 iterations. Envelope version, algorithm, derivation parameters, and context are checked before decryption.

The derivation cost raises the work needed for password guessing. It cannot make a weak password strong, and it does not prevent an attacker who has ciphertext from trying guesses offline. The minimum accepted secret length is eight characters; use a long password or a random recovery secret for valuable private data.

The library can generate 192-bit random recovery secrets. The interface can accept such a secret as the vault or sharing password. The current implementation derives a fresh non-extractable key per operation and does not persist keys.

Wrong secrets and modified ciphertext fail authentication. No password reset, recovery service, or administrative bypass exists. An encrypted backup is recoverable only with the correct secret. Keep the backup and secret in separate safe places.

## Public projections and referee information

Public sharing and presentation use an explicit `publicProjection()` function. It creates a new document rather than relying on hidden controls or CSS.

The projection removes:

- Match `private` fields, including a concealed object's position.
- Referee names, private match notes, hand-by-hand referee logs, Gol clock/possession state and private timed-run splits/evidence.
- Challenge invitation notes and state, local Elo source mappings and prediction records.
- Player-statistics identities, observations, private notes, quarantined/deleted events and their audit history.
- Team rosters, check-in state, tags, and custom participant metadata.
- Participant base coordinates, including latitude and longitude.
- Venue coordinates attached to courts, tables or rooms.
- Tournament private metadata, correction recovery data, description, and audit history.
- Custom field definitions and values unless explicitly marked public by the organizer.
- Unrecognized stage configuration extensions and arbitrary match or stage metadata.

Typed structural fields needed for brackets and standings are retained. These include qualification rules, pot membership and names, group and knockout restrictions, winners and losers separation round limits, final and third-place separation targets, distance bounds and their target rounds, protected seed counts, graph coordinates and bounded numeric participant points adjustments. Names, region, organization, logos, scores, recorded scoring dimensions, explicit fair-play sanctions, fixtures, public scheduling and presentation scenes remain visible. Sponsor logos and text are intentionally public. Swiss missed-round credits, challenge queue order and aggregate leg outcomes remain visible because they affect competition results.

Distance draws use manually entered city or club base coordinates. No device
location is requested, and no geocoding or routing service receives those values.
Use a competition base instead of a home address. Public snapshots, public
update packets, recipes, standard participant CSV, bracket graphics and printed
results omit the typed location field. A public copy can display and score its
saved draw but needs new coordinates before regenerating a distance-restricted
draw. Private snapshots, archives and private updates retain coordinates; private
updates can be encrypted with a separate secret. Encryption does not change the selected public/private
scope. Rules and saved match pairings remain visible and may reveal that entrants
meet the chosen distance criteria.

Venue-distance rules retain the venue identifier, its public name, match targets
and bounds in public copies. The resource projection omits its coordinates.
Public copies can show and score saved matches, but automatic scheduling or
regeneration of a venue-restricted bracket requires the missing coordinates.
Private backups and private updates retain venue coordinates; private updates
can use separate-secret encryption. Recipes replace venue names and identifiers with placeholders
and create new resource identifiers on import. They require coordinates before
previewing a venue-restricted draw. No address lookup or device-location request
is performed.

Presentation text is intentionally public. A secret typed into a team name, tournament title, sponsor name, or announcement is public content. The application cannot infer that an organizer has placed a secret in a public field.

Complete private backups intentionally contain referee details and other private content. Private snapshots are available only through an explicit scope selection. Encrypt these packages when they need confidentiality.

## Sharing

Snapshot links contain compressed tournament data in the URL fragment. The fragment is not part of the HTTP request for the application page, but it can be visible in browser history, copied messages, extensions, screenshots, and a recipient's address bar.

The application retains incoming code temporarily for the import screen and removes it from the visible route. Do not treat this as a guarantee that all prior copies of a URL have been erased.

If the import screen cannot load, a local recovery dialog retains the received
code in memory and offers copy or text download. Clipboard denial selects the
text for manual copying. The app does not put the code back in the URL or save
it to browser storage. Keep the code before closing or reloading; an embedded
sharing key or private payload remains sensitive in the downloaded copy.

Separate-secret encrypted snapshots, updates and archives require the secret from another channel. The optional TSK1 link includes a generated secret and opens without another password prompt. Anyone receiving the complete link can decrypt it. Encryption never establishes the recipient or sender identity.

Read-only preview is an interface choice. A recipient who has the document can save or modify their own copy. Previously shared data cannot be remotely revoked.

Snapshots do not sync across devices. Later changes require a new snapshot or an update packet. Same-browser presentation updates use a local notification channel and IndexedDB; they are not an internet collaboration service.

## Checksums, updates, and identity

SHA-256 checksums detect incomplete or changed data. They do not authenticate the sender. The same limitation applies to registration responses and scorekeeper result proposals.

Update packets must match the local tournament ID, base revision, and base hash. They are validated before a transaction. Duplicate application is rejected. Divergent copies require the verified saved base and an explicit operation review; incompatible structural changes require a fork. The previous revision remains available in local history, subject to the 50-revision retention limit.

Public updates omit private fields by using the public projection. Private update packets include private data. Select update encryption and share the secret separately when confidentiality is needed.

Ordinary snapshots, rating sources, prediction packets, registration responses and result proposals remain unsigned unless the sender deliberately wraps them in a signed packet. Local prediction freezing blocks late entry through the current UI, but an imported timestamp or device clock cannot prove when a prediction was made. Manual timing evidence is an organizer record, not automated game or video verification.

## Signed packets and local trust

Share Center can create an ECDSA P-256 signing key, sign a portable code or offline registration/result JSON packet, and verify a received `TSS1` packet. Web Crypto signs the UTF-8 canonical envelope with SHA-256. The envelope binds the complete payload, algorithm, format version, public key and fingerprint. Verification rejects changed payloads, mismatched keys, unsupported versions and invalid signatures. It does not execute or automatically import the contents.

A valid signature proves that the corresponding private key signed those bytes. It does not establish a person's real-world identity, referee authority, signing time or truth of the submitted result. A public key carried by a packet starts untrusted. To trust it, compare the complete 64-character SHA-256 fingerprint with the intended signer through a separate trusted channel, enter that fingerprint, assign a local label and confirm the match. The fingerprint is the hash of the raw uncompressed public key, not a hash of its label. An attacker who controls both the message and the channel used for comparison can substitute a key.

The trusted-key list stores up to 100 public keys, fingerprints, local labels and confirmation times in IndexedDB preferences. This list is outside tournament vaults and is readable to anyone using the same browser profile. It is not a certificate authority or a shared directory. Confirmed changes update trust labels in other same-origin tabs. Removing a key removes local trust; it does not revoke existing signatures, delete another recipient's copy or send a remote revocation notice.

An unlocked private signing key is non-exportable through Web Crypto and held in the current Share Center's memory. It is not stored in IndexedDB or local storage. Key creation briefly exports its private material in memory to make a `TSSK1` encrypted backup, then imports a non-exportable signing key. Backups use the authenticated encryption and password derivation described above. Exported `TSPK1` public keys contain no private material. The unlocking secret is cleared from the form after recovery; the encrypted backup and private key are discarded when locking, leaving Share Center, closing the tab or reaching 15 minutes without trusted input. Download the encrypted backup before leaving, and retain its secret separately. There is no lost-key recovery service.

The signing-key timer is independent of the tournament vault setting and fixed at 15 minutes. Sleeping tabs check the deadline when focus returns. As with vaults, clearing application references cannot guarantee physical erasure of JavaScript memory, and an unlocked or compromised browser can request signatures. A person who steals the private key and secret can produce signatures indistinguishable from the owner's.

Signing does not encrypt the payload. Encrypt private packages first, then sign the encrypted portable code; verification preserves that ciphertext without decrypting it. Embedded-key snapshot codes still carry their decryption secret inside the signed payload, so anyone with the complete packet can read them. Offline registration/result JSON packets may include private details and are not encrypted by the signing step.

Payloads are limited to 2 MiB before envelope encoding. Encoded files are bounded at 6 MiB, public-key imports at 4 KiB decoded, and encrypted-key imports at 8 KiB decoded. There are no nested signed envelopes, executable signing extensions or imported algorithm choices. A successful check offers extraction or the existing import preview. The receiving workflow still validates schemas, tournament identity, revisions, duplicates and conflicts, and requires organizer acceptance. Signatures alone do not prevent replay. The application adds no trusted signing timestamp and makes no claim that a signed prediction was created before play.

## Imported files and assets

Raster import checks inspect PNG, JPEG and WebP container bounds and dimensions
before rendering. Images are limited to 16 million pixels and 16,384 pixels per
axis; animated frames also have a combined full-canvas pixel budget. Direct
uploads run the same check before browser decoding. These checks bound resources;
the browser decoder still validates the compressed pixels. The current dependency
review and remaining build-tool advisory are recorded in [MAINTENANCE_AUDIT.md](MAINTENANCE_AUDIT.md).

Imports are untrusted data. The application checks:

- Versioned schemas, bounded strings and arrays, finite numbers, and JSON depth.
- Entity identities, valid references, and acyclic dependency graphs.
- Code checksums before decompression, then actual decompressed byte counts.
- ZIP directory and footer, supported entry names, entry count, entry size, and document checksum.
- Forbidden object keys that could support prototype pollution.
- Embedded image size, permitted MIME type, and PNG, JPEG, or WebP signature.

SVG uploads, arbitrary archive assets, external image URLs, scripts, and executable theme definitions are not accepted. Raster files still depend on browser image decoders, so keep the browser updated.

There are no uses of `eval` or imported JavaScript execution. React renders user text as text. Generated SVG exports escape user-controlled strings before putting them in markup.

The application caps a document at 512 entrants, 20,000 matches, and 16 MiB of JSON. Compressed imports are capped at 12 MiB. These limits reduce resource abuse; a file near the limit can still take time and memory to process.

## Browser policy

The static entry page carries a Content Security Policy where supported. A meta-delivered policy cannot replace every HTTP security header. GitHub Pages does not provide per-project control of all response headers.

The font policy permits same-origin files and embedded `data:` fonts so print
windows can use the bundled Persian and Latin fonts offline. It does not permit
remote font hosts. Popup documents inherit the opening page policy and apply
their own narrower export policy.

Core application scripts, fonts, icons, and styles are bundled. Uploaded content does not get a script execution path. Network access is not needed for tournament calculations after the application is cached.

## Remaining security limits

The vault has no independent cryptographic audit. This is an application-level protection for local documents, not protection against a compromised browser or device.

Tournament vault inactivity locking defaults to 15 minutes and can be disabled or set to 1, 5, 15, 30 or 60 minutes in Storage Health or vault settings. Trusted user input resets the current tab; incoming scores do not. Expiry clears decrypted previews, unconfirmed forms and session history. Confirmed encrypted writes remain, and a late save cannot reopen the locked view. Sleeping browsers check the deadline when they resume. This is a device-clock safeguard, not protection from someone already using the unlocked tab. Protected presentation windows need their own unlock state; a separate OBS browser process does not inherit another browser's data.

Use the explicit lock control when leaving a shared computer. Close other unlocked windows, keep software current, and retain tested backups with their correct secrets.

## Organizer records and table files

Waiting-list decisions, eligibility, payment status, availability and organizer notes live in participant metadata and are omitted from public projections. The private XLSX export intentionally includes these records and rosters. It does not process payments. Keep the file with other organizer backups.

Player-event records are private organizer evidence. The application removes the complete `metadata.playerStatistics` subsystem and participant rosters from public snapshots, public update projections, spectator displays and public visual exports. There is no public player-statistics opt-in. Full private archives, private codes and encrypted private backups retain these records.

The explicit player CSV export displays a privacy warning and includes active, quarantined and deleted events with captured names and identifiers, period/time, metric, value, unit, private notes, reasons, timestamps and revision counts. Formula-like text is escaped. It does not include every earlier before-value; the private archive retains event history. A result correction or changed roster identity quarantines affected evidence instead of silently assigning it to a different player. Quarantined evidence stays outside totals until an organizer reviews it. Each event retains up to 30 prior versions, with earlier tournament revisions recoverable within the normal history retention limit. Missing observations never become invented statistics.

XLSX imports are limited to 2 MiB compressed and 8 MiB expanded across at most 100 ZIP entries. The reader refuses formulas, external relationships, macros, embedded objects, XML entities, unsafe paths and duplicate cells. Imported workbooks never execute code or load external links.

A revision archive can contain private information deleted from the current tournament but retained in an older revision. Retained-history backups are private; public snapshot archives omit history. History comparisons default to public data; revealing private differences is an explicit local choice. Undo and restoration previews list changed areas and affected started matches without showing private values. The same archive encryption protects every included revision. Public visual exports use a fresh public projection and do not include the private revision table.

## Events, personal designs and QR transfers

Offline route networks contain organizer-entered location names, entrant-home
mappings and venue paths. They are private tournament metadata and inherit vault
and backup protection. Public projections omit them. Explicit route JSON and
itinerary CSV exports contain private journey details; share them deliberately.
No maps, geocoding or traffic service receives these inputs.

A protected event encrypts its directory, labels and configuration. Linking an already-protected tournament requires a protected event and an explicit unlock. Event lock clears the open collection and temporary tournament credentials. Decrypted data remains accessible to someone using the unlocked session. Public event projections remove private descriptions and adjustment reasons, and use the tournament public projection for every linked competition. Private event exports always require a separate secret; encrypted imports retain protection.

Saved personal themes and named sport presets are separate, unencrypted local libraries. They contain no tournament names or results. Images are excluded by default, because an uploaded logo or background can itself contain private information.

An embedded-key link protects the ciphertext against modification but carries its own secret. It is not recipient identity verification. Multipart checksums detect corruption and mixed frames, not trusted authorship. QR scanning does not grant permission to save data: preview and import remain explicit. Camera access starts only after a user action and stops on completion, close or unmount. PNG/JPEG QR inputs are limited to 3 MiB each, 4,096 pixels per dimension and 16 million pixels; image batches are limited to 128 images and 32 MiB.

Backup reminders run only while the app is open. They do not make unattended files or send notifications to other services. A recorded backup identifies the exported revision, so a slow older export cannot hide a reminder for later edits.
