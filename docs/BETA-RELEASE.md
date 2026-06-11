# Beta releases (Khayt-4)

Khayt publishes **two release channels** on GitHub:

| Channel | Tag example | GitHub | Auto-update |
|---------|-------------|--------|-------------|
| **Stable** | `v2.3.2` | [Latest release](https://github.com/Alballaa/Khayt/releases/latest) | Default for stable installs |
| **Beta** | `v2.4.0-beta.1` | [Pre-releases](https://github.com/Alballaa/Khayt/releases) (filter *Pre-release*) | Only beta-tagged installs |

## What beta includes

**v2.4.0-beta.1** ships the Khayt-4 theme program: seven selectable shells (Studio, Ledger, Console, Atelier, Vitrine, Cockpit, Atlas), theme previews, Spectrum skins for Cockpit, and theme QA (`npm run test:e2e:themes`). Pulse and Stream remain reserved.

Shop data format is unchanged from stable **v2.3.2** — you can move between stable and beta with normal backup/restore if needed.

## Download beta

1. Open [GitHub Releases](https://github.com/Alballaa/Khayt/releases).
2. Enable **Pre-release** in the filter (or open the `v2.4.0-beta.1` tag directly).
3. Download the installer for your platform (same filenames as stable).

Settings → About shows a **Beta** badge when running a `-beta` build.

## Maintainer: publish beta next to stable

Stable hold ([RELEASE-HOLD.md](./RELEASE-HOLD.md)) stays on **v2.3.2**. Beta does **not** lift the hold for stable tags.

```bash
npm run check
# Move CHANGELOG [Unreleased] → ## [X.Y.Z-beta.N]
npm run version:beta          # 2.3.2 → 2.4.0-beta.1; 2.4.0-beta.1 → 2.4.0-beta.2
git add -A && git commit -m "chore: release v2.4.0-beta.1"
git tag v2.4.0-beta.1
git push origin <branch> --follow-tags
```

CI **Build & Release** treats tags matching `-(beta|rc|alpha)` as GitHub **pre-releases** (draft until assets upload).

## Updater behavior

- **Stable app** (`2.3.2`): `allowPrerelease` is off; update checks ignore beta tags even though `2.4.0` numerically exceeds `2.3.2`.
- **Beta app** (`2.4.0-beta.1`): `allowPrerelease` is on; in-app updates follow the beta feed.

Bump the next beta with `npm run version:beta`. When Khayt-4 is ready for stable, cut `v2.4.0` (no `-beta`) per [VERSIONING.md](../VERSIONING.md).
