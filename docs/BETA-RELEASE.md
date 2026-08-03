# Beta releases (Khayt-4)

Khayt publishes **two release channels** on GitHub:

| Channel | Tag example | GitHub | Auto-update |
|---------|-------------|--------|-------------|
| **Stable** | `v3.2.0` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v3.3.0-beta.1` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

## What beta includes

The **3.2 beta line is finished**: it ran to `v3.2.0-beta.61` and shipped as
stable **v3.2.0** on 2026-07-22. Everything it carried — QC / reprint / RMA,
shipping & fulfillment, BOM assemblies, privacy (PDPL) tooling, the
scoped-token public API with a webhook event bus, opt-in telemetry, and
per-printer cameras — is now in stable, so there is no reason to run a 3.2 beta
for those features.

The current line is **`3.6.0-beta.x`**, published through `v3.6.0-beta.8`.

Shop data stays backward compatible across a beta line — backup/restore works
between channels, and new fields are additive and absent-safe.

## Your quotes will change in the next `3.6.0-beta`

If you price unsliced models, two fixes change the numbers Khayt gives you.
Neither is a new pricing policy — both make the estimate use figures it was
already meant to use and had been ignoring — but the numbers *will* move, so
re-check any quote you have not yet sent.

- **Print time** changes for any shop with three or more finished jobs a printer
  measured. Khayt now works your rate out from those jobs instead of the constant
  it shipped with, which implied about 35.7 g/hour — a rate no real FDM machine
  sustains. A slower measured rate means a longer job and a higher price.
- **Material weight** changes for any shop whose **Default infill %** is not 20.
  The calculator had been using a fixed 20% whatever that setting said, while the
  customer intake form used your real one — so the same file could come back from
  the two with different answers. They now agree.

The note under the drop zone tells you which rate the estimate used, and whether
it was measured from your jobs or assumed — so you can see which of the two moved
your number.

Figures that came from a slicer are unaffected. Those were never estimates, and
nothing recalculates them.

## Download beta

1. Open [GitHub Releases](https://github.com/khaytapp/Khayt/releases).
2. Enable **Pre-release**, or open the newest `-beta` tag directly.
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
