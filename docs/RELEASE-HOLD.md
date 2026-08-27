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

A tag can now be cut from the Actions tab — **Cut release tag**, see
[docs/BETA-RELEASE.md](./BETA-RELEASE.md) — so "whoever merged the release PR
cannot push a tag" has stopped being a reason a release stalls. It refuses a
commit that is not on `main`, a `package.json` that disagrees with the version
asked for, notes still sitting in `[Unreleased]`, and a tag that already exists.
A hold is still a decision recorded here, not something that workflow enforces.

| Channel | Last published | Notes |
|---------|----------------|-------|
| **Stable** | **v3.6.0** (2026-08-21) | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) — **the 3.6.0 line, promoted from `v3.6.0-rc.4` unchanged.** Khayt learns what prints actually cost: a model becomes a quote, the printer reports the real filament and duration on completion, the settings that worked are remembered against the file, and the estimator calibrates itself from finished jobs. It changes **what customers are quoted** and how every geometry-based time estimate is computed, which is why the line soaked for three weeks in beta and seven days as a candidate. It also opens the app outside the Gulf (sales tax added to a price rather than included in it, thirty country presets, documents printed in the shop's chosen language rather than that language and Arabic), closes four security holes — a portal link that exposed a whole message thread, a printer address written as a number that could point at your own network, an arbitrary file write in the converter, and a brute-force lockout that never locked — and stops a restore performed *while the app is running* from pushing rolled-back data over newer data on other devices. The 3.5.1 note still applies: the cross-branch view needs the org branch-read routes in khayt-cloud (b3556a5), which ARE deployed — confirm with `curl -s -o /dev/null -w '%{http_code}' https://cloud.khaytapp.com/v1/shops/probe/org/keysets` (401 = present, 404 = not) |
| **Beta / RC** | **v3.7.0-beta.9** (2026-08-27) | **The 3.7.0 line is open and has run nine cuts.** `beta.1` flipped `DELTA_WRITES`. `beta.2` is the substance of the line — the print library can outgrow its disk, plus the fifteen-provider endpoint dropdown and Google Drive. `beta.3` was `beta.2`'s tree rebuilt with `BUILD_MAC` set. `beta.4` carries the storage-provider signup links and is the row that taught this table its own lesson: it sat bumped on `main` with no tag for most of a day. `beta.5` (2026-08-24) was the printer-and-model release and the first on this line built for all three platforms. `beta.6` (2026-08-25) was the first vendor-audit release ([#747](https://github.com/KhaytApp/Khayt/pull/747)). `beta.7` (2026-08-25) was Medusa, both kinds of Duet and what a design costs. `beta.8` (2026-08-27) shipped the modular design system, Analytics → Cost per model and the second protocol audit, **for all three platforms**, ending the drift that had left macOS three cuts behind. **`beta.9` (2026-08-27) is the current cut and is Windows + Linux only** — `BUILD_MAC` deliberately unset, so macOS stays on `beta.8`, one cut behind, which is the ordinary state; `carry-mac-manifest` carries that release's `latest-mac.yml` forward. macOS bills at 10× and beta.8 brought it current hours earlier, so paying for it twice in a day buys a single cut of currency. It is the day the audit method left printers: **every order imported from Salla had been recorded priced at zero** since that integration shipped, because `data.total` is not a field Salla sends ([#771](https://github.com/KhaytApp/Khayt/pull/771), `docs/STOREFRONT-WEBHOOK-AUDIT.md`). It also carries job control for a Duet 3 with an SBC and for a password-protected Duet ([#767](https://github.com/KhaytApp/Khayt/pull/767)), Repetier cancel/resume ([#768](https://github.com/KhaytApp/Khayt/pull/768)) and camera auto-detect on modern OctoPrint ([#769](https://github.com/KhaytApp/Khayt/pull/769)). **Until the release run finishes that is what is being cut, not what is serving — confirm with `gh release list` and a fetched manifest before trusting this row.** The 3.6.0 candidate line is closed: `v3.6.0-rc.4` became stable v3.6.0 with no code change between the two. Decide replace-vs-promote *on the day* with `git rev-list --count <tag>..origin/main` and an empty `[Unreleased]`, not from this table. **A version in `package.json` is evidence the cut landed, never that it shipped — confirm with `gh release list` or `git ls-remote --tags`; the `beta.4` day above is what that trap looks like in practice.** |

Last verified 2026-08-27 (after the beta.8 publish; the beta.9 row above is written from its release PR and is NOT yet verified) against `gh release list`, `git ls-remote --tags upstream`, and a fetch of every published manifest and every asset it names: all three manifests fetch 200 and read `version: 3.7.0-beta.8`, and the five binaries they name — the Windows setup, the mac zip and dmg, the AppImage and the deb — each serve 200. These rot fast — confirm with
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
