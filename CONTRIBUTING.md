# Contributing to TournaStudio

I welcome fixes, rule examples, translations, and improvements that make tournaments easier to run. Start with the [feature status](FEATURES.md) so an existing capability or known gap does not get lost in a new proposal.

For a bug, include the steps, browser, and expected result. For a competition rule, include a small field of fictional entrants and the pairings or standings you expect. A reproducible example is more useful than a platform comparison. Use the repository's [issue forms](https://github.com/tournamentstudio/tournamentstudio.github.io/issues/new/choose).

Do not put private tournament files, participant contact details, referee secrets, or vault passwords in an issue or pull request. Report vulnerabilities through [private security reporting](SECURITY.md).

## Work locally

Use Node.js 22.12 or later and npm. A fork or local checkout needs no service account or environment secrets.

```sh
npm ci
npm run dev
```

The development server uses `127.0.0.1`. Production preview and browser tests use port 4173. Their browser storage is separate from the live site, so import a copy if you need test data.

Before submitting a code change:

```sh
npm run check
npm run test:release
npx playwright install chromium firefox webkit
npm run test:e2e
```

`check` runs TypeScript, lint, unit tests, and the production build. Build before running browser tests; Playwright starts its own preview server. During development, use `npm run test:watch` or a focused test file. Record the commands you actually ran and any failures in the pull request. This project has no GitHub CI workflow.

## Keep the boundaries clear

- Competition rules belong in the domain and engine modules, independent of React and themes. Include deterministic examples and relevant invariants when changing pairings or advancement.
- Preserve saved documents and results. Schema or sharing changes need compatibility, invalid-input, and roundtrip checks. Public data must exclude private fields by construction.
- Keep core operation static and offline. Bundle dependencies and assets; do not add required remote APIs, analytics, accounts, or runtime CDNs.
- Interface changes need keyboard controls, readable small-screen layouts, and English/Persian coverage. Check RTL and long mixed-script names.
- Use fictional data in fixtures and screenshots. Add dependencies only when they solve a real problem and have a compatible license.

[ARCHITECTURE.md](ARCHITECTURE.md) describes module contracts. [DATA_FORMAT.md](DATA_FORMAT.md) covers portable formats. [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md) explains the security boundaries.

## Send a focused change

Explain the problem, what the user can do afterward, and how you checked it. Update the relevant guide and `FEATURES.md` when behavior or support changes. Screenshots help for interface work; include a Persian or mobile view when it is affected.

Keep source edits reviewable and avoid unrelated formatting changes. Generated `docs` assets are prepared as part of a release using `npm run pages:prepare`; do not hand-edit them. The [README deployment instructions](README.md#deploy-to-github-pages) describe publication from `main/docs` with CI disabled.

Contributions are distributed under this repository's [MIT license](LICENSE).
