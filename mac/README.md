# Khayt for macOS — native

A native Mac app, replacing the Electron build **on macOS only**. Windows and
Linux stay on Electron: this exists because Electron cannot be made to feel like
a Mac app, not because the Electron app is going away.

## The architecture, and why

Khayt is ~97,000 lines of JavaScript. This does not rewrite all of it.

| | Lines | Here |
|---|---|---|
| Pure `lib/` — tax, pricing, payment plans, split-order, loyalty, estimator | 29,121 | **reused**, run in JavaScriptCore |
| `renderer/` — the interface | 52,855 | **rewritten** in SwiftUI. This is the point of the exercise |
| `main.js` — 192 IPC handlers | 5,904 | rewritten in Swift |
| Impure `lib/` — store-io, printer protocols, LAN server | 9,583 | rewritten in Swift |

**The business logic is not rewritten, and that is deliberate.** macOS ships
JavaScriptCore as a system framework, so those modules run here unchanged, with
nothing bundled and no Node. A Swift `computeTax` would earn the right to be
wrong in a second, different way, and every future fix would have to be made
twice — in an app whose whole recent history is money bugs found one at a time.

Proven, not assumed:

```
                Swift (JavaScriptCore)     Node              match
tax         →   347826.08 / 52173.92       same              ✓
instalments →   [666.67, 666.67, 666.66]   same              ✓
quote total →   187.5                      same              ✓
```

`MoneyParityTests` runs every case a review pass got wrong — the nil VAT return,
exclusive pricing, the instalment remainder, the split-order deposit, the
customer progress tracker — through both engines and compares the values.

## Layout

```
mac/
  KhaytCore/                     Swift package
    Sources/KhaytCore/           the JS bridge + typed money API
    Sources/KhaytCore/JS/        copies of lib/*.js  ← never edit; run mac/sync-js.sh
    Sources/KhaytApp/            the interface (SwiftUI) — reads, never writes
  sync-js.sh                     re-copy from lib/
  verify-safestorage.sh          confirm the Keychain link against a live store
```

## The copies are guarded twice

SPM resources must live inside the package, so `JS/` holds copies of `lib/`.
That is a fork waiting to happen, so:

* `test/mac-core-is-not-a-fork.test.js` — byte comparison, runs on Linux CI, free.
* `MoneyParityTests` — the same check *plus* Swift-vs-Node values. Needs macOS,
  so it is not in CI: a macOS runner bills at 10×, which is a decision rather
  than a detail. Run it locally before touching anything in `lib/`.

```bash
cd mac/KhaytCore && swift test
```

## Secrets

The store file is plain JSON; three fields inside it are not. The AI key, the
cloud token and the S3 secret are `__enc__` + base64 of Electron `safeStorage`,
which on macOS is Chromium's OSCrypt. `SafeStorage.swift` implements it, and the
shape was measured rather than assumed:

```
ai.apiKey            total 115  prefix "v10"  body 112  body % 16 == 0
cloud.token          total  83  prefix "v10"  body  80  body % 16 == 0
s3.secretAccessKey   total  35  prefix "v10"  body  32  body % 16 == 0
```

Swift and Node are held to identical bytes across the padding edges, and `seal`
refuses to return a field it cannot itself open — the failure it guards is
overwriting a working secret with bytes nothing can decrypt.

One link is deliberately not in the suite: that the Keychain item holds the
PBKDF2 password. Confirming it means reading a live secret, so it is a command
you run, not a test that runs itself:

```bash
./mac/verify-safestorage.sh          # dev store
./mac/verify-safestorage.sh Khayt    # packaged app
KEYCHAIN_WAIT=120 ./mac/verify-safestorage.sh    # slow to answer the prompt
```

It waits a minute for the Keychain and then gives up saying so. `security` blocks
on that permission prompt with no limit of its own, and the prompt can open
behind another window — or never, in a shell with no window server session (ssh,
CI, a git hook). If the password does not arrive, the script checks nothing and
says nothing about your store: an unanswered prompt used to be reported as every
secret failing to decrypt, which is a permission problem wearing the costume of a
corrupt store.

