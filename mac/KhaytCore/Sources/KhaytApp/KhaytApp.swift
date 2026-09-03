import SwiftUI
import AppKit

@main
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
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .toolbar) {
                // The store is read once, at launch. Anything the Electron app
                // writes after that is invisible here until asked for, and the
                // two are expected to be open together while this is a reader.
                Button("Reload from disk") {
                    Task { await shop.load(shop.source) }
                }
                .keyboardShortcut("r")
                Divider()
                Picker("Book", selection: Binding(
                    get: { shop.source },
                    set: { next in Task { await shop.load(next) } }
                )) {
                    ForEach(Shop.available) { Text($0.title).tag($0) }
                }
            }
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
/// * With two `NSScrollView`s on screen at once only one comes back; the other
///   is black. The library grid and its inspector are exactly that pair, and the
///   inspector looked broken for an afternoon on the strength of it. `capturePanes`
///   photographs each one on its own and settles the question — though it loses
///   what the pane draws into its own layer, so the thumbnails go missing there
///   instead. Between the two pictures everything is visible; in neither is it
///   all visible at once.
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
            capture(named: "01-jobs", into: dir)

            guard let shop = subject else { NSApp.terminate(nil); return }

            shop.selection = shop.shown.first { !$0.isSettled }?.id
            await settle()
            capture(named: "02-job-selected", into: dir)

            shop.shelf = .library(nil)
            await settle()
            capture(named: "03-library", into: dir)

            shop.fileSelection = shop.shownFiles.first?.id
            await settle()
            capture(named: "04-model-selected", into: dir)
            capturePanes(named: "04-model-selected", into: dir)

            if let group = shop.groups.first {
                shop.shelf = .library(group)
                shop.fileSelection = nil
                await settle()
                capture(named: "05-group", into: dir)
            }

            // The sample for the last two. A shop whose jobs are auto-logged
            // from printer history has no customers and no prices — true, and
            // no use at all for looking at a design.
            await shop.load(.sample)
            shop.shelf = .customers
            shop.customerSelection = shop.shownCustomers.max { $0.owed < $1.owed }?.id
            await settle()
            capture(named: "06-customers", into: dir)
            capturePanes(named: "06-customers", into: dir)

            try? await Task.sleep(for: .milliseconds(300))
            NSApp.terminate(nil)
        }
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

    static func capture(named name: String, into dir: URL) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil }),
              // The theme frame, not the content view. A unified toolbar sits
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
