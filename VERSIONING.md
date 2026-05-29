# Khayt versioning

Khayt uses [Semantic Versioning 2.0.0](https://semver.org/) as `MAJOR.MINOR.PATCH` (also written `X.Y.Z`).

| Bump | Example | Git tag | When to use |
|------|---------|---------|-------------|
| **Patch** (minor day-to-day updates) | `1.1.0` → `1.1.1` | `v1.1.1` | Bug fixes, copy/i18n tweaks, small UI polish, dependency patches, security fixes without behavior change |
| **Minor** (significant updates) | `1.1.2` → `1.2.0` | `v1.2.0` | New features, new settings, new integrations, noticeable workflow changes that stay backward-compatible with existing `khayt-store.json` data |
| **Major** (breaking / milestone) | `1.9.0` → `2.0.0` | `v2.0.0` | Breaking store schema, removed settings, incompatible LAN API, or a release that requires explicit migration steps |

The **1.1** line is the current product generation under active maintenance. Patch releases stay on that line (`1.1.x`) until a **minor** bump starts a new feature line (`1.2.0`, `1.3.0`, …).

## Single source of truth

- App version: `package.json` → `"version"`
- In-app **Settings → About**: `app.getVersion()` (Electron reads `package.json`)
- GitHub Releases / auto-update: tag `vX.Y.Z` must match `package.json` (e.g. tag `v1.1.1` and version `1.1.1`)

## How to bump

```bash
# Patch (1.1.0 → 1.1.1)
npm run version:patch

# Minor (1.1.x → 1.2.0)
npm run version:minor

# Major (1.x.x → 2.0.0)
npm run version:major
```

Each command updates `package.json` and `package-lock.json`. Edit `CHANGELOG.md` under `[Unreleased]` before tagging.

## Release checklist

1. Move notes from `CHANGELOG.md` `[Unreleased]` into a dated `## [X.Y.Z]` section.
2. Run the appropriate `npm run version:*` command.
3. Commit: `chore: release vX.Y.Z`
4. Push branch, open PR (or merge to `main`).
5. Tag on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. CI **Build & Release** (`.github/workflows/release.yml`) builds installers from the tag.

## Legacy numbering

Releases before this policy used `2.0.x` in `package.json`. Maintenance under the new scheme starts at **1.1.0** (same codebase; numbering reset for clarity). Users on `2.0.x` builds should use **Export all data** before upgrading if auto-update does not offer a clean path.

## Pre-release tags

Optional suffixes for testers: `v1.2.0-beta.1`, `v1.2.0-rc.1` (CI treats tags containing `-beta`, `-rc`, or `-alpha` as pre-releases).
