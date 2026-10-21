# Pairing regression data

These synthetic TRF files come from
[BBP Pairings 6.0.0](https://github.com/BieremaBoyzProgramming/bbpPairings/tree/v6.0.0/test/tests),
Copyright 2016-2026 Jeremy Bierema, under Apache 2.0. Full license text is in
`public/licenses/BBP-APACHE-2.0.txt`.

`dutch_exchange_rule4` comes from BBP pull request 39 at commit
`8e1a073d31f3e9faefeb9a85b8b348cbd5c6a8b1`. It exercises the local exchange-order
correction. Its reference output differs from unpatched BBP 6.0.0 intentionally.

The original `issue_15.output.expected` is a checker transcript, not a pairing
list. The test instead validates the field, opponents and colors against a
separately generated reference from the native 6.0.0 executable.
