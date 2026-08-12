# Release hold (maintainer)

## Status: no hold active

The hold that stood over the 3.1 line **ended when v3.2.0 shipped stable on
2026-07-22**, closing the `3.2.0-beta.x` line at beta.61. `CHANGELOG.md` records
that release as "the 3.2.0 beta line, released as stable" — the deliberate
stable release the hold was waiting for, not a breach of it. Several stable
lines have shipped since; the current `releases/latest` pointer is in the table
below, not v3.2.0.

Nothing currently blocks a stable tag. To impose a new hold, replace this
section with the channel it covers, the reason, and the condition for lifting.

| Channel | Last published | Notes |
|---------|----------------|-------|
| **Stable** | **v3.5.3** (2026-08-01) | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) — two customer-facing currency labels that could name SAR for a shop pricing in something else. The 3.5.1 note still applies: the cross-branch view needs the org branch-read routes in khayt-cloud (b3556a5), which ARE deployed — confirm with `curl -s -o /dev/null -w '%{http_code}' https://cloud.khaytapp.com/v1/shops/probe/org/keysets` (401 = present, 404 = not) |
| **Beta / RC** | **v3.6.0-rc.1** (2026-08-12) | **The candidate for v3.6.0 stable** — same code as `beta.19`, renamed so the promotion can be tested deliberately rather than assumed. It stays on the pre-release channel and reaches nobody on stable. Promote only on evidence of real shop use: the line changes what customers are quoted, and a green suite cannot vouch for that. The `3.6.0-beta.x` line, open and soaking. Khayt learns what prints actually cost: a model becomes a quote, the printer reports the real filament and duration on completion, the settings that worked are remembered against the file, and the estimator calibrates itself from finished jobs. Beta rather than stable because it changes **what customers are quoted** and how every geometry-based time estimate is computed. Also fixes two things that never worked — 3MF files never gave up their slicer figures, and Bambu/Orca print times were silently dropped. Since beta.1 the line has also fixed a converter that could drop whole objects from a large 3MF while reporting success, moved conversion off the main process, and — in beta.16 — extended reordering and purchase orders to consumables, which until now only filament could reach. **beta.17 is the one that opens the app outside the Gulf**: sales tax that is added to a price rather than included in it (so a US shop quoting 100 invoices 108.25, where it used to invoice 100), thirty country tax presets, and quotes, invoices, credit notes and delivery notes that print in the language the shop chose instead of that language and Arabic. It also keeps a copy of a shop's data before any update touches it. **beta.18 switches cloud sync to compressed uploads** (~6x less on the wire); a shop running a second machine still on beta.16 or earlier must update it, or that machine stops syncing until it does. **beta.19 fixes a beta.18 regression**: the new "low stock" colour ignored the theme and went pale on the light appearance, failing contrast on all seven themes; it follows the theme again. Opened at `3.6.0-beta.1`, never `3.5.x-beta.1`, which would sort BELOW the shipped v3.5.3; see [BETA-RELEASE.md](./BETA-RELEASE.md). Earlier: v3.4.0-beta.5, promoted to stable as v3.4.0 |

Last verified 2026-08-12 against published tags. These rot fast — confirm with
`gh release list --repo KhaytApp/Khayt` rather than trusting the table.

## While a hold is active

Beta tags (`v*-beta.*`) remain allowed. They publish as GitHub **pre-releases**
and do not move the stable latest pointer. `main` may still receive merges;
**stable** installers and auto-update feeds stay on the last published stable
tag until a deliberate stable release.

## Shipping a stable release

1. `npm run check`
2. Move `[Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z]`
3. `npm run version:minor` (or `version:patch`)
4. Commit, and tag `vX.Y.Z` on `main` — no prerelease suffix
5. Push the tag only then; that is what triggers the release build. Push it to
   the remote pointing at **KhaytApp/Khayt** (`git remote -v` — `origin` in a
   direct clone, usually `upstream` from a fork). A tag pushed to a fork builds
   nothing and fails silently, because there is no workflow there to fail.
