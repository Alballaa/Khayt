# Security & Bug Audit — Khayt

Audit date: 2026-06-05 (updated after remediation pass).

Automated checks: `npm test`, `npm run lint`, `npm audit` (0 vulnerabilities).

## Remediated

| Item | Fix |
|------|-----|
| Quote approval IDOR | `GET /order/:id/quote` requires valid `?token=` |
| Settings panel Save dead | `saveSettingsFromPanel()` wired |
| Settings save data loss | Preserves `onlineEnabled`, security, quote counters |
| Tunnel stale after LAN stop | Tunnel closes on LAN stop/restart |
| Printer `accessCode` leak | Masked independently of `apiKey` |
| iCal feed unauthenticated | `/calendar.ics?token=` with auto-generated `calendarToken` |
| Survey export broken | `saveHtml(..., { interactive: true })` preserves scripts; uses `JSON.parse` |
| Start Tunnel form sync | Uses `saveLanApiSettingsFromForm` + main resolves PIN from disk |
| Tunnel not restored on boot | Restores when `tunnelEnabled` after LAN start |
| LAN status UI stale | `reconcileLanServerStatus()` / `syncOnlineServerStatusUI()` use live `getLanUrl()` |
| Silent email/webhook failures | Warning toasts + `console.warn` |
| Intake session spam | Rate limit on new session grants (40/hour/IP) |
| Machine secret index merge | ID-only merge; removed array-index fallback |
| Unsafe URL sinks | `safeHttpUrl` / `safeImageSrc` on supplier links and thumbnails |
| Keychain unavailable | Boot warning when OS encryption unavailable |

## Still open (lower priority)

| Severity | Item | Notes |
|----------|------|-------|
| Medium | Public intake on LAN/tunnel | Rate-limited; optional PIN/CAPTCHA if abuse occurs |
| Medium | Secrets plaintext without keychain | Warned on boot; full fail-closed deferred |
| Medium | Large preload bridge | Narrow IPC surface over time |
| Low | Import URL validation in store-validate | Shape-only import checks remain |

## Hardening in place

- Electron: `contextIsolation`, `nodeIntegration: false`, `sandbox: true`
- IPC guard on `hub:*` channels
- LAN owner PIN, brute-force lockout, constant-time compares
- Quote + calendar + tracking tokens on customer URLs
- `/api/status` redirects browsers to `/intake`; API uses `?format=json`

## Recommended next steps

1. HTTP integration tests for LAN routes
2. Optional intake PIN when remote tunnel is enabled
3. Fail-closed secret persistence when keychain unavailable
