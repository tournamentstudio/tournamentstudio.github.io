# Reporting a security issue

Use [GitHub's private vulnerability report](https://github.com/tournamentstudio/tournamentstudio.github.io/security/advisories/new) for a suspected security defect. Do not open a public issue containing exploit details or private tournament data.

A useful report includes:

- The affected commit or deployed version, browser, and operating system.
- A short reproduction using fictional participants and a minimal test file, if needed.
- The observed impact and the behavior you expected.

Never send a real vault password, recovery secret, personal roster, or full browser profile. Use a disposable test secret if the issue depends on encryption. Keep testing to data and browsers you control.

## Scope and fixes

Relevant areas include imported files and links, public-data projections, local encryption, result integrity, and dependencies shipped to browsers. Routine scoring bugs, interface defects, and feature requests belong in the [issue tracker](https://github.com/tournamentstudio/tournamentstudio.github.io/issues/new/choose) unless they expose a security boundary.

The current code on `main` and its published Pages build are the maintained versions. There are no separate support branches or promised response times. A report may need follow-up before its impact or fix can be established.

TournaStudio has no account service or password-reset mechanism. Browser storage can be cleared or evicted, and an unlocked session exposes its data to the person using it. Those boundaries are described in [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md); reporting an issue does not grant access to someone else's local files or recovery secrets.
