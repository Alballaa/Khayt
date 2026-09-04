import SwiftUI

/// The menu bar.
///
/// Everything this app can do is here, with a key for it. A menu you have to
/// know is there is a feature for the person who wrote it — and on a Mac the
/// menu bar is the one surface where a person can go looking for what an app
/// does without having to guess which thing is right-clickable.
///
/// ── HOW THE SHOP GETS HERE, AND THE TWO ROUTES THAT DO NOT WORK ─────────────
///
/// `focusedSceneValue` is the documented way and is what a multi-window app
/// needs. It delivers nil here — with the window key, main and the app active,
/// and with the value declared both by `@Entry` and by an explicit
/// `FocusedValueKey`. Every item then validates as disabled, which looks exactly
/// like a bug in the menu rather than in the plumbing.
///
/// Handing this struct the `Shop` as a plain `let` delivers it and then never
/// updates: a `Commands` body does not re-run when an `@Observable` it read
/// changes, so items keep whatever enabled state they had when the menu bar was
/// first built.
///
/// So the App reads the flags in ITS body — where observation does track — and
/// passes them in as values. Ugly in that the conditions live one level up from
/// the items they govern; honest in that the menu is right, and provably so:
/// the snapshot run prints the menu bar as AppKit validated it.
struct KhaytCommands: Commands {
    @Bindable var shop: Shop

    /// A model is selected, the library is showing, and the book is ours.
    private var canEditModel: Bool { shop.showingLibrary && shop.canEditSelection }
    /// …and its file is on this Mac.
    private var canReachFile: Bool { shop.showingLibrary && shop.selectionIsOnThisMac }

    var body: some Commands {
        // Nothing here makes documents, so the File menu's "New" is a lie.
        CommandGroup(replacing: .newItem) { }

        CommandGroup(replacing: .appInfo) {
            Button("About Khayt") { About.show() }
        }

        CommandMenu("Book") {
            Button("Reload from Disk") { shop.reload() }
                .keyboardShortcut("r")
                
            Divider()
            Picker("Open", selection: Binding(
                get: { shop.source },
                set: { shop.open($0) }
            )) {
                ForEach(Shop.available) { Text($0.title).tag($0) }
            }
        }

        CommandMenu("Go") {
            // Disabled per item rather than per menu: `Commands` has no
            // `disabled` — Apple's own `focusedSceneValue` example shows one,
            // and it does not exist. A whole greyed menu would be tidier; a
            // menu of greyed items is what the framework actually offers.
            Button("Jobs") { shop.shelf = .jobs(nil) }
                .keyboardShortcut("1", modifiers: .command)
                
            Button("Customers") { shop.shelf = .customers }
                .keyboardShortcut("2", modifiers: .command)
                
            Button("Library") { shop.shelf = .library(nil) }
                .keyboardShortcut("3", modifiers: .command)
                
        }

        CommandGroup(after: .pasteboard) {
            Button("Select All Models") { shop.selectAllShown() }
                .keyboardShortcut("a")
                .disabled(!shop.showingLibrary)
        }

        CommandMenu("Model") {
            // Only ever enabled when it would do something. A greyed item that
            // says why (through its own state) beats a live one that fails.
            Button(favouriteTitle) { shop.toggleFavouriteOnSelection() }
                .keyboardShortcut("d")
                .disabled(!canEditModel)
            Divider()
            Button("Reveal in Finder") { shop.revealSelection() }
                .keyboardShortcut("r", modifiers: [.command, .shift])
                .disabled(!canReachFile)
            Button("Open") { shop.openSelection() }
                .keyboardShortcut("o")
                .disabled(!canReachFile)
        }
    }

    private var favouriteTitle: String {
        guard let one = shop.selectedFile else { return "Favourite" }
        return one.isFavourite ? "Remove from Favourites" : "Add to Favourites"
    }
}

/// The About panel.
///
/// A bare SwiftPM binary has no Info.plist strings to fill Apple's default
/// panel, so it is given the version rather than showing a blank sheet with the
/// executable's name on it.
@MainActor enum About {
    static func show() {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        NSApplication.shared.orderFrontStandardAboutPanel(options: [
            .applicationName: "Khayt",
            .applicationVersion: version ?? "development build",
            .init(rawValue: "Copyright"): "Khayt — the native Mac app",
        ])
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
}
