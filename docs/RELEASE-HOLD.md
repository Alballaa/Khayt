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
| **Stable** | **v3.6.0** (2026-08-21) | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) — **the 3.6.0 line, promoted from `v3.6.0-rc.4` unchanged.** Khayt learns what prints actually cost: a model becomes a quote, the printer reports the real filament and duration on completion, the settings that worked are remembered against the file, and the estimator calibrates itself from finished jobs. It changes **what customers are quoted** and how every geometry-based time estimate is computed, which is why the line soaked for three weeks in beta and seven days as a candidate. It also opens the app outside the Gulf (sales tax added to a price rather than included in it, thirty country presets, documents printed in the shop's chosen language rather than that language and Arabic), closes four security holes — a portal link that exposed a whole message thread, a printer address written as a number that could point at your own network, an arbitrary file write in the converter, and a brute-force lockout that never locked — and stops a restore performed *while the app is running* from pushing rolled-back data over newer data on other devices. The 3.5.1 note still applies: the cross-branch view needs the org branch-read routes in khayt-cloud (b3556a5), which ARE deployed — confirm with `curl -s -o /dev/null -w '%{http_code}' https://cloud.khaytapp.com/v1/shops/probe/org/keysets` (401 = present, 404 = not) |
| **Beta / RC** | **v3.7.0-beta.1** (2026-08-21) | **The 3.7.0 line opens.** One change: cloud sync starts *writing* only what changed, not just reading it — `DELTA_WRITES` flipped to `true` now that the server gate is confirmed to refuse an un-eligible shop with **404**, the status the client already falls back on, so such a shop keeps sending whole stores with no error and nothing for its owner to do. That is the first real exercise of the delta write path against production; it has only ever run against a reference server. Cut from `main` at `9200d4f`. **A version in `package.json` is evidence the cut landed, never that it shipped — confirm with `gh release list`.** The 3.6.0 candidate line is closed: `v3.6.0-rc.4` became stable v3.6.0 with no code change between the two. rc.1, rc.2 and rc.3 were each *replaced* rather than promoted, because a candidate is meant to *be* what stable will be and `main` had overtaken each one while it sat. The lesson to carry into this line: decide replace-vs-promote *on the day* with `git rev-list --count <tag>..upstream/main` and an empty `[Unreleased]`, not from this table |

Last verified 2026-08-21 against published tags. These rot fast — confirm with
`gh release list --repo KhaytApp/Khayt` rather than trusting the table.

## While a hold is active

Beta tags (`v*-beta.*`) remain allowed. They publish as GitHub **pre-releases**
and do not move the stable latest pointer. `main` may still receive merges;
**stable** installers and auto-update feeds stay on the last published stable
tag until a deliberate stable release.

## Shipping a stable release

1. `npm run check`
2. Move `[Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z]`
3. `node scripts/bump-version.js set X.Y.Z` — name the version explicitly.

   **Do not use `npm run version:minor` to promote a prerelease.** It increments
   the minor unconditionally, so promoting `3.6.0-rc.3` yields **3.7.0** — it
   skips the very version being promoted, and the number it lands on has no
   candidate behind it. `version:minor` is for opening a new line from a stable
   version, not for closing one. Same trap in the other direction: `version:beta`
   from an `rc` rolls the minor too. See [VERSIONING.md](../VERSIONING.md).
4. Commit, and tag `vX.Y.Z` on `main` — no prerelease suffix. Set `BUILD_MAC`
   for a stable tag and unset it afterwards: anything intended for stable should
   carry a mac build, and the variable is sticky at 10x the minutes.
5. Push the tag only then; that is what triggers the release build. Push it to
   the remote pointing at **KhaytApp/Khayt** (`git remote -v` — `origin` in a
   direct clone, usually `upstream` from a fork). A tag pushed to a fork builds
   nothing and fails silently, because there is no workflow there to fail.
