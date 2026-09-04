import SwiftUI
import AppKit

/// Not `@main`: `main.swift` is the entry point, because the writing direction
/// has to be settled before AppKit starts. See `Direction.swift`.
struct KhaytApp: App {
    @State private var shop = Shop()
    @NSApplicationDelegateAdaptor(Activator.self) private var activator

    var body: some Scene {
        Window("Khayt", id: "shop") {
            ShopWindow(shop: shop)
                .task {
                    Snapshot.subject = shop
                    // The shop's own book if there is one, the sample only when
                    // there is not. Reading is safe, the source is named in the
                    // toolbar, and an app that opens on invented data when real
                    // data exists is answering a question nobody asked.
                    await shop.load(Shop.available.first(where: \.isReal) ?? .sample)
                }

        }
        // Wide enough that all six columns are on screen with the inspector
        // open, which is how the window opens. At 1180 the table was given
        // ~650pt against 644pt of column minimums and "Owed" — the figure the
        // toolbar is built around — was squeezed to a few pixels.
        .defaultSize(width: 1320, height: 760)
        // The unified toolbar, sitting in the title bar rather than in a strip
        // below it. It is most of the difference between a Mac window and a web
        // page with a grey bar at the top.
        .windowToolbarStyle(.unified)
                .commands { KhaytCommands(shop: shop) }

        // ⌘, — the shop's own settings, written through the same rule the
        // Electron page saves through. The scene puts "Settings…" in the app
        // menu by itself.
        Settings {
            SettingsWindow(shop: shop)
        }
    }
}

/// A bare SwiftPM executable has no bundle, so nothing has told AppKit this is a
/// normal windowed application: the window opens behind everything and never
/// takes the menu bar.
///
/// `mac/make-app.sh` assembles a real bundle, and inside one none of this is
/// wanted — an app that shoulders its way in front of whatever you were doing,
/// every launch, is an app people learn to resent. So it is asked for only when
/// there is no bundle identifier, which is exactly the `swift run` case.
final class Activator: NSObject, NSApplicationDelegate {
    /// Give the book back on the way out, so the next app to open does not have
    /// to reason about a dead pid to know it is free.
    func applicationWillTerminate(_ note: Notification) {
        MainActor.assumeIsolated { Snapshot.subject?.relinquish() }
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        if Bundle.main.bundleIdentifier == nil {
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
        }
        if let dir = ProcessInfo.processInfo.environment["KHAYT_SNAPSHOT_DIR"] {
            Snapshot.run(into: URL(fileURLWithPath: dir))
        }
    }
}

/// The app photographs its own window.
///
/// SwiftUI's `ImageRenderer` returns a "cannot render" placeholder for anything
/// AppKit-backed — which is `NavigationSplitView`, `Table` and the toolbar, i.e.
/// everything that makes this a Mac app rather than a page. And `screencapture`
/// needs a screen-recording grant. A window can always draw itself into a
/// bitmap, so that is the route.
///
/// Two things it cannot show, both the photograph rather than the app:
///
/// * `NSVisualEffectView` draws nothing into an offline bitmap, so the sidebar
///   comes out black and empty. Confirm a sidebar you doubt by running once with
///   `.listStyle(.plain)`, which has no material, rather than by "fixing" it.
/// `capturePanes` photographs each scrolling pane on its own, for when the window
/// shot leaves a doubt. It has the opposite blind spot — it loses what a pane
/// draws into its own layer, so thumbnails go missing there — which is why both
/// exist.
///
/// A correction, since the wrong version was written down for a day: the library
/// inspector once photographed as a solid black column, and this file blamed
/// having two `NSScrollView`s on screen at once. It was not the capture. The
/// inspector was attached inside `detail`, the detail content was laid out
/// against a width that did not subtract the sidebar, and the inspector had
/// nowhere to draw. Moving `.inspector` onto the `NavigationSplitView` fixed the
/// picture and the app together. A capture limitation is a comfortable thing to
/// blame; check the layout first.
///
/// Only runs when KHAYT_SNAPSHOT_DIR is set, so it costs a normal launch
/// nothing and cannot fire by accident.
@MainActor enum Snapshot {
    /// The window's shop, so the run can move between shelves. Set once, on
    /// launch; nil in a normal run because nothing else asks for it.
    static weak var subject: Shop?

