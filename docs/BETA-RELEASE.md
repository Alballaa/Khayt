# Beta releases (Khayt-4)

Khayt publishes **two release channels** on GitHub:

| Channel | Tag example | GitHub | Auto-update |
|---------|-------------|--------|-------------|
| **Stable** | `v3.1.0` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v3.2.0-beta.22` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

## What beta includes

**v3.2.0-beta.22** is the current pre-release of the 3.x feature line: QC / reprint / RMA, shipping & fulfillment, BOM assemblies, privacy (PDPL) tooling, the scoped-token public API with a webhook event bus, opt-in telemetry, and per-printer cameras.

Shop data format is backward compatible with stable **v3.1.0** — backup/restore works between channels. New 3.2 fields are additive and absent-safe.

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
npm run test:e2e:themes   # theme shells
# plus the feature smokes: test:e2e:qc, :shipping, :bom, :privacy, :assembly,
#                          :apitokens, :webhooks, :webhookretry, :telemetry, :printers
# Move CHANGELOG → ## [X.Y.Z-beta.N]
npm run version:beta
git tag v3.2.0-beta.N && git push upstream v3.2.0-beta.N   # release CI runs on KhaytApp/Khayt
```

CI treats `-(beta|rc|alpha)` tags as GitHub **pre-releases**.