Two traps it will show you:

* **The Keychain item is named after `app.getName()`, which is not constant.**
  A dev run uses `khayt` (package.json `name`); a packaged build uses `Khayt`
  (electron-builder `productName`). Different items, different keys, different
  store files. Mixing them looks exactly like a corrupt store.
* **A native binary has a different code signature, so macOS treats it as a
  different application** and prompts before granting access to Electron's key.
  Expected, once per binary — but it means an unsigned debug build and the
  shipped app are two separate grants.

## The interface

```bash
./mac/make-app.sh --open      # build Khayt.app and launch it
cd mac/KhaytCore && swift run Khayt    # or the bare binary, for working on it
```

`make-app.sh` assembles a real, double-clickable application: the release binary,
the SwiftPM resource bundles, the Khayt icon, an `Info.plist`, and an ad-hoc
signature. `--install` puts a copy in `/Applications` as **Khayt Native.app**, so
it sits beside the Electron app rather than on top of it.

**It is not the shipping build.** Ad-hoc signing means this Mac will run it and no
other will; a Developer ID, a hardened runtime and notarisation are what make it
something a shop can download, and none of that exists yet.

**⌘R reloads from disk.** The store is read once, at launch, so anything the
Electron app writes after that is invisible here until asked for — and while this
is a reader, the two are expected to be open at the same time.

Two things the bundle changes:

* Its identifier is `app.khayt.mac`, **not** `app.khayt.hub`. Two applications
  sharing an identifier confuse Launch Services, the defaults domain, and the
  Keychain's idea of who is asking. It also means the bundled app and `swift run`
  remember their windows separately — `app.khayt.mac` against the bare `Khayt`
  domain — and each needs its own Keychain grant, since they are two signatures.
* `swift run` has to tell AppKit it is a windowed app, or the window opens behind
  everything. A bundle says so itself, so the app now asks only when it has no
  bundle identifier. An app that shoves itself in front of your work on every
  launch is one people learn to resent.

Three shelves off one sidebar: the pipeline as a real `Table` of jobs, the
customers derived from those jobs, and the print library as a grid of models with
the shop's groups beneath it. Each has an inspector. It opens on the shop's own
book if there is one, falling back to the sample only when there is not.

**Put `.inspector` on the `NavigationSplitView`, never inside `detail`.** Inside
it, the detail content is laid out against the window *minus the inspector* with
the sidebar's width never taken off — so a `Table` stretches its columns across
200pt it does not have, and the right-hand ones are clipped away rather than
compressed. The Owed column vanished twice that way before the cause was found,
and column `max` widths do not save you: the stretch ignores them.

It opens a store **read-only**, and there is no code in `KhaytApp` that writes — that is the constraint at the foot of this file
honoured rather than worked around.

A reader can still be wrong in the way that matters: showing a figure the app
the shop actually bills from disagrees with. So the money on screen is not
arithmetic written in Swift. The tax split in the inspector comes from
`lib/tax.js` through `KhaytEngine`, and the sidebar's stage order comes from
`lib/order-progress.js`. What the app works out for itself is what any table
works out — sort keys, filters, and `price - paid`.

Three books, and which one is open is stated in the toolbar and again at the
foot of the sidebar. Mistaking the sample for the shop's real position is the
one error this app must not allow.

| Source | Where |
|---|---|
| Sample shop | 42 jobs bundled in the app; subtitled *sample data — not a real shop* |
| This Mac — development | `~/Library/Application Support/khayt/khayt-store.json` |
| This Mac — Khayt | `~/Library/Application Support/Khayt/khayt-store.json` |

A store that is not on this Mac is not offered: a menu item that leads nowhere
is a dead end dressed up as a choice.

### Photographing it

Judging a design by reading its source is guessing.

```bash
KHAYT_SNAPSHOT_DIR=/tmp/shots swift run Khayt     # writes 01-shop.png, then quits
```

