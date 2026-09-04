import SwiftUI

/// The menu bar.
///
/// Everything this app can do is here, with a key for it. A menu you have to
/// know is there is a feature for the person who wrote it — and on a Mac the
/// menu bar is the one surface where a person can go looking for what an app
/// does without having to guess which thing is right-clickable.
///
/// ── THE ITEMS ARE VIEWS, AND THE SHOP IS HANDED TO THEM ─────────────────────
///
/// Two problems, and the fix for the second is what fixes the first.
///
/// A `Commands` body does not re-run when an `@Observable` it read changes, so
/// items built straight into `Commands` freeze in whatever enabled state they
/// had at launch. The developer forums' answer is to put the items in a `View`,
/// and that is right: a View body does re-run.
///
/// `focusedSceneValue` / `@FocusedValue` is the documented way to tell those
/// views WHICH shop to act on, and it delivers nil here. Tried under `Window`
/// and under `WindowGroup`, declared with `@Entry` and with an explicit
/// `FocusedValueKey`, read from a `Commands` type and from a `View`. Nil every
/// time — visible structurally, because the Book menu's picker is inside an
/// `if let shop` and simply is not built.
///
/// So the shop is handed down. This app has one window and one book; the
/// indirection would start paying for itself at the second window, and can be
/// put back then.
struct KhaytCommands: Commands {
    let shop: Shop

    var body: some Commands {
        // Nothing here makes documents, so the File menu's "New" is a lie.
        CommandGroup(replacing: .newItem) { }

        CommandGroup(replacing: .appInfo) {
            Button("About Khayt") { About.show() }
        }

        // Into the View menu AppKit already puts there, beside Show Sidebar,
        // rather than a menu of our own: a shop looking for how a list is
        // ordered looks under View.
        CommandGroup(after: .sidebar) { SortMenu(shop: shop) }

        CommandMenu("Book") { BookMenu(shop: shop) }
        CommandMenu("Go") { GoMenu(shop: shop) }
        CommandMenu("Model") { ModelMenu(shop: shop) }
    }
}

/// Each menu's items, as a View so the focused value arrives and the enabled
/// state keeps up. See the note on `KhaytCommands`.
private struct BookMenu: View {
    @Bindable var shop: Shop

    var body: some View {
        Button("Reload from Disk") { shop.reload() }
            .keyboardShortcut("r")
            
        Divider()
        Picker("Open", selection: Binding(get: { shop.source }, set: { shop.open($0) })) {
            ForEach(Shop.available) { Text($0.title).tag($0) }
        }
    }
}

private struct GoMenu: View {
    @Bindable var shop: Shop

    var body: some View {
        Button(shop.words.callIt("mac.dashboard")) { shop.shelf = .dashboard }
            .keyboardShortcut("1", modifiers: .command)
        Button("Jobs") { shop.shelf = .jobs(nil) }
            .keyboardShortcut("2", modifiers: .command)
            
        Button("Customers") { shop.shelf = .customers }
            .keyboardShortcut("3", modifiers: .command)
            
        Button("Library") { shop.shelf = .library(nil) }
            .keyboardShortcut("4", modifiers: .command)
        Button(shop.words.callIt("mac.machines")) { shop.shelf = .machines }
            .keyboardShortcut("5", modifiers: .command)
        Button(shop.words.callIt("mac.inventory")) { shop.shelf = .inventory }
            .keyboardShortcut("6", modifiers: .command)
            
    }
}

private struct SortMenu: View {
    @Bindable var shop: Shop

    var body: some View {
        // A Picker rather than five buttons, so the current order carries a
        // tick and the menu says what is true as well as what is possible.
        Picker(shop.words.callIt("mac.sort_by"), selection: $shop.librarySort) {
            ForEach(LibrarySort.allCases) { sort in
                Text(shop.words.callIt(sort.key)).tag(sort)
            }
        }
        .disabled(!shop.showingLibrary)
    }
}

private struct ModelMenu: View {
    @Bindable var shop: Shop

    /// A model is selected, the library is showing, and the book is ours.
    private var canEdit: Bool { shop.showingLibrary && shop.canEditSelection }
    /// …and its file is on this Mac.
    private var canReach: Bool { shop.showingLibrary && shop.selectionIsOnThisMac }

    private var favouriteTitle: String {
        guard let one = shop.selectedFile else { return "Favourite" }
        return one.isFavourite ? "Remove from Favourites" : "Add to Favourites"
    }

    var body: some View {
        Button(favouriteTitle) { shop.toggleFavouriteOnSelection() }
            .keyboardShortcut("d")
            .disabled(!canEdit)
        Divider()
        Button("Reveal in Finder") { shop.revealSelection() }
            .keyboardShortcut("r", modifiers: [.command, .shift])
            .disabled(!canReach)
        Button("Open") { shop.openSelection() }
            .keyboardShortcut("o")
            .disabled(!canReach)
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
