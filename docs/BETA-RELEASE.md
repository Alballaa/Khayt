# Beta releases

Khayt publishes **two release channels** on GitHub:

| Channel | Latest | GitHub | Auto-update |
|---------|--------|--------|-------------|
| **Stable** | `v3.5.3` | [Latest release](https://github.com/khaytapp/Khayt/releases/latest) | Default (beta off) |
| **Beta** | `v3.6.0-beta.15` | [Pre-releases](https://github.com/khaytapp/Khayt/releases) (filter *Pre-release*) | Opt-in via Settings |

> Verified 2026-08-09 against published tags. These rot fast — check with
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

## Your quotes changed in `beta.9` and `beta.10`

If you price unsliced models and you are coming from `beta.8` or earlier, the
numbers have moved — twice, for two different reasons. Re-check any quote you
have not yet sent. **Neither `beta.11` nor `beta.12` changes an estimate you
have already seen** — though from `beta.12`, **Slice for exact quote** fills in a
weight where it used to leave the box empty, so a quote made that way is fuller
than it was rather than different.

**`beta.9` — the estimate started using your own numbers.** Print time now comes
from jobs your printer measured rather than a shipped constant of about 35.7
g/hour, and material weight follows your **Default infill %** rather than a fixed
20%. Until then the customer intake form used your real settings while the
calculator did not, so the same file could come back from the two with different
answers.

**`beta.10` — a model you have printed before is priced from its own prints.**
One rate for the whole shop is the wrong shape for the number: measured across 67
finished jobs on one printer it ran from 1.9 to 48.6 g/hour, because it follows
the part's geometry, layer height and colour changes far more than the machine.
Name the model under **From your print library** and Khayt uses that model's own
finished prints instead — and the settings you printed it with, if you name those
too. The note also says how much of a number you are holding: *"26.4 g/h — the
middle of 3 finished prints of this model, give or take 1%"* rather than a bare
rate.

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
