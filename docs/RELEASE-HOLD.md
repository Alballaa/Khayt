# Release hold (maintainer)

**Do not tag or publish GitHub Releases** until this hold is lifted.

`main` may receive merges for the pre–Khayt Cloud batch (update check, online intake, polish, print-farm local features). Installers and auto-update feeds stay on the last published tag until a deliberate release.

**Maintainer:** validate on `main` via `git pull` + `npm start` for at least ~1 week before lifting the hold and tagging (e.g. v2.3.3).

Last published: **v2.3.2** (see [GitHub Releases](https://github.com/Alballaa/Khayt/releases)).

When ready to ship again: run `npm run check`, move `[Unreleased]` in `CHANGELOG.md`, bump version, tag `vX.Y.Z`, push tag only then.
