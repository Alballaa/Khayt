# Khayt versioning

Khayt uses [Semantic Versioning 2.0.0](https://semver.org/) as `MAJOR.MINOR.PATCH` (`X.Y.Z`).

**Current release lines** (last verified 2026-07-25 against published tags):

- **Stable:** `3.2.x` — latest tag **v3.2.0**, published 2026-07-22 ([releases/latest](https://github.com/khaytapp/Khayt/releases/latest))
- **Beta:** the `3.2.0-beta.x` line is **closed** — it ended at **v3.2.0-beta.61** and shipped as stable v3.2.0. The next pre-release opens the `3.3.0-beta.x` line; see [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md)

Beta pre-releases may ship alongside stable. For the stable channel's current
policy see [docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md).

> These numbers go stale quickly. `package.json` and the published tags are the
> truth — check with `git ls-remote --tags` before relying on this section.

## How your labels map to version numbers

| What you call it | Semver bump | On the current `3.2` line | Git tag |
|------------------|-------------|---------------------------|---------|
| **Minor updates** (day-to-day) | **Patch** | `3.2.0` → `3.2.1` | `v3.2.1` |
| **Significant updates** | **Minor** | `3.2.0` → `3.3.0` | `v3.3.0` |
| **Major updates** | **Major** | `3.2.0` → `4.0.0` | `v4.0.0` |

The pattern you described (`1.1.x` / `1.x` / `X.x.x`) is the same rule on any base: **patch** changes the last number, **significant** changes the middle number, **major** changes the first number. Today that base is **3.2**, not 1.1.

## Single source of truth

- App version: `package.json` → `"version"`
- In-app **Settings → About**: `app.getVersion()` (Electron reads `package.json`)
- GitHub Releases / auto-update: tag `vX.Y.Z` must match `package.json` (e.g. `v3.2.0` and version `3.2.0`)

## How to bump

```bash
# Patch — minor day-to-day update (3.2.0 → 3.2.1)
npm run version:patch

# Minor — significant update (3.2.x → 3.3.0)
npm run version:minor

# Major — breaking / milestone (3.x.x → 4.0.0)
npm run version:major

# Beta — pre-release on the next minor (3.2.0 → 3.3.0-beta.1; 3.3.0-beta.1 → 3.3.0-beta.2)
npm run version:beta
```

`version:beta` behaves differently depending on where you start, which is easy
to get wrong: from a **stable** version it bumps the minor and starts at
`beta.1` (`3.2.0` → `3.3.0-beta.1`); from an existing beta it only increments
the counter (`3.3.0-beta.1` → `3.3.0-beta.2`). See `scripts/bump-version.js`.

Each command updates `package.json` and `package-lock.json`. Edit `CHANGELOG.md` under `[Unreleased]` before tagging.

## Release checklist

1. Move notes from `CHANGELOG.md` `[Unreleased]` into `## [X.Y.Z]`.
2. Run the appropriate `npm run version:*` command.
3. Commit: `chore: release vX.Y.Z`
4. Merge to `main` if needed.
5. Tag on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. CI **Build & Release** builds installers from the tag.

## Pre-release tags

Use `npm run version:beta` then tag the resulting version (e.g. `v3.3.0-beta.1`). CI treats `-beta`, `-rc` and `-alpha` as GitHub pre-releases. Stable installs must not auto-update to pre-releases — see `lib/updater.js`.
