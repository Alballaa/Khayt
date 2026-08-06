# Khayt versioning

Khayt uses [Semantic Versioning 2.0.0](https://semver.org/) as `MAJOR.MINOR.PATCH` (`X.Y.Z`).

**Current release lines** (last verified 2026-08-06 against published tags):

- **Stable:** `3.5.x` — latest tag **v3.5.3**, published 2026-08-01 ([releases/latest](https://github.com/khaytapp/Khayt/releases/latest))
- **Beta:** the `3.6.0-beta.x` line is **open** — latest **v3.6.0-beta.12**, published 2026-08-06 as a GitHub pre-release. See [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md)
- **Bed Ready:** a different app from the same repo, on its **own** version line
  with its own downloads repo — **1.0.0 shipped 2026-08-03** (`bedready-v1.0.0`,
  marked Latest; the `1.0.0-beta.*` line is closed). It does not follow Khayt's
  numbers at all; see [Bed Ready](#bed-ready) below.

Beta pre-releases may ship alongside stable. For the stable channel's current
policy see [docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md).

> These numbers go stale quickly. `package.json` and the published tags are the
> truth — check with `git ls-remote --tags` before relying on this section.

## How your labels map to version numbers

| What you call it | Semver bump | On the current `3.5` line | Git tag |
|------------------|-------------|---------------------------|---------|
| **Minor updates** (day-to-day) | **Patch** | `3.5.3` → `3.5.4` | `v3.5.4` |
| **Significant updates** | **Minor** | `3.5.3` → `3.6.0` | `v3.6.0` |
| **Major updates** | **Major** | `3.5.3` → `4.0.0` | `v4.0.0` |

The pattern you described (`1.1.x` / `1.x` / `X.x.x`) is the same rule on any base: **patch** changes the last number, **significant** changes the middle number, **major** changes the first number. Today that base is **3.5**, not 1.1.

## Single source of truth

- App version: `package.json` → `"version"`
- In-app **Settings → About**: `app.getVersion()` (Electron reads `package.json`)
- GitHub Releases / auto-update: tag `vX.Y.Z` must match `package.json` (e.g. `v3.5.3` and version `3.5.3`)

## How to bump

```bash
# Patch — minor day-to-day update (3.5.3 → 3.5.4)
npm run version:patch

# Minor — significant update (3.5.x → 3.6.0)
npm run version:minor

# Major — breaking / milestone (3.x.x → 4.0.0)
npm run version:major

# Beta — pre-release on the next minor (3.5.3 → 3.6.0-beta.1; 3.6.0-beta.11 → 3.6.0-beta.12)
npm run version:beta
```

`version:beta` behaves differently depending on where you start, which is easy
to get wrong: from a **stable** version it bumps the minor and starts at
`beta.1` (`3.5.3` → `3.6.0-beta.1`); from an existing beta it only increments
the counter (`3.6.0-beta.11` → `3.6.0-beta.12`). See `scripts/bump-version.js`.

This is why a beta never sits on the *current* stable line: a `3.5.4-beta.1`
would sort BELOW the shipped `v3.5.3` and would never be offered as an update.

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

> **The workflow that runs is the one in the commit you tag**, not the one on
> `main`. Tagging an older commit runs that commit's `.github/workflows/release.yml`
> — and if the tag pattern it needs was added later, nothing runs at all, with no
> error anywhere. Tag the tip, or a commit you have checked contains the workflow
> you expect.

## Pre-release tags

Use `npm run version:beta` then tag the resulting version (e.g. `v3.6.0-beta.1`). CI treats `-beta`, `-rc` and `-alpha` as GitHub pre-releases. Stable installs must not auto-update to pre-releases — see `lib/updater.js`.

## Bed Ready

Bed Ready is a separate flavor built from this same repo (`KHAYT_FLAVOR=bedready`,
see `lib/flavor.js`). Its versioning is **independent of Khayt's** in every way
that matters:

| | Khayt | Bed Ready |
|---|---|---|
| version line | `3.x` | `1.0.0-*` |
| where the number lives | `package.json` | the **workflow input**, via `BEDREADY_VERSION` |
| how it is released | push a `vX.Y.Z` tag | **run the workflow**, no tag here |
| tag | `vX.Y.Z` in `KhaytApp/Khayt` | `bedready-vX.Y.Z`, created in `KhaytApp/bedready` |
| downloads | `KhaytApp/Khayt` releases | **`KhaytApp/bedready`** releases |

**There is no `npm run version:*` step.** `scripts/build-bedready.mjs` swaps the
version into `package.json` only for the duration of the build and restores the
source byte-identically; nothing is committed. So a release is just a run:

```
Actions -> "Build & Release" -> Run workflow
  Use workflow from: main (or the commit's branch)
  Bed Ready version:  1.0.1                # no "v", no "bedready-" prefix
```

or from the terminal:

```bash
gh workflow run "Build & Release" --repo KhaytApp/Khayt \
  -f bedready_version=1.0.1
```

The version you type **is** the version, and the release tag
`bedready-v1.0.1` is created in `KhaytApp/bedready` by the workflow.

**Do not tag `bedready-v*` in `KhaytApp/Khayt`.** It no longer triggers anything,
and it actively breaks Khayt's updater: electron-updater picks a release by walking
that repo's `releases.atom`, and the feed lists **tags**, whether or not a release
exists for them. A `bedready-v*` tag sitting there shows up in Khayt's own update
feed; whenever it is the newest entry, a Khayt user with beta updates on resolves
it and then asks for
`/KhaytApp/Khayt/releases/download/bedready-v1.0.0/latest-mac.yml`, which is a 404
because that release is in the other repo. Their update check just fails. That is
why the trigger moved.

Two things that are easy to get wrong:

- **The two lanes are told apart by the EVENT, not the tag name.** A tag push runs
  Khayt's five jobs; a workflow dispatch runs Bed Ready's five. Neither can be
  triggered by the other, and a dispatch no longer needs `startsWith` guards on a
  ref name that would be a branch.
- **Publishing needs the `BEDREADY_RELEASE_TOKEN` secret** — a PAT with
  `contents:write` on `KhaytApp/bedready`. The automatic `GITHUB_TOKEN` is scoped
  to one repo and cannot create a release in another. Without it the lane stops
  on its first step and says so.

Bed Ready releases are marked pre-release for `-beta`/`-rc`/`-alpha` exactly as
Khayt's are.
