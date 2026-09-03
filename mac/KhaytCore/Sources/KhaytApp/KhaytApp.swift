import SwiftUI
import AppKit

@main
struct KhaytApp: App {
    @State private var shop = Shop()
    @NSApplicationDelegateAdaptor(Activator.self) private var activator

    var body: some Scene {
        Window("Khayt", id: "shop") {
            ShopWindow(shop: shop)
                .task { await shop.load(Shop.available.first ?? .sample) }
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

/// SwiftPM builds a bare executable rather than an app bundle, so nothing has
/// told AppKit this is a normal windowed application. Without it the window
/// opens behind everything and never takes the menu bar.
///
/// This goes away when the app moves to an Xcode project with a real bundle,
/// which is also when signing and notarisation start to matter.
final class Activator: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
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
/// One thing it cannot show: `NSVisualEffectView` draws nothing into an offline
/// bitmap, so the sidebar comes out black and empty. That is the photograph, not
/// the app — confirm a sidebar you doubt by running once with
/// `.listStyle(.plain)`, which has no material, rather than by "fixing" it.
///
/// Only runs when KHAYT_SNAPSHOT_DIR is set, so it costs a normal launch
/// nothing and cannot fire by accident.
@MainActor enum Snapshot {
    static func run(into dir: URL) {
        Task { @MainActor in
            // The window has to have laid out and drawn once. Two seconds is
            // generous; capturing an unlaid-out window yields a blank sheet.
            try? await Task.sleep(for: .seconds(2))
            capture(named: "01-shop", into: dir)
            try? await Task.sleep(for: .milliseconds(400))
            NSApp.terminate(nil)
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
