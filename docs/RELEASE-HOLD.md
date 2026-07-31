# Release hold (maintainer)

## Status: no hold active

The hold that stood over the 3.1 line **ended when v3.2.0 shipped stable on
2026-07-22**, closing the `3.2.0-beta.x` line at beta.61. `CHANGELOG.md` records
that release as "the 3.2.0 beta line, released as stable", and v3.2.0 is the
current `releases/latest` pointer — so this was the deliberate stable release
the hold was waiting for, not a breach of it.

Nothing currently blocks a stable tag. To impose a new hold, replace this
section with the channel it covers, the reason, and the condition for lifting.

| Channel | Last published | Notes |
|---------|----------------|-------|
| **Stable** | **v3.5.2** (2026-07-30) | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) — two customer-facing currency labels that could name SAR for a shop pricing in something else. The 3.5.1 note still applies: the cross-branch view needs the org branch-read routes in khayt-cloud (b3556a5), which ARE deployed — confirm with `curl -s -o /dev/null -w '%{http_code}' https://cloud.khaytapp.com/v1/shops/probe/org/keysets` (401 = present, 404 = not) |
| **Beta** | **v3.4.0-beta.5** (2026-07-28) | The 3.4 line, promoted to stable as v3.4.0 on 2026-07-29 — nine languages, five new designs, and the UTC-calendar sweep. Earlier: 3.3 line — the reporting-accuracy sweep. With the **3.5** line stable, the next beta opens `3.6.0-beta.1` — never `3.5.x-beta.1`, which would sort BELOW a shipped 3.5.x; see [BETA-RELEASE.md](./BETA-RELEASE.md) |

Last verified 2026-07-30 against published tags. These rot fast — confirm with
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
5. Push the tag only then; that is what triggers the release build
