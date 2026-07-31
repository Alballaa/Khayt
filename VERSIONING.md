# Khayt versioning

Khayt uses [Semantic Versioning 2.0.0](https://semver.org/) as `MAJOR.MINOR.PATCH` (`X.Y.Z`).

**Current release lines** (last verified 2026-07-31 against published tags):

- **Stable:** `3.5.x` — latest tag **v3.5.2**, published 2026-07-30 ([releases/latest](https://github.com/khaytapp/Khayt/releases/latest))
- **Beta:** the `3.6.0-beta.x` line is **open** — latest **v3.6.0-beta.1**, published 2026-07-31 as a GitHub pre-release. See [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md)

Beta pre-releases may ship alongside stable. For the stable channel's current
policy see [docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md).

> These numbers go stale quickly. `package.json` and the published tags are the
> truth — check with `git ls-remote --tags` before relying on this section.

## How your labels map to version numbers

| What you call it | Semver bump | On the current `3.5` line | Git tag |
|------------------|-------------|---------------------------|---------|
| **Minor updates** (day-to-day) | **Patch** | `3.5.2` → `3.5.3` | `v3.5.3` |
| **Significant updates** | **Minor** | `3.5.2` → `3.6.0` | `v3.6.0` |
| **Major updates** | **Major** | `3.5.2` → `4.0.0` | `v4.0.0` |

The pattern you described (`1.1.x` / `1.x` / `X.x.x`) is the same rule on any base: **patch** changes the last number, **significant** changes the middle number, **major** changes the first number. Today that base is **3.5**, not 1.1.

## Single source of truth

- App version: `package.json` → `"version"`
- In-app **Settings → About**: `app.getVersion()` (Electron reads `package.json`)
- GitHub Releases / auto-update: tag `vX.Y.Z` must match `package.json` (e.g. `v3.5.2` and version `3.5.2`)

## How to bump

```bash
# Patch — minor day-to-day update (3.5.2 → 3.5.3)
npm run version:patch

# Minor — significant update (3.5.x → 3.6.0)
npm run version:minor

# Major — breaking / milestone (3.x.x → 4.0.0)
npm run version:major

# Beta — pre-release on the next minor (3.5.2 → 3.6.0-beta.1; 3.6.0-beta.1 → 3.6.0-beta.2)
npm run version:beta
```

`version:beta` behaves differently depending on where you start, which is easy
to get wrong: from a **stable** version it bumps the minor and starts at
`beta.1` (`3.5.2` → `3.6.0-beta.1`); from an existing beta it only increments
the counter (`3.6.0-beta.1` → `3.6.0-beta.2`). See `scripts/bump-version.js`.

This is why a beta never sits on the *current* stable line: a `3.5.3-beta.1`
would sort BELOW the shipped `v3.5.2` and would never be offered as an update.

Each command updates `package.json` and `package-lock.json`. Edit `CHANGELOG.md` under `[Unreleased]` before tagging.

## Release checklist

1. Move notes from `CHANGELOG.md` `[Unreleased]` into `## [X.Y.Z]`.
2. Run the appropriate `npm run version:*` command.
3. Commit: `chore: release vX.Y.Z`
4. Merge to `main` if needed.
5. Tag the merge commit on `main`, then push the tag **to the repository where
   release CI runs — `KhaytApp/Khayt`**:

   ```bash
   git tag -a vX.Y.Z <merge-commit> -m "vX.Y.Z"
   git push <remote> vX.Y.Z      # the remote pointing at KhaytApp/Khayt
   ```

   Check first with `git remote -v`. In a direct clone that is `origin`; if you
   work from a fork it is usually `upstream`, and pushing the tag to the fork
   builds nothing at all.
6. CI **Build & Release** builds installers from the tag (`on: push: tags: v*`).

## Pre-release tags

Use `npm run version:beta` then tag the resulting version (e.g. `v3.6.0-beta.1`). CI treats `-beta`, `-rc` and `-alpha` as GitHub pre-releases. Stable installs must not auto-update to pre-releases — see `lib/updater.js`.
