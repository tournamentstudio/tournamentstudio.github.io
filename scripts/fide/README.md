# Dutch pairing engine build

I use BBP Pairings 6.0.0 for the `fide-dutch-2026` policy. The bundled archive
contains the source at commit `16a000f9811de322b0e835d5643198226165b5a9`, including
its Apache 2.0 license. The browser receives compiled JavaScript and does not
download a compiler or contact a pairing service.

The local build is identified as `bbp-6.0.0-ts1` because it includes two changes:

- The exchange-order correction from [BBP pull request 39](https://github.com/BieremaBoyzProgramming/bbpPairings/pull/39), pinned to
  `8e1a073d31f3e9faefeb9a85b8b348cbd5c6a8b1`. It removes edges that would let an
  already exchanged player float below the next score group. Its supplied
  regression fixture is tested against exact colors and opponents.
- An explicit `std::size_t` template argument for one `std::min` call, needed
  for the Emscripten 32-bit C++ ABI. This does not change pairing criteria.

`bridge.cpp` accepts an in-memory TRF string and exposes only Dutch pairings.
It catches parser and pairing failures. No filesystem or other pairing system
is exposed. Names are synthetic entrant numbers, not user names. The adapter
checks full active-field coverage after every call.

To rebuild, install and activate Emscripten 4.0.18 through the official
[emsdk repository](https://github.com/emscripten-core/emsdk/tree/4.0.18), then run:

```powershell
node scripts/fide/build-engine.mjs path/to/emscripten/em++.py
npx vitest run src/engine/fide-dutch.test.ts
```

For an independent comparison, download the native BBP Pairings 6.0.0 release
from its upstream repository and run:

```powershell
node scripts/fide/verify-native.mjs path/to/bbpPairings.exe
```

This runs 30 deterministic tournaments and compares all 150 rounds, including
exact color assignment, to the native executable. It covers both initial
colors, odd fields, draws, forfeits, withdrawals, and zero-credit late entry.
The separately pinned exchange-order fixture validates the intentional local
correction that differs from the original executable.

Python, Git, and tar must be available. `FIDE_BUILD_PYTHON` can choose a Python
executable. The script verifies the source archive hash, extracts into
`.local/fide-build`, applies the pinned patch, and writes the checked-in module.
The ordinary application build uses that module and needs no C++ toolchain.

Build limits are 512 entrants, 100 rounds, and 100 total points. The output
uses a 32 MiB initial heap with a 256 MiB ceiling and a 2 MiB stack for bounded
TRF input. `WASM=0` produces plain
JavaScript, with dynamic execution disabled. The synchronous factory marker
is normalized after compilation; the only async helper left in the generated
runtime is unused. No `eval`, `Function` constructor, or WebAssembly permission
is required. Generated runtime code is excluded from application linting.

The public license folder includes BBP, Emscripten, LLVM/libc++, and musl
notices. Fixture inputs are synthetic upstream regression data. This build
has no FIDE endorsement or certification.
