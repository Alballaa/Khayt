# Windows code signing (Bed Ready + Khayt)

Right now the Windows installers (`*-Setup.exe`, `*-portable.exe`) ship **unsigned**.
On a clean machine that means a **SmartScreen "Windows protected your PC"** warning and,
in some enterprise/AV setups, the download being quarantined. Signing removes the warning
and (after enough installs, or immediately with an EV cert) builds SmartScreen reputation.

This doc explains the options, the recommendation, and exactly how to turn signing on. The
build configs and CI are already wired so that **once the signing secrets exist, signing
activates automatically** — no code change needed. Until then builds stay unsigned.

---

## TL;DR recommendation

Use **Azure Trusted Signing** (formerly Azure Code Signing). It is the only option that is
both cheap (~USD $10/month) and CI-native (no physical USB token to plug into a GitHub
runner). The one-time cost is identity validation (individual or business). See
[Path A](#path-a--azure-trusted-signing-recommended).

If you already hold a legacy `.pfx` file with an exportable key (older OV certs, or an
SSL.com eSigner cloud credential exported as PFX), you can use the simpler env-var path
instead — see [Path B](#path-b--pfx-file-legacy--essigner).

> **Why not "just buy an OV cert and use the .pfx"?** Since June 2023 the CA/Browser Forum
> requires the private key of a **newly issued** OV (and EV) code-signing cert to live on a
> FIPS-140 HSM or hardware token. CAs no longer hand you an exportable `.pfx`. So a brand-new
> OV cert can't be used as a bare file in CI — it needs a cloud-HSM signing service (Azure
> Trusted Signing, DigiCert KeyLocker, SSL.com eSigner) or a physical EV token.

| Option | Cost | CI-friendly | SmartScreen | Notes |
|---|---|---|---|---|
| **Azure Trusted Signing** | ~$10/mo | ✅ yes | reputation-based | Recommended. Needs Azure sub + identity validation. |
| EV cert on USB token | ~$300–500/yr | ❌ no (physical token) | ✅ instant | Would require self-hosted/local Windows signing, not GitHub CI. |
| DigiCert KeyLocker / SSL.com eSigner | ~$400+/yr | ✅ yes | reputation or instant (EV) | Cloud HSM; more expensive than Azure. |
| Legacy `.pfx` (pre-2023 OV or eSigner PFX) | varies | ✅ yes | reputation-based | Only if you already have an exportable key. |

---

## Path A — Azure Trusted Signing (recommended)

1. **Azure setup** (one-time):
   - Create/enter an Azure subscription.
   - Create a **Trusted Signing account** and a **Certificate Profile** (Public Trust).
   - Complete **identity validation** (individual or organization). This is the gating step;
     it can take a few days for orgs.
   - Create a service principal (App Registration) with the **Trusted Signing Certificate
     Profile Signer** role on the account, and note: tenant ID, client ID, client secret,
     the account endpoint (e.g. `https://weu.codesigning.azure.net`), account name, and
     profile name.

2. **Add repo secrets** (in `KhaytApp/bedready` → Settings → Secrets → Actions):
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   - `AZURE_TS_ENDPOINT`, `AZURE_TS_ACCOUNT`, `AZURE_TS_PROFILE`

3. **Enable the signing step.** The Windows job in the Bed Ready release workflow has a
   commented Azure Trusted Signing step (see the release workflow in the `KhaytApp/bedready`
   repo). Uncomment it. It uses the official `azure/trusted-signing-action` to sign the
   built `.exe`s after `electron-builder` produces them, then re-generates `latest.yml`
   (the auto-update feed) so the `sha512` matches the **signed** binaries.

   > ⚠️ Order matters: sign **before** the update feed's `sha512` is computed, or before you
   > re-hash. Signing changes the file bytes; a `latest.yml` hash taken pre-signing will make
   > `electron-updater` reject the download with a "sha512 mismatch". electron-builder does
   > this correctly when it signs during the build; if you sign as a *post* step, you must
   > re-run the `latest.yml` hashing afterward.

The cleanest integration is to let **electron-builder** invoke Azure Trusted Signing itself
via a custom `sign` hook, so the feed hashes are always taken post-signing. A ready-to-use
`build/win-sign.js` hook + the `win.sign` wiring can be dropped in when you pick this path.

## Path B — `.pfx` file (legacy / eSigner)

Only viable if you have a `.pfx` whose private key you can export (pre-2023 OV cert, or an
SSL.com eSigner credential exported to PFX).

1. Base64-encode the `.pfx`: `base64 -i cert.pfx | pbcopy` (macOS).
2. Add secrets to `KhaytApp/bedready`:
   - `WIN_CSC_LINK` = the base64 string
   - `WIN_CSC_KEY_PASSWORD` = the PFX password
3. That's it. The Windows build already forwards these env vars to electron-builder (they are
   a **no-op when the secrets are absent**, so current unsigned builds are unaffected).
   electron-builder signs the `.exe`s and computes the update-feed hashes over the signed
   bytes automatically.

---

## Khayt (business app) note

The Khayt release workflow (`.github/workflows/release.yml`, `build-windows` job) has the same
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` lines pre-staged (commented, "uncomment when HARICA cert
is ready"). Khayt additionally ships an **MSIX/appx** to the Microsoft Store, which Partner
Center signs during certification — so the Store package needs no cert from us.

## How to verify a signed build

On Windows: right-click the `.exe` → Properties → **Digital Signatures** tab should list the
signer. Or in PowerShell:

```powershell
Get-AuthenticodeSignature .\BedReady-<ver>-win-x64-Setup.exe | Format-List Status, SignerCertificate
```

`Status` should be `Valid`. Then re-download via the app's auto-updater on a second machine to
confirm `electron-updater` accepts the (signed) payload — i.e. the `latest.yml` `sha512` matches.
