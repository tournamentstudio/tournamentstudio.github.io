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

Revision snapshots are encrypted too. Protecting a previously standard tournament encrypts its saved revisions and replaces the visible title and sport fields in one transaction.

The unlocking secret is held in application memory while the document is open. It is not saved in local storage, IndexedDB, a URL, or beside the ciphertext. Locking must close the document and clear the application references to its plaintext and secret.

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
- Referee names, private match notes, and hand-by-hand referee logs.
- Team rosters, check-in state, tags, and custom participant metadata.
- Tournament private metadata, correction recovery data, description, and audit history.
- Unrecognized stage configuration extensions and arbitrary match or stage metadata.

Typed structural fields needed for brackets and standings are retained. These include qualification rules, pot membership and names, group and knockout restrictions, protected seed counts, graph coordinates and bounded numeric participant points adjustments. Names, region, organization, logos, scores, fixtures, public scheduling, and presentation scenes remain visible.

Presentation text is intentionally public. A secret typed into a team name, tournament title, sponsor name, or announcement is public content. The application cannot infer that an organizer has placed a secret in a public field.

Complete private backups intentionally contain referee details and other private content. Private snapshots are available only through an explicit scope selection. Encrypt these packages when they need confidentiality.

## Sharing

Snapshot links contain compressed tournament data in the URL fragment. The fragment is not part of the HTTP request for the application page, but it can be visible in browser history, copied messages, extensions, screenshots, and a recipient's address bar.

The application retains incoming code temporarily for the import screen and removes it from the visible route. Do not treat this as a guarantee that all prior copies of a URL have been erased.

An encrypted snapshot or archive requires the separately shared secret. Sending the secret with the ciphertext gives anyone who receives both access to the contents.

Read-only preview is an interface choice. A recipient who has the document can save or modify their own copy. Previously shared data cannot be remotely revoked.

Snapshots do not sync across devices. Later changes require a new snapshot or an update packet. Same-browser presentation updates use a local notification channel and IndexedDB; they are not an internet collaboration service.

## Checksums, updates, and identity

SHA-256 checksums detect incomplete or changed data. They do not authenticate the sender. The same limitation applies to registration responses and scorekeeper result proposals.

Update packets must match the local tournament ID, base revision, and base hash. They are validated before a transaction and rejected on divergence or duplicate application. The previous revision remains available in local history, subject to the 50-snapshot retention limit.

Public updates omit private fields by using the public projection. Private update packets are plaintext. Use an encrypted complete archive instead if the update needs confidentiality.

The application does not implement digital signatures, trusted referee identities, selective patch merging, or remote revocation.

## Imported files and assets

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

Core application scripts, fonts, icons, and styles are bundled. Uploaded content does not get a script execution path. Network access is not needed for tournament calculations after the application is cached.

## Remaining security limits

The vault has no independent cryptographic audit. This is an application-level protection for local documents, not protection against a compromised browser or device.

Auto-lock on inactivity, trusted digital signatures, encrypted incremental packets, and embedded-key encrypted links are not implemented. Protected presentation windows need their own unlock state; a separate OBS browser process does not inherit another browser's data.

Use the explicit lock control when leaving a shared computer. Close other unlocked windows, keep software current, and retain tested backups with their correct secrets.
