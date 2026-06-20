# Beta releases (Khayt-4)

Khayt publishes **two release channels** on GitHub:

| Channel | Tag example | GitHub | Auto-update |
|---------|-------------|--------|-------------|
| **Stable** | `v2.3.3` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v2.4.0-beta.2` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

## What beta includes

**v2.4.0-beta.2** ships Khayt-4 (seven theme shells, previews, Spectrum, Atlas floor map, theme QA) plus the **v2.3.3** opt-in beta updater and a security hardening pass on LAN routes.

Shop data format is unchanged from stable **v2.3.3** — backup/restore works between channels.

## Download beta

1. Open [GitHub Releases](https://github.com/khaytapp/Khayt/releases).
2. Enable **Pre-release** (or open `v2.4.0-beta.2` directly).
3. Download the installer for your platform.

Settings → About shows a **Beta** badge on `-beta` builds.

## Opt-in beta updates (stable or beta)

**Settings → Data & Locale → Include beta pre-releases when checking for updates**

- **Off (default)** — stable releases only.
- **On** — beta pre-releases in in-app update checks.

Stored as `settings.betaUpdates`; synced on boot and save.

## Maintainer: publish beta

```bash
npm run check
npm run test:e2e:themes   # Khayt-4 theme shells
# Move CHANGELOG → ## [X.Y.Z-beta.N]
npm run version:beta
git tag v2.4.0-beta.N && git push origin <branch> --follow-tags
```

CI treats `-(beta|rc|alpha)` tags as GitHub **pre-releases**.
