# Security & Bug Audit — Khayt

Audit date: 2026-06-05. Automated checks: `npm test` (161 pass), `npm run lint`, `npm audit` (0 vulnerabilities).

## Fixed in this pass

| Severity | Issue | Fix |
|----------|-------|-----|
| **Critical** | Quote approval pages were public by order ID; visiting `/order/QUO-…/quote` generated and embedded an approval token without validating `?token=` | `GET /order/:id/quote` now requires a valid `?token=` matching the order's `quoteApprovalToken` |
| **High** | Settings panel Save buttons (`data-act="save-settings-from-panel"`) had no handler | Wired to `saveSettingsFromPanel()` |
| **High** | `saveSettingsFromForm()` dropped `onlineEnabled`, security fields, and quote counters | Preserved on every save |
| **High** | Tunnel stayed active when LAN server stopped/restarted | Tunnel is closed on LAN stop and restart |
| **Medium** | Printer `accessCode` leaked to renderer when `apiKey` was absent | Mask `accessCode` independently |

## Open findings (prioritized)

### Critical / High — security

1. **Public intake form (by design, abuse risk)** — `/intake` grants a session cookie to any visitor on the LAN (or via tunnel). Mitigation today: per-IP submit rate limit (20/hour). Consider: optional PIN, signed invite links, or CAPTCHA if spam becomes an issue.

2. **Secrets plaintext when OS keychain unavailable** — `lib/store-io.js` writes secrets unencrypted if `safeStorage` is unavailable. Consider fail-closed or app-level encryption with user passphrase.

3. **Remote tunnel exposes full LAN API** — `localtunnel` publishes the entire LAN surface. Requires strong owner PIN; disable when not needed. Document clearly in Settings.

### Medium — security

4. **Large preload bridge** — `preload.js` exposes many privileged IPC methods. A renderer XSS would have wide blast radius. Narrow over time.

5. **Unsafe URL sinks in renderer** — `inventory.js`, `views.js` insert stored URLs into `href`/`src` without full sanitization. Low risk under current CSP; harden imports.

6. **Machine secret merge by array index** — `store-io.js` `mergeStoreSecretsFromDisk` has index fallback for `accessCode`. Prefer ID-only merge.

### Medium — bugs

7. **iCal export opens PIN-protected URL without auth** — `exportIcalFeed()` opens `/calendar.ics` which requires owner PIN. Add a read-only calendar token.

8. **Survey export strips inline scripts** — `generateSurveyPage()` → `hub:save-html` → `sanitizeHtmlForFile()` removes `<script>`, breaking exported survey pages.

9. **Start Tunnel ignores unsaved LAN form** — Sync form before tunnel start (similar to `startLanServer`).

10. **Silent integration failures** — `autoSendEmailNotification` and `fireWebhook` swallow errors.

### Low

11. **`tunnelEnabled` saved but not restored on boot**
12. **LAN “running” UI inferred from config flag, not live listener state**
13. **Thin test coverage** for LAN HTTP routes, settings save preservation, tunnel lifecycle

## Dependency audit

`npm audit`: **0** known vulnerabilities in direct/transitive dependencies (323 packages).

## Hardening already in place

- Electron: `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, `webSecurity`
- IPC guard: `hub:*` channels restricted to main window (`lib/ipc-guard.js`)
- LAN: owner PIN for sensitive API routes, brute-force lockout, constant-time token compare
- Store: secrets masked for renderer, encrypted at rest when keychain available
- Quote approval POST already required token; GET now matches
- `/api/status` redirects browsers to `/intake`; API clients use `?format=json`

## Recommended next steps

1. Add HTTP integration tests for `/intake`, `/order/*/quote`, `/calendar.ics`
2. Add read-only tokens for calendar and kiosk routes
3. Review tunnel + intake exposure before any public release
4. Add settings save regression tests for preserved fields