    static func run(into dir: URL) {
        Task { @MainActor in
            // The window has to have laid out and drawn once. Two seconds is
            // generous; capturing an unlaid-out window yields a blank sheet.
            try? await Task.sleep(for: .seconds(2))
            // Says whether this run holds the book. Ownership is the gate on
            // every write, and a gate nobody checked is a gate that is open.
            FileHandle.standardError.write(Data(
                "ownership: \(shopOwnership())\n".utf8))
            // Whether the shop's book got today's backup. A shop running only
            // this app has no other, so "did it actually write one" is worth
            // seeing in every run rather than trusted.
            if let shop = subject {
                let line = "backup: " + (shop.lastBackup ?? "none")
                    + (shop.backupProblem.map { " — \($0)" } ?? "") + "\n"
                FileHandle.standardError.write(Data(line.utf8))
            }
            capture(named: "00-dashboard", into: dir)

            guard let shop = subject else { NSApp.terminate(nil); return }
            // The sample too: a shop whose jobs are auto-logged from printer
            // history has no prices, and a dashboard of zeros shows nothing
            // about the design.
            await shop.load(.sample)
            await settle()
            // The menu bar as AppKit actually built it. A Commands block that
            // compiles proves nothing about what a person can reach.
            //
            // AFTER a book is open, not before. The stages are named from the
            // shop's own catalogue, which is loaded with the book — dumped at
            // launch every one of them read "queue.quote", which is what a
            // missing translation looks like and was only an early photograph.
            FileHandle.standardError.write(Data("menus: \(menuTree())\n".utf8))
            capture(named: "00b-dashboard-sample", into: dir)
            await shop.load(Shop.available.first(where: \.isReal) ?? .sample)
            await settle()
            shop.shelf = .jobs(nil)
            await settle()
            capture(named: "01-jobs", into: dir)

            // An unsettled job for preference — the money lines are the point
            // of this panel — but ANY job rather than none. A store whose jobs
            // are all settled photographed an empty detail pane, which looks
            // like an inspector that does not work.
            shop.selection = (shop.shown.first { !$0.isSettled } ?? shop.shown.first)?.id
            await settle()
            capture(named: "02-job-selected", into: dir)
            // The panes as well: the job inspector is where the money lines and
            // the payment button live, and a window shot that simply does not
            // contain it cannot tell you whether it is closed or broken.
            capturePanes(named: "02-job-selected", into: dir)

            shop.shelf = .library(nil)
            await settle()
            capture(named: "03-library", into: dir)

            shop.fileSelection = Set(shop.shownFiles.prefix(1).map(\.id))
            await settle()
            capture(named: "04-model-selected", into: dir)
            // The Model menu should now be live: library shelf, one model
            // selected, and the book is ours to change. Dumped a SECOND time
            // for exactly that reason: a menu built at launch and never rebuilt
            // is indistinguishable from a correct one until something it reads
            // changes, and the titles here depend on a selection made after the
            // first dump.
            FileHandle.standardError.write(Data("menus (after selection): \(menuTree())\n".utf8))
            capturePanes(named: "04-model-selected", into: dir)

            // Several selected: the shape a shop is in when it files the
            // Kings as one collection.
            shop.fileSelection = Set(shop.shownFiles.prefix(4).map(\.id))
            await settle()
            capture(named: "04b-many-selected", into: dir)
            shop.fileSelection = Set(shop.shownFiles.prefix(1).map(\.id))

            if let group = shop.groups.first {
                shop.shelf = .library(group)
                shop.fileSelection = []
                await settle()
                capture(named: "05-group", into: dir)
            }

            // The sample for the last two. A shop whose jobs are auto-logged
            // from printer history has no customers and no prices — true, and
            // no use at all for looking at a design.
            await shop.load(.sample)
            shop.shelf = .board
            await settle()
            capture(named: "09-board", into: dir)

            // The sheets. Each is its own window and the window shot cannot see
            // them, so they are photographed on their own — six were built
            // before there was a picture of any.
            shop.shelf = .jobs(nil)
            await settle()
            if let job = shop.orders.first {
                let subject = Shop.PendingHold(id: job.id, project: job.project)
                for (name, open) in [
                    ("10-hold", { shop.pendingHold = subject }),
                    ("11-payment", { shop.pendingPayment = subject }),
                    ("12-edit-job", { shop.pendingEdit = subject }),
                    ("13-qc-fail", { shop.pendingQcFail = subject }),
                ] as [(String, () -> Void)] {
                    open()
                    await settle()
                    captureSheet(named: name, into: dir)
                    shop.clearQuestion()
                    await settle()
                }
            }
            shop.takingAJob = true
            await settle()
            captureSheet(named: "14-new-job", into: dir)
            shop.takingAJob = false
            await settle()

            shop.editingCustomer = Shop.newCustomer()
            await settle()
            captureSheet(named: "15-new-customer", into: dir)
            shop.editingCustomer = nil
            await settle()

            // The document itself. It is built by the runtime and drawn by
            // WebKit AFTER the sheet appears, so it gets longer than a settle:
            // photographed too early this is a spinner, which is exactly what
            // a broken invoice would also look like.
            if let job = shop.orders.first(where: { !$0.parts.isEmpty }) ?? shop.orders.first {
                shop.showInvoice(job.id)
                // Straight away, before the runtime has built anything: this is
                // the sheet's own chrome with no web view under it, and it is
                // the only shot in which that chrome is visible. `cacheDisplay`
                // does not draw SwiftUI's layers once a WKWebView is in the
                // hierarchy — the document comes through and the title and the
                // buttons around it do not. Two pictures, because one of them
                // would otherwise look like a header that never drew.
                await settle()
                captureSheet(named: "16-invoice-building", into: dir)
                try? await Task.sleep(for: .seconds(2))
                captureSheet(named: "16-invoice", into: dir)
                shop.clearQuestion()
                await settle()
            }

            // The Settings window: opened the way ⌘, opens it, one picture per
            // pane. It is its own window, so it is found by not being the shop's.
            let main = NSApp.windows.first { $0.isVisible && $0.contentView != nil }
            // Through the menu item ⌘, is bound to, whatever selector SwiftUI
            // gave it this release — sending `showSettingsWindow:` by name
            // opened nothing.
            if let item = NSApp.mainMenu?.items.first?.submenu?.items.first(where: { $0.keyEquivalent == "," }) {
                NSApp.sendAction(item.action ?? #selector(NSApplication.terminate(_:)), to: item.target, from: item)
            }
            await settle()
            try? await Task.sleep(for: .seconds(1))
            if let settings = NSApp.windows.first(where: { $0.isVisible && $0 !== main && $0.contentView != nil }) {
                for pane in SettingsPane.allCases {
                    shop.settingsPane = pane
                    await settle()
                    capture(named: "17-settings-\(pane.rawValue)", window: settings, into: dir)
                }
                settings.close()
                await settle()
            } else {
                FileHandle.standardError.write(Data("no settings window to capture\n".utf8))
            }

            // What the shop spent and what it wasted. The sample, because this
            // Mac's own book has neither and an empty table is a picture of
            // nothing — and because the sample is what most people will open
            // these two screens in first.
            shop.period = .all
            shop.shelf = .expenses
            await settle()
            capture(named: "18-expenses", into: dir)
            shop.shelf = .waste
            await settle()
            capture(named: "19-waste", into: dir)
            shop.shelf = .reports
            await settle()
            // The P&L is computed by the runtime after the screen appears, so
            // it gets longer than a settle — photographed too early it is the
            // "no data yet" placeholder, which is what a broken one looks like.
            try? await Task.sleep(for: .seconds(1))
            capture(named: "20-reports", into: dir)
            // The other half of the screen: what the shop is still owed.
            shop.reportPage = .owing
            await settle()
            try? await Task.sleep(for: .milliseconds(600))
            capture(named: "20b-owing", into: dir)
            shop.reportPage = .profit
            await settle()

            shop.shelf = .machines
            await settle()
            capture(named: "07-machines", into: dir)
            if let machine = shop.machines.first {
                shop.editingMachine = machine
                await settle()
                try? await Task.sleep(for: .milliseconds(600))
                captureSheet(named: "22-machine", into: dir)
                shop.editingMachine = nil
                await settle()
            }
            shop.shelf = .inventory
            await settle()
            capture(named: "08-inventory", into: dir)
            // Correcting a spool, which is what a shelf screen is for.
            if let spool = shop.spools.first {
                shop.editingSpool = spool
                await settle()
                captureSheet(named: "21-spool", into: dir)
                shop.editingSpool = nil
                await settle()
            }

            shop.shelf = .customers
            shop.customerSelection = shop.shownCustomers.max { $0.owed < $1.owed }?.id
            await settle()
            capture(named: "06-customers", into: dir)
            capturePanes(named: "06-customers", into: dir)

            try? await Task.sleep(for: .milliseconds(300))
            NSApp.terminate(nil)
        }
    }

    /// The menu bar as AppKit built it: what is there, and what key reaches it.
    ///
    /// DELIBERATELY DOES NOT REPORT ENABLED STATE. It used to, and it cost two
    /// afternoons: AppKit validates items against the responder chain when a
    /// menu is about to open, and a snapshot run never establishes one — so
    /// every item reads as disabled, including Cut, Copy and Paste. That looks
    /// exactly like a broken focused value and is nothing of the kind.
    ///
    /// What IS trustworthy here is structure. The Book menu's picker is built
    /// inside an `if let shop`, so its presence says the shop reached the menu;
    /// its absence says it did not.
    /// The menu bar as AppKit actually built it.
    ///
    /// `update()` FIRST, on every submenu. SwiftUI does not rewrite an
    /// NSMenuItem's title the moment the value behind it changes — AppKit asks
    /// the menu to refresh itself when it is about to be shown, and a headless
    /// run never shows one. Reading the titles without asking gives whatever
    /// they were when the menu was first built, which reads exactly like a
    /// broken menu: every stage named "queue.quote", every title stuck on its
    /// placeholder. Both were photographs of a menu nobody had opened.
    private static func menuTree() -> String {
        guard let main = NSApp.mainMenu else { return "none" }
        for top in main.items { top.submenu?.update() }
        return main.items.compactMap { top -> String? in
            guard let sub = top.submenu else { return top.title }
            let items = sub.items.filter { !$0.isSeparatorItem }.map { item -> String in
                item.title + (item.keyEquivalent.isEmpty ? "" : "[\(shortcut(item))]")
            }
            return "\(top.title){\(items.joined(separator: ", "))}"
        }.joined(separator: " | ")
    }

    private static func shortcut(_ item: NSMenuItem) -> String {
        var out = ""
        if item.keyEquivalentModifierMask.contains(.command) { out += "⌘" }
        if item.keyEquivalentModifierMask.contains(.shift) { out += "⇧" }
        if item.keyEquivalentModifierMask.contains(.option) { out += "⌥" }
        return out + item.keyEquivalent.uppercased()
    }

    private static func shopOwnership() -> String {
        guard let shop = subject else { return "no shop" }
        guard shop.source.isReal else { return "sample — nothing to own" }
        return shop.canWrite ? "held, this app may write"
                             : "not held — \(shop.owner ?? "unknown holder")"
    }

    /// Let SwiftUI apply the change and AppKit redraw before photographing it.
    /// Without this the picture is of the previous state, which is worse than
    /// no picture: it looks like the change did nothing.
    private static func settle() async {
        try? await Task.sleep(for: .milliseconds(700))
    }

    /// Photograph each scrolling pane on its own.
    ///
    /// The whole-window shot loses a pane sometimes — two `NSScrollView`s on
    /// screen at once and only one comes back. Capturing them individually says
    /// whether the pane is empty or merely unphotographed, which is the
    /// difference between a bug and a picture of one.
    static func capturePanes(named name: String, into dir: URL) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil }),
              let root = window.contentView else { return }
        var found: [NSScrollView] = []
        func walk(_ v: NSView) {
            if let scroll = v as? NSScrollView { found.append(scroll) }
            v.subviews.forEach(walk)
        }
        walk(root)
        for (i, scroll) in found.enumerated() {
            let target = scroll.documentView ?? scroll
            let bounds = target.bounds
            guard bounds.width > 1, bounds.height > 1,
                  let rep = target.bitmapImageRepForCachingDisplay(in: bounds) else { continue }
            target.cacheDisplay(in: bounds, to: rep)
            guard let png = rep.representation(using: .png, properties: [:]) else { continue }
            try? png.write(to: dir.appending(path: "\(name)-pane\(i).png"))
            FileHandle.standardError.write(Data(
                "  pane\(i): \(type(of: target)) \(Int(bounds.width))x\(Int(bounds.height))\n".utf8))
        }
    }

    /// Photograph a sheet, which `capture` cannot see.
    ///
    /// A sheet is its OWN window, attached to the main one — so the window shot
    /// finds the main window first and photographs the screen behind the sheet.
    /// Six sheets were built before anybody noticed there was no picture of any
    /// of them.
    ///
    /// `attachedSheet` is the honest way to find it: it is the sheet AppKit is
    /// actually showing, rather than whichever window happens to be frontmost.
    static func captureSheet(named name: String, into dir: URL) {
        guard let host = NSApp.windows.first(where: { $0.isVisible && $0.attachedSheet != nil }),
              let sheet = host.attachedSheet,
              let view = sheet.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            FileHandle.standardError.write(Data("no sheet to capture for \(name)\n".utf8))
            return
        }
        // `cacheDisplay` asks each view to draw itself, and SwiftUI does not
        // draw itself — so every sheet here comes back with its AppKit-backed
        // controls (fields, pickers, the default button) present and its
        // SwiftUI labels, headings and explanations MISSING. Rendering the
        // layer tree instead was tried and gets the same text back: nothing,
        // upside down. Capturing the words needs either a screen-recording
        // grant this process does not have or `ImageRenderer`, which cannot
        // host a WKWebView — so the shots below show a sheet's LAYOUT, and
        // `SnapshotTests` renders the same views through `ImageRenderer` to
        // show its words.
        view.cacheDisplay(in: view.bounds, to: rep)
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: dir.appending(path: name + ".png"))
        FileHandle.standardError.write(Data(
            "wrote \(name).png (\(Int(view.bounds.width))x\(Int(view.bounds.height))) [sheet]\n".utf8))
    }

    static func capture(named name: String, into dir: URL) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil }) else {
            FileHandle.standardError.write(Data("no window to capture\n".utf8))
            return
        }
        capture(named: name, window: window, into: dir)
    }

    /// Photograph one particular window — the Settings window, which is not
    /// the first visible one.
    static func capture(named name: String, window: NSWindow, into dir: URL) {
        guard // The theme frame, not the content view. A unified toolbar sits
              // in the title bar, which is a sibling of the content rather than
              // inside it, so photographing the content alone drops the source
              // menu, the owed figure and the inspector toggle.
              let view = window.contentView?.superview ?? window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            FileHandle.standardError.write(Data("no window to capture\n".utf8))
            return
        }
        view.cacheDisplay(in: view.bounds, to: rep)
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: dir.appending(path: name + ".png"))

        FileHandle.standardError.write(Data("wrote \(name).png (\(Int(view.bounds.width))x\(Int(view.bounds.height)))\n".utf8))
    }
}
