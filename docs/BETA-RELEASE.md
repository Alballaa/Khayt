# Beta releases

Khayt publishes **two release channels** on GitHub:

| Channel | Latest | GitHub | Auto-update |
|---------|--------|--------|-------------|
| **Stable** | `v3.5.3` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v3.6.0-beta.8` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

> Verified 2026-08-03 against published tags. These rot fast — check with
> `gh release list --repo KhaytApp/Khayt` rather than trusting the table.

## What beta includes

The open line is **`3.6.0-beta.x`**. It is about Khayt learning what your prints
actually cost, rather than being told: a model becomes a quote, the printer
reports the real filament and duration when the job finishes, the settings that
worked are remembered against the file, and the estimator calibrates itself from
your finished jobs instead of a constant.

It is a beta rather than a stable release for one reason: it changes **what your
customers are quoted**, and how every geometry-based time estimate is worked out.
Read the section below before you send a quote from it.

It also fixes two things that never worked — 3MF files never gave up the figures
your slicer had already written into them, and Bambu/Orca print times were
silently dropped — and, since `beta.1`, a converter that could drop whole objects
from a large 3MF while reporting success.

Shop data stays backward compatible across a beta line — backup/restore works
between channels, and new fields are additive and absent-safe.

Earlier lines are closed and their features are in stable: the `3.2.0-beta.x`
line carried QC / reprint / RMA, shipping & fulfillment, BOM assemblies, privacy
(PDPL) tooling, the scoped-token public API with a webhook event bus, opt-in
telemetry and per-printer cameras, all stable since **v3.2.0**. You do not need
a beta for any of them.

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
npm run check                        # lint + unit suite
npm run check:changelog              # every shipped change carries a note
npm run check:globals                # nothing wired up but silently inert
npm run test:e2e:themes              # theme shells
# plus the feature smokes — `npm run` lists them all as test:e2e:*; the ones
# covering what this line changed are:
#   :intake :intakequote :estimator :actuals :setups :filelink :dedupe
# and the standing set:
#   :qc :shipping :bom :privacy :assembly :apitokens :webhooks :webhookretry
#   :telemetry :printers :discovery :screens :a11y :quitflush :pollcache
#   :help :3mfworker
# Move CHANGELOG → ## [X.Y.Z-beta.N]
npm run version:beta
# Tag the version that command produced — never a literal from this file.
V=v$(node -p "require('./package.json').version")
git tag -a "$V" -m "$V" && git push upstream "$V"   # release CI runs on KhaytApp/Khayt
```

CI treats `-(beta|rc|alpha)` tags as GitHub **pre-releases**.
