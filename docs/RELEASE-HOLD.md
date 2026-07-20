# Release hold (maintainer)

**Stable channel:** do not tag or publish a new **stable** GitHub Release until this hold is lifted.

`main` may receive merges for Khayt-4 and follow-on work (including the pre–Khayt Cloud batch: update check, online intake, polish, print-farm local features). **Stable** installers and auto-update feeds stay on the last published stable tag until a deliberate stable release.

| Channel | Last published | Notes |
|---------|----------------|-------|
| **Stable** | **v3.1.0** | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) |
| **Beta** | **v3.2.0-beta.22** | [Pre-releases](https://github.com/khaytapp/Khayt/releases) — the 3.x feature line (QC/RMA, shipping, BOM, privacy, public API, telemetry, cameras); see [BETA-RELEASE.md](./BETA-RELEASE.md) |

Beta tags (`v*-beta.*`) are allowed while stable hold is active. They publish as GitHub **pre-releases** and do not replace the stable latest pointer.

When ready to ship **stable** again: run `npm run check`, move `[Unreleased]` in `CHANGELOG.md`, bump with `npm run version:minor` (or patch), tag `vX.Y.Z` (no prerelease suffix), push tag only then.
