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
| **Beta / RC** | **v3.7.0-beta.13** (2026-08-29, being cut — **this is the promotion candidate**, replacing `beta.12`; it is named `-beta.N` because an `-rc` is invisible to existing beta installs, see VERSIONING.md) — newest published: `v3.7.0-beta.12`, **which must not be promoted**: Khayt Cloud sign-in, sign-up and join-a-team all die mid-handler on a ReferenceError, so the panel sits on "Connecting…" and nothing is saved. beta.12's own headline fix was downstream of that throw and never ran. | **The 3.7.0 line is open and has run ten cuts.** `beta.1` flipped `DELTA_WRITES`. `beta.2` is the substance of the line — the print library can outgrow its disk, plus the fifteen-provider endpoint dropdown and Google Drive. `beta.3` was `beta.2`'s tree rebuilt with `BUILD_MAC` set. `beta.4` carries the storage-provider signup links and is the row that taught this table its own lesson: it sat bumped on `main` with no tag for most of a day. `beta.5` (2026-08-24) was the printer-and-model release and the first on this line built for all three platforms. `beta.6` (2026-08-25) was the first vendor-audit release ([#747](https://github.com/KhaytApp/Khayt/pull/747)). `beta.7` (2026-08-25) was Medusa, both kinds of Duet and what a design costs. `beta.8` (2026-08-27) shipped the modular design system, Analytics → Cost per model and the second protocol audit, **for all three platforms**, ending the drift that had left macOS three cuts behind. **`beta.9` (2026-08-27) shipped Windows + Linux only**, tagged from `b587777` ([#772](https://github.com/KhaytApp/Khayt/pull/772)) — `BUILD_MAC` deliberately unset, so macOS stays on `beta.8`, one cut behind, which is the ordinary state; `carry-mac-manifest` carries that release's `latest-mac.yml` forward. macOS bills at 10× and beta.8 brought it current hours earlier, so paying for it twice in a day buys a single cut of currency. It is the day the audit method left printers: **every order imported from Salla had been recorded priced at zero** since that integration shipped, because `data.total` is not a field Salla sends ([#771](https://github.com/KhaytApp/Khayt/pull/771), `docs/STOREFRONT-WEBHOOK-AUDIT.md`). It also carries job control for a Duet 3 with an SBC and for a password-protected Duet ([#767](https://github.com/KhaytApp/Khayt/pull/767)), Repetier cancel/resume ([#768](https://github.com/KhaytApp/Khayt/pull/768)) and camera auto-detect on modern OctoPrint ([#769](https://github.com/KhaytApp/Khayt/pull/769)). Verified after the publish: `latest.yml` and `latest-linux.yml` read `3.7.0-beta.9` and their three binaries serve 200, and `carry-mac-manifest` wrote `latest-mac.yml` as `version: 3.7.0-beta.8` with `../v3.7.0-beta.8/…` relative URLs — **the relative form, not a verbatim copy**, and both mac assets resolve 200 from the beta.9 feed. That last check is the one that matters: a verbatim copy would name a file this release does not contain and 404 for exactly the users who are furthest behind. **`v3.7.0-beta.10` (2026-08-27) is the current cut** and is the audit method's last three surfaces, all three findings the same shape — a guard that quietly stops guarding: a carrier update Khayt could not read was answered "received, handled", so a shipment stopped advancing with no reason anywhere ([#777](https://github.com/KhaytApp/Khayt/pull/777)); an `esc()` helper fell back to the **raw** string if its global went missing ([#776](https://github.com/KhaytApp/Khayt/pull/776)); and two Medusa fallbacks could never fire because the fields they read were never asked for ([#774](https://github.com/KhaytApp/Khayt/pull/774)). Windows + Linux only again, so macOS goes **two** cuts behind — deliberate, not drift: `beta.8` brought it current the same morning and beta.10 carries no mac-specific change. Verified after the publish: `latest.yml` and `latest-linux.yml` read `3.7.0-beta.10` with all three binaries serving 200, and `latest-mac.yml` is beta.8's in the relative `../v3.7.0-beta.8/` form with both mac assets resolving from the beta.10 feed. **This row says what is being CUT, not what is serving** — confirm against a fetched manifest before relying on it. The 3.6.0 candidate line is closed: `v3.6.0-rc.4` became stable v3.6.0 with no code change between the two. Decide replace-vs-promote *on the day* with `git rev-list --count <tag>..origin/main` and an empty `[Unreleased]`, not from this table. **A version in `package.json` is evidence the cut landed, never that it shipped — confirm with `gh release list` or `git ls-remote --tags`; the `beta.4` day above is what that trap looks like in practice.** |

Last verified 2026-08-27 (after the beta.10 publish) against `gh release list`, `git ls-remote --tags upstream`, and a fetch of every published manifest and every asset it names: all three manifests fetch 200, `latest.yml` and `latest-linux.yml` read `version: 3.7.0-beta.10` and `latest-mac.yml` reads `version: 3.7.0-beta.8` in the relative `../v3.7.0-beta.8/` carry form, and the five binaries they name — the Windows setup, the mac zip and dmg, the AppImage and the deb — each serve 200. These rot fast — confirm with
`gh release list --repo KhaytApp/Khayt` rather than trusting the table.

## The 3.7.0 promotion gate — a soak, and it has never been met

**Not a hold.** Nothing blocks a stable tag. This records the condition for
promoting the `3.7.0` line, because it has been implicit and the numbers say it
is not being met by accident.

`v3.6.0` shipped stable on 2026-08-21. Between 2026-08-22 and 2026-08-27 the
`3.7.0` line ran **ten cuts in six days**. The gate this repo has always stated
for promotion is *real shop use*, and at that cadence no cut on this line has
ever had any: each one is superseded within hours by the next. `beta.9` and
`beta.10` were tagged on the same day.

That is a reasonable way to deliver fixes and a bad way to earn a stable tag,
and the difference matters more on this line than on the last one. `3.7.0`'s
headline feature is print-library tiering, and eviction is — in this file's own
words elsewhere — the only deliberately destructive thing in the print library.
It moves a shop's files off its disk. A line carrying that should not be
promoted on a soak that never happened.

**The condition, stated so it can be checked rather than felt:**

- **Seven consecutive days with no new cut on the line**, and the newest cut
  installed and used on a real shop for that whole window. Not seven days since
  the line opened — seven days in which the thing being promoted is the thing
  people are running.
- **macOS current at promotion.** Running two cuts behind is fine mid-line and
  is not fine for the build that becomes stable, so the promotion candidate is
  built with `BUILD_MAC` set.
- **Eviction exercised on a real library and brought back.** "Bring everything
  back" is the way out and it has never been the subject of a stated test.

Check the first with `git log` on the tags, not from memory:

```bash
gh release list --repo KhaytApp/Khayt --limit 5
```

Promotion is `node scripts/bump-version.js set 3.7.0` — `version:minor` would
turn `3.7.0-beta.10` into `3.8.0`. See [VERSIONING.md](../VERSIONING.md).

**Replace-vs-promote is still decided on the day**, with
`git rev-list --count <tag>..origin/main` and an empty `[Unreleased]`. This
section says when the question may be asked, not what its answer is.

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
