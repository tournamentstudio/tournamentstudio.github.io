# Browser performance

I measure startup separately from background offline caching. A small first
screen is useful even though the service worker eventually downloads the rest
of the application for offline use.

## October 29, 2026 measurements

The previous release loaded the Dutch Swiss solver and several editing screens
with the home page. The solver now loads inside the competition worker before
Dutch pairing. Creation, imports, the format advisor and storage settings load
when opened. Normal tournament operations keep their existing synchronous
engine behavior.

Three fresh Chromium profiles were measured at 390 by 844 CSS pixels with a
4x CPU slowdown. The service worker was blocked for this measurement only, to
exclude background precaching. The Vite preview served compressed responses on
localhost with no artificial network delay.

| Measurement | Before | After |
| --- | --- | --- |
| Initial JavaScript response bytes | 500,061 | 272,504 |
| Median home heading rendered | 452 ms | 308 ms |
| Main minified application chunk | 1.47 MB | 0.61 MB |
| Offline precache payload | 5.13 MiB | 3.85 MiB |

Startup JavaScript transfer fell by about 46%. The timings describe this machine
and test setup; they are not phone measurements or a loading-time guarantee.
The offline cache still includes the solver and all lazy screens. Opening them
offline works after the app reports that caching is ready.

## Large tournament check

A separate Chromium run used the Pixel 7 viewport preset (412 by 839 CSS pixels)
with touch enabled and 4x CPU slowdown. It created 512 entrants and 511 matches,
edited the last participant, searched paged lists, reloaded the saved document,
opened the bracket and displayed it in a spectator tab.

| Operation | Observed time | Page elements |
| --- | --- | --- |
| Create and save | 6,549 ms | 7,099 |
| Open participants | 852 ms | 1,460 |
| Open matches | 285 ms | 1,179 |
| Open schedule | 673 ms | 1,649 |
| Open bracket | 4,792 ms | 6,991 |
| Open spectator bracket | 5,698 ms | 6,743 |

The full bracket is more expensive than paged lists. The test enforces fewer
than 8,000 page elements, creation within 30 seconds and section display within
15 seconds. These bounds detect large regressions; they do not promise instant
display on every device. A viewport preset does not emulate a real phone's CPU,
memory limits, thermal behavior or browser implementation.

## Repeat locally

Build and start a preview in one terminal:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

In another terminal, measure three fresh profiles and run the large-field check:

```sh
npm run measure:startup -- --output=.local/startup.json
npx playwright test tests/e2e/performance.spec.ts --project=chromium
npx playwright test --config playwright.performance.config.ts
```

`measure:startup` uses Playwright's installed Chromium and closes its browser
when finished. Stop the preview with Ctrl+C. Avoid running other browser tests
during timing comparisons. `tests/e2e/startup-loading.spec.ts` checks that home
does not request specialist engines or editing-screen modules and that canceling
a pending lazy import cannot reopen its dialog.

`playwright.performance.config.ts` selects the `slow-mobile` project used for the
recorded run. The performance test applies the CPU slowdown and records the
viewport and timings in its JSON attachment. All measurements run locally;
there is no hosted CI job.
