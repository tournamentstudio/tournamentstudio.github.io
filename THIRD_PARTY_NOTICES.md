# Third-party notices

TournaStudio bundles these production dependencies. Their upstream licenses remain in effect. Dependency versions are pinned by package-lock.json.

| Package                        | Installed version | License                 |
| ------------------------------ | ----------------- | ----------------------- |
| @fontsource-variable/inter     | 5.3.0             | OFL-1.1                 |
| @fontsource-variable/vazirmatn | 5.3.0             | OFL-1.1                 |
| @zxing/browser                 | 0.2.1             | MIT                     |
| @zxing/library                 | 0.23.0            | Apache-2.0              |
| @zxing/text-encoding           | 0.9.0             | Unlicense OR Apache-2.0 |
| dexie                          | 4.4.6             | Apache-2.0              |
| fflate                         | 0.8.3             | MIT                     |
| lucide-react                   | 1.60.0            | ISC                     |
| qrcode                         | 1.5.4             | MIT                     |
| react                          | 19.3.1            | MIT                     |
| react-dom                      | 19.3.1            | MIT                     |
| zod                            | 4.6.7             | MIT                     |

Inter and Vazirmatn font files are bundled locally. Both use the SIL Open Font License 1.1. Font copyright and license notices are preserved in the font packages and copied into public/licenses.

Icons from lucide-react use the ISC license. Original TournaStudio branding artwork is covered by the project MIT license.

The QR scanner bundles ZXing for JS. Its license files are included in public/licenses; the decoder loads locally when scanning starts. No runtime CDN is required.

Development dependencies are used during builds and tests, not as remote runtime services. Their package license files remain available in node_modules after npm ci.

## Dutch pairing engine

The browser bundle includes BBP Pairings 6.0.0, copyright Jeremy Bierema,
under Apache-2.0. The local `bbp-6.0.0-ts1` build applies the exchange-order
correction from upstream pull request 39 and a C++ size-type portability change.
It exposes Dutch pairing only. The source archive, patch, bridge and reproducible
build instructions are in [scripts/fide](scripts/fide/README.md).

Emscripten 4.0.18 compiles the source to JavaScript. Generated runtime and C/C++
library notices are retained in `public/licenses/`: `BBP-LICENSE.txt`,
`BBP-APACHE-2.0.txt`, `Emscripten-LICENSE.txt`, `LLVM-LICENSE.txt` and
`musl-COPYRIGHT.txt`. These third-party legal notices remain verbatim.
