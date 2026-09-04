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

It can change a model's favourite star and file models into groups, and only
while it owns the book. Select several — click, ⌘-click, ⇧-click — and the whole
selection is filed in ONE write: seven kings filed one at a time would be seven
read-modify-writes and six windows in which a crash leaves the collection half
made.

Group names go through `lib/organise.js`, bundled and run rather than ported,
because the rule that matters is that a name matching one already in use IS that
name and adopts its spelling. "Saudi Kings" and "saudi kings" as two chips, each
holding part of one collection, is exactly what that module exists to prevent. See **Who owns the store**; the star is a control when this app holds
ownership and a plain mark when the Electron app does, because a disabled toggle
invites people to keep pressing it.

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

## The menu bar, and what a Commands body does not do

Everything the app can do is in the menu bar with a key for it — ⌘1/2/3 for the
three shelves, ⌘R to reload, ⌘D to favourite, ⇧⌘R to reveal, ⌘O to open. A menu
you have to know is there is a feature for the person who wrote it.

Two routes were tried before the one that is in the file:

* **`focusedSceneValue` + `@FocusedValue`** is the documented way and is what a
  multi-window app needs. It delivers **nil** here — with the window key, main
  and the app active, declared both with `@Entry` and with an explicit
  `FocusedValueKey`. Every item then validates as disabled, which reads as a bug
  in the menu rather than in the plumbing.
* **Passing the `Shop` in as a plain `let`** delivers it and then never updates:
  a `Commands` body does not re-run when an `@Observable` it read changes.

What works is reading the flags in the **Scene's** body — `let _ = (shop.…)` —
which is what makes SwiftUI rebuild the menu bar, with `@Bindable var shop`
inside `KhaytCommands` for the values themselves. The `let _` is load-bearing;
deleting it freezes every item in the state it had at launch.

`KHAYT_SNAPSHOT_DIR` runs print the menu bar as AppKit built it, titles and
shortcuts and all, because a `Commands` block that compiles proves nothing about
what a person can reach.

**No `Settings` scene yet**, so ⌘, does nothing. That is a gap, and an empty
preferences window would be a worse one — there is no setting this app owns that
is not either the shop's (which lives in the book) or the Book menu's.

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

### Writing

`StoreWriter` is the only code in this app that can lose a shop's data, so it is
built around three rules:

* **It never decrypts.** The secrets on disk are already `__enc__` strings, so an
  edit to another field carries them through untouched and `SafeStorage` is never
  involved — decrypting to re-encrypt would put a working credential one bad round
  trip away from unreadable, for nothing. The price is that the whole store goes
  through a JSON decode and encode, so `StoreRoundTripTests` proves a real store
  survives that value for value. If it did not, every record's fingerprint would
  move and `stampChanges` would push the entire book to the cloud as changes
  nobody made.
* **It reads from disk, inside the write** — never from anything already held.
  `updateStoreOnDisk` learned that one the hard way.
* **It writes only while it owns the book**, checked before the read and again
  immediately before the swap, so the window in which Electron could take over is
  one serialisation wide rather than a whole edit.

It stamps `rev` and `updatedAt` the way `renderer/sync.js` does. That is not
politeness: the renderer's sync baseline is an in-memory index seeded from the
store on load, so an unstamped edit would look to the next Electron launch
exactly like the state the book had always been in, and would never reach the
cloud.

Verified on a copy of a real store, and once on the real one with a backup: of 34
collections only `printFiles` changed, of its records only the one named, and of
its fields only `favorite`, `rev` and `updatedAt`. Secrets byte-identical.

### Reading a group

`groupOf` is the one part of `organise.js` written twice, because asking a
JSContext for the group of every row to draw a sidebar of four hundred models is
a call per row for an answer that is two field reads. `OrganiseParityTests` holds
the copy to the original, and caught two things I had wrong:

* **The PRESENCE of `folder` decides, not whether it holds anything.** A shop
  clearing the box on an older build leaves `folder: ''`, and that empty string is
  the instruction. Falling back to `group` there brings back the name they just
  deleted.
* **`normalise` does not strip control characters.** A NUL in this field has
  caused trouble elsewhere in Khayt and the instinct is to strip it — but
  JavaScript's `\s` does not match NUL, so neither may this. Whatever the two
  apps do here they must do identically.

A third was in the test rather than the code: it restated the rule instead of
calling it, and so agreed with the mistake. It calls `LibraryFile.groupName` now.

## Words

The app speaks Khayt's own vocabulary. `renderer/locales/en.js` and `ar.js` are
bundled and run in JavaScriptCore alongside the logic modules, so a stage this
app calls "قيد الطباعة" is called that because the Electron app calls it that. An
app that invents its own word for "Owed" has given one shop two vocabularies, and
the person reading the second has to work out that it means the first.

`Words.own` holds the handful of things Khayt has never needed a word for — "On
this Mac", "Opened read-only". They are kept there rather than added to the
shared catalogue because that one is nine languages wide and guarded for
completeness: adding a key there means adding it in nine, and an English value
sitting in `ar.js` is exactly what `test/locale-quality.test.js` exists to catch.
`WordsTests` proves every borrowed key exists in both bundled languages, every
own key carries both, and that neither catalogue shadows the other.

Language comes from `settings.lang`. Not the system: a Riyadh shop on an English
Mac still keeps its book in Arabic, and the book is what this window shows. (The
Electron app keeps the live choice in `localStorage`, which nothing outside it
can read; `settings.lang` is the copy that travels with the store.)
`KHAYT_LANG=ar` forces one run, which is the only way to photograph a language
the shop does not use.

### Right to left

An Arabic shop gets a mirrored window: sidebar on the right, columns reversed,
inspector on the left, traffic lights on the right.

**Not via `.environment(\\.layoutDirection, .rightToLeft)`.** That line sends
SwiftUI's `NavigationSplitView` into an unbounded layout loop on macOS 26 —
`SplitViewChildController.hostingView(_:didUpdateMinSize:maxSize:)` re-invalidates
every pass, the window grows past 3000pt, and AppKit aborts with *"more Update
Constraints in Window passes than there are views in the window"*. It is not the
sidebar's or the inspector's width constraint; removing either changes nothing.

The way that works is the way AppKit has always done it. `Direction.settle()`
sets `NSForceRightToLeftWritingDirection` and `AppleTextDirection` — the two
defaults Apple documents for [testing right-to-left
layout](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/TestingYourInternationalApp/TestingYourInternationalApp.html)
— and the whole application flips. SwiftUI is never asked to mirror anything, so
there is nothing for it to loop over.

**AppKit reads those once, on the way up**, so this has to happen before
`NSApplicationMain`. That is why there is a `main.swift` and why `KhaytApp` is
not `@main`. When the answer differs from last launch the app `execv`s itself
once — guarded by an environment variable so it can never do it twice — which is
also why changing a shop's language takes effect at the next launch rather than
immediately.

Both keys are always written, never only the true one: a shop moving from Arabic
to English would otherwise keep a mirrored window for ever, because the value it
set last time is still in its own defaults. Round-trip verified — ar → en → ar,
mirrored, unmirrored, mirrored, no crash in any direction.

Resolving the language reads the store before AppKit exists: 3ms on a real 958KB
book, bounded by the 50MB cap.

## The one hard constraint

**Only one app may own the store at a time.** Khayt's write serialisation is
per-process: two processes on one `khayt-store.json` race exactly the way two
shop-floor tablets did before #898. Either the Mac app replaces Electron on that
machine, or the second one opens read-only behind a lock.