It photographs the window's *theme frame* rather than its content view, because
a unified toolbar lives in the title bar — a sibling of the content, not a child
of it — and a picture without the toolbar is missing most of the chrome.

Two things the picture cannot show. Both are artefacts of drawing a window into
an offline bitmap, not faults to go and fix:

* **The sidebar comes out black and empty.** `NSVisualEffectView` draws nothing
  into a cached bitmap, and `.listStyle(.sidebar)` is one. To see those rows,
  run once with `.listStyle(.plain)`, which has no material.
The run also writes `*-paneN.png`, each scrolling pane photographed on its own,
for when the window shot leaves a doubt. It has the opposite blind spot — it
loses what a pane draws into its own layer, so thumbnails go missing there.

**A correction, since the wrong version stood here for a day.** The library
inspector once photographed as a solid black column and this file blamed the
capture, claiming that two `NSScrollView`s on screen meant one came back black.
That was not it. The inspector was attached inside `detail`, the content was laid
out against a width that never subtracted the sidebar, and the inspector had
nowhere to draw. Moving `.inspector` onto the `NavigationSplitView` fixed the
picture and the app at once. A capture limitation is a comfortable thing to
blame — check the layout first.
* `ImageRenderer` is not the way round it. It returns a "cannot render"
  placeholder for `NavigationSplitView`, `Table` and the toolbar alike — which
  is to say for everything that makes this a Mac window rather than a page.

The window frame is restored from the `Khayt` defaults domain, so `.defaultSize`
applies on a first run and never again. `defaults delete Khayt` to see what a
new shop sees. (That domain belongs to this binary; the Electron app's is
`app.khayt.hub`, and deleting one does not touch the other.)

## Not yet built

Writing, the platform layer — store-io, the printer protocols, the LAN server —
and every screen except the book. `KhaytCore` came first because the
alternative, screens against a half-trusted engine, is how the two apps come to
disagree about a shop's money.

## Who owns the store

The constraint below is now written down on disk rather than assumed.

`lib/store-lock.js` decides who owns `khayt-store.json`; Electron takes ownership
for its whole session, refreshes a heartbeat, and drops it on quit.
`StoreLock.swift` reads that record and the Mac app says who has the book — it
never takes the lock, because it does not write, and a reader claiming ownership
would shut a shop out of its own app for nothing. When writing arrives, that
check is what gates it.

**Ownership, not a lock around each write.** Per-write locking looks smaller and
does not work: `updateStoreOnDisk` reads the in-memory `getStore()` in preference
to the disk, so a second process could take a perfectly correct lock, write,
release, and have its change overwritten by the incumbent's next save from
memory. What has to be exclusive is the session.

**Liveness beats time.** A lock is broken because its process is gone, not
because a clock says so — an app paused at a breakpoint or busy through a long
import is still the owner. The heartbeat is consulted in exactly one case: a
record written by another machine, where there is no pid to ask about.

Two traps, both found by running the two implementations against each other
rather than by reading either:

* **Node and Swift spell this machine differently.** `os.hostname()` gives
  `Turkis-MacBook-Air.local`; `ProcessInfo.hostName` gives
  `turkis-macbook-air.local`. Compared raw, the Mac app reads Electron's lock as
  foreign, stops checking liveness, and judges a live holder on the clock. Both
  sides fold case before comparing.
* **A heartbeat from the future is not stale.** Two machines never agree on the
  time, and treating a negative age as old breaks a live holder's lock instantly.

`test/store-lock.test.js` covers the rules; `StoreLockParityTests` runs sixteen
cases through Node and Swift and compares; and the E2E smoke asserts the running
app actually wrote a record naming its own live process — delete
`acquireStoreOwnership()` from main.js and that fails.

## The one hard constraint

**Only one app may own the store at a time.** Khayt's write serialisation is
per-process: two processes on one `khayt-store.json` race exactly the way two
shop-floor tablets did before #898. Either the Mac app replaces Electron on that
machine, or the second one opens read-only behind a lock.
