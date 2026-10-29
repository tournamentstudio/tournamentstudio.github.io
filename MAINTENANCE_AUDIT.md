# October 29, 2026 maintenance review

I checked startup, a complete event workflow, Persian layout, export artwork and
the local-data security boundaries before publishing this release. This is a
targeted engineering review, not an independent security or accessibility
certification.

## Event and interface checks

The Gol Ya Pooch rehearsal creates eight teams, plays two groups of four, advances
the qualifiers and completes semifinals and a final. Its fifteen matches cover
hand undo, a saved timer pause, live scores in a second tab, offline scoring,
private-data exclusion and archive recovery in a fresh browser profile.

A separate 320-pixel touch/keyboard case uses long Persian and Latin team names
in the hand log, switches language, checks focus restoration and runs axe AA
rules against the referee dialog. Existing import, vault, language and export
checks remain part of the selected browser run. The release report records
the actual results.

Physical Android/iPhone keyboard behavior and spoken Persian output from
VoiceOver, TalkBack or NVDA still need those devices and a human reviewer.
Viewport emulation, an accessibility tree and axe do not establish speech
quality. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the review boundary.

A failed download of the import screen previously reached the app's global
error handler after an incoming share code had been cleared from the address
bar. A scoped recovery dialog now keeps that code in memory, offers manual copy
or download, and leaves the studio usable. Closing discards the temporary code;
no recovery payload is written to browser storage or restored to the URL.

## Imported artwork

Imported raster data previously passed a file-signature check without checking
decoded dimensions. PNG, JPEG and WebP now receive bounded container and
dimension checks before rendering; local uploads use the same check before
`Image.decode()`.

The limit is 16 million pixels and 16,384 pixels per axis. Animated PNG and WebP
also have a combined full-canvas pixel budget. Imported data URLs retain the
existing two-megabyte string limit. Uploads are resized by the existing picker.
Tests cover truncated headers, invalid base64, oversized frames, mismatched WebP
dimensions and chunk lengths that exceed the file. The browser decoder remains
responsible for validating compressed pixels; header checks do not certify that
an image is otherwise valid.

The review found no new vault or public-projection leak in the inspected paths.
Public artwork receives only the existing public projection. Full private
backups intentionally retain private information and should be encrypted when
confidentiality is needed.

## Dependencies

`serialize-javascript` was updated from 7.1.2 to 7.1.4 to address
[GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v).
The final production-only npm audit reports zero advisories. The full audit
reports four low-severity entries in the PWA build dependency chain, all traced
to [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
The advisory lists no patched release at the time of this review.

That dependency runs during the local build with repository-controlled
configuration; it is not bundled as a tournament-data runtime service. I kept
the working build versions instead of accepting an automatic downgrade. Repeat
`npm audit` before the next release and update when a compatible fix exists.
No production token, remote database or new runtime service was introduced.

## Artwork and performance

All fourteen activities have their own exported scoreboard emblem and champion
scene. Gol Ya Pooch uses the original closed hands, bead, bell, cards and arch.
Participant logos remain available; names retain measured wrapping and exports
embed the local Persian and Latin fonts. [DESIGN_REFERENCES.md](DESIGN_REFERENCES.md)
records the original artwork's references.

The new browser checks exposed mixed-script poster overflow in Firefox and
WebKit. Several wrapped SVG lines shared one RTL text element, allowing bidi
processing to move positioned chunks across lines. Each line now has its own
position and isolated direction. The same bundled-font fixture reproduced the
old overflow and confirmed the corrected bounds in all three engines.

[PERFORMANCE.md](PERFORMANCE.md) records startup byte counts, CPU-throttled
measurements and the 512-participant display check. The tests and measurement
script run locally. GitHub Actions remains disabled.

## Follow-up recovery and competition review

The next review reproduced two qualification defects. Wildcard comparisons used
the wrong direction for lower-is-better weighted scores and differences, across
total, per-match and retained-results policies. New alternating challenge rounds
could still pair withdrawn or disqualified entrants. Both now use the intended
rules without changing completed results or removing historical participants.

Closing a timezone import during its asynchronous preparation could still start
a write. The importer now invalidates that preparation on close or unmount.
Parent callbacks also check the import session before starting and after waiting.
A write that already started can finish, but cannot reopen its old workspace or
close a new preview. Tests cover explicit close, automatic vault lock and delayed
encrypted persistence in isolated browser profiles.

A failed save previously lost its in-memory recovery copy when leaving the
workspace. Pending saves now block route changes and competing imports; failed
saves offer staying to export or explicitly discarding before leaving. Reloading
the saved document also resets editor drafts. App updates wait for recovery, and
browser close/reload warnings are best effort. Vault locking still clears private
draft references. A delayed image upload that completes during another save keeps
its rejected candidate available for export after the first save finishes.

Exported sponsor cards and compact overlay headers used fixed heights even when
accepted names or titles wrapped across extra lines. Their heights now follow
the measured text, with aligned sponsor rows and space for logos. Unit checks
cover all sponsor layouts; browser checks load the actual SVG files and bundled
fonts, then measure every name against its card and neighboring content.
Test screenshots use an HTML wrapper because standalone SVG screenshot capture
stalled in Chromium and Firefox after those geometry assertions had passed.

[RELEASE_STATUS.md](RELEASE_STATUS.md) records the completed checks for this
follow-up. The earlier performance measurements remain tied to their original
commit. No CI workflow or external runtime service was added.
