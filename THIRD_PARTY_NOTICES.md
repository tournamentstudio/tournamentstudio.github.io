# Third-party notices

TournaStudio bundles these production dependencies. Their upstream licenses remain in effect. Dependency versions are pinned by package-lock.json.

| Package                        | Installed version | License    |
| ------------------------------ | ----------------- | ---------- |
| @fontsource-variable/inter     | 5.3.0             | OFL-1.1    |
| @fontsource-variable/vazirmatn | 5.3.0             | OFL-1.1    |
| dexie                          | 4.4.6             | Apache-2.0 |
| fflate                         | 0.8.3             | MIT        |
| lucide-react                   | 1.60.0            | ISC        |
| qrcode                         | 1.5.4             | MIT        |
| react                          | 19.3.1            | MIT        |
| react-dom                      | 19.3.1            | MIT        |
| zod                            | 4.6.7             | MIT        |

Inter and Vazirmatn font files are bundled locally. Both use the SIL Open Font License 1.1. Font copyright and license notices are preserved in the font packages and copied into public/licenses.

Icons from lucide-react use the ISC license. Original TournaStudio branding artwork is covered by the project MIT license.

Development dependencies are used during builds and tests, not as remote runtime services. Their package license files remain available in node_modules after npm ci.
