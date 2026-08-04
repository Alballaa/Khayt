# Beta releases

Khayt publishes **two release channels** on GitHub:

| Channel | Latest | GitHub | Auto-update |
|---------|--------|--------|-------------|
| **Stable** | `v3.5.3` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v3.6.0-beta.10` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

> Verified 2026-08-04 against published tags. These rot fast — check with
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

## Your quotes change in `v3.6.0-beta.10`

If you price unsliced models, the numbers move again on this build — and for a
different reason than they moved in `beta.9`. Re-check any quote you have not yet
sent.

**A model you have printed before is now priced from its own prints.** Khayt used
to learn one rate for the whole shop and apply it to everything. That is the wrong
shape for the number: measured across 67 finished jobs on one printer it ran from
1.9 to 48.6 g/hour, because it follows the part's geometry, layer height and
colour changes far more than the machine. Tell the calculator which model this is,
using **From your print library**, and it uses that model's own finished prints
instead — and the settings you printed it with, if you name those too.

**The note now says how much of a number you are holding.** It reports the middle
of the jobs behind the rate and how far they disagreed — *"26.3 g/h — the middle
of 12 finished jobs measured on this printer, give or take 12%"* — rather than
stating a rate as though your printer runs at it.

What changed in `beta.9` still applies to any shop upgrading from `beta.8` or
earlier: print time now comes from your measured jobs rather than a shipped
constant of about 35.7 g/hour, and material weight follows your **Default infill
%** rather than a fixed 20%.

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
