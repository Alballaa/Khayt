# Release hold (maintainer)

**Do not tag or publish GitHub Releases** until this hold is lifted.

`main` may receive merges for the pre–Khayt Cloud batch (update check, online intake, polish). Installers and auto-update feeds stay on the last published tag until a deliberate release.

Last published: **v2.3.3** (see [GitHub Releases](https://github.com/Alballaa/Khayt/releases/latest)). Beta pre-releases (`v*-beta.*`) remain on the [pre-release channel](./BETA-RELEASE.md).

When ready to ship again: run `npm run check`, move `[Unreleased]` in `CHANGELOG.md`, bump version, tag `vX.Y.Z`, push tag only then.
