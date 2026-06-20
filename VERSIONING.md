# Khayt versioning

Khayt uses [Semantic Versioning 2.0.0](https://semver.org/) as `MAJOR.MINOR.PATCH` (`X.Y.Z`).

**Current release lines:**

- **Stable:** `2.3.x` — latest tag **v2.3.2** ([releases/latest](https://github.com/khaytapp/Khayt/releases/latest))
- **Beta:** `2.4.0-beta.x` — Khayt-4 themes; see [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md)

Stable hold: no new **stable** tags until [docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md) is lifted. Beta pre-releases may ship alongside stable.

## How your labels map to version numbers

| What you call it | Semver bump | On the current `2.1` line | Git tag |
|------------------|-------------|---------------------------|---------|
| **Minor updates** (day-to-day) | **Patch** | `2.1.0` → `2.1.1` | `v2.1.1` |
| **Significant updates** | **Minor** | `2.1.0` → `2.2.0` | `v2.2.0` |
| **Major updates** | **Major** | `2.1.0` → `3.0.0` | `v3.0.0` |

The pattern you described (`1.1.x` / `1.x` / `X.x.x`) is the same rule on any base: **patch** changes the last number, **significant** changes the middle number, **major** changes the first number. Today that base is **2.1**, not 1.1.

## Single source of truth

- App version: `package.json` → `"version"`
- In-app **Settings → About**: `app.getVersion()` (Electron reads `package.json`)
- GitHub Releases / auto-update: tag `vX.Y.Z` must match `package.json` (e.g. `v2.1.0` and version `2.1.0`)

## How to bump

```bash
# Patch — minor day-to-day update (2.1.0 → 2.1.1)
npm run version:patch

# Minor — significant update (2.1.x → 2.2.0)
npm run version:minor

# Major — breaking / milestone (2.x.x → 3.0.0)
npm run version:major

# Beta — pre-release on next minor (2.3.2 → 2.4.0-beta.1; 2.4.0-beta.1 → 2.4.0-beta.2)
npm run version:beta
```

Each command updates `package.json` and `package-lock.json`. Edit `CHANGELOG.md` under `[Unreleased]` before tagging.

## Release checklist

1. Move notes from `CHANGELOG.md` `[Unreleased]` into `## [X.Y.Z]`.
2. Run the appropriate `npm run version:*` command.
3. Commit: `chore: release vX.Y.Z`
4. Merge to `main` if needed.
5. Tag on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. CI **Build & Release** builds installers from the tag.

## Pre-release tags

Use `npm run version:beta` then tag `v2.4.0-beta.1` (CI treats `-beta`, `-rc`, `-alpha` as GitHub pre-releases). Stable installs must not auto-update to pre-releases — see `lib/updater.js`.
