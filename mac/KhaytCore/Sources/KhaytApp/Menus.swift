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
        CommandGroup(after: .sidebar) { SortMenu().environment(shop) }

        // `Words.upfront`, not `shop.words`: these titles are built with the
        // scene, before a book is open, and a menu title is never rewritten
        // afterwards. The catalogue is already warm — see `Words.preload`.
        CommandMenu(Text(Words.upfront("mac.menu_book"))) { BookMenu().environment(shop) }
        CommandMenu(Text(Words.upfront("mac.menu_go"))) { GoMenu().environment(shop) }
        CommandMenu(Text(Words.upfront("mac.menu_job"))) { JobMenu().environment(shop) }
        CommandMenu(Text(Words.upfront("mac.menu_model"))) { ModelMenu().environment(shop) }
    }
}

/// Each menu's items, as a View so the focused value arrives and the enabled
/// state keeps up. See the note on `KhaytCommands`.
private struct BookMenu: View {
    @Environment(Shop.self) private var shop

    var body: some View {
        Button(Words.upfront("mac.reload")) { shop.reload() }
            .keyboardShortcut("r")
            
        Divider()
        Picker(Words.upfront("mac.open_book"), selection: Binding(get: { shop.source }, set: { shop.open($0) })) {
            ForEach(Shop.available) { Text($0.title).tag($0) }
        }
    }
}

private struct GoMenu: View {
    @Environment(Shop.self) private var shop

    var body: some View {
        Button(Words.upfront("mac.dashboard")) { shop.shelf = .dashboard }
            .keyboardShortcut("1", modifiers: .command)
        Button(Words.upfront("mac.all_jobs")) { shop.shelf = .jobs(nil) }
            .keyboardShortcut("2", modifiers: .command)
            
        Button(Words.upfront("mac.board")) { shop.shelf = .board }
            .keyboardShortcut("7", modifiers: .command)
        Button(Words.upfront("mac.customers")) { shop.shelf = .customers }
            .keyboardShortcut("3", modifiers: .command)
            
        Button(Words.upfront("mac.library")) { shop.shelf = .library(nil) }
            .keyboardShortcut("4", modifiers: .command)
        Button(Words.upfront("mac.machines")) { shop.shelf = .machines }
            .keyboardShortcut("5", modifiers: .command)
        Button(Words.upfront("mac.inventory")) { shop.shelf = .inventory }
            .keyboardShortcut("6", modifiers: .command)
            
    }
}

private struct SortMenu: View {
    @Environment(Shop.self) private var shop

    var body: some View {
        @Bindable var shop = shop
        // A Picker rather than five buttons, so the current order carries a
        // tick and the menu says what is true as well as what is possible.
        Picker(Words.upfront("mac.sort_by"), selection: $shop.librarySort) {
            ForEach(LibrarySort.allCases) { sort in
                Text(Words.upfront(sort.key)).tag(sort)
            }
        }
        .disabled(!shop.showingLibrary)
    }
}

/// Moving the job that is selected, from wherever it is selected.
///
/// The board can drag; a table cannot, and the table is where somebody reads
/// one job and decides it is done. Without this, "mark this finished" meant
/// switching to the board, finding the card again and dragging it — for a
/// decision that was already made on the screen they were looking at.
///
/// EVERY STAGE IS OFFERED, and a move the rules refuse is refused with a
/// reason rather than greyed out. AppKit validates a menu against a responder
/// chain, and asking `gate()` per item on every menu draw would run the WIP
/// arithmetic seven times for a menu nobody opened. The refusal already says
/// exactly why — a disabled item says nothing at all.
private struct JobMenu: View {
    @Environment(Shop.self) private var shop

    /// The stages a job can be moved to from a menu. `on_hold` is not among
    /// them because it asks a question first and has its own item below.
    private static let destinations: [Stage] =
        [.quote, .pending, .printing, .post, .qc, .completed, .delivered]

    private var job: Order? { shop.selection.flatMap { id in shop.orders.first { $0.id == id } } }
    private var canMove: Bool { shop.canMoveJobs && job != nil }

    var body: some View {
        ForEach(Self.destinations) { stage in
            Button(Words.upfront(stage.key)) {
                guard let id = shop.selection else { return }
                // The same two questions the board asks. A move made from a
                // menu must leave the same record as a move made by dragging,
                // or which screen it was started from changes what is written
                // down.
                if let ask = shop.questionFor(id, moving: stage) { ask(); return }
                Task { await shop.moveJob(id, to: stage) }
            }
            // ⌘1…⌘7 belong to Go, and a rival wins nothing. The stages are
            // reached by name, which is also how they are read on the board.
            .disabled(!canMove || Stage.of(job!) == stage)
        }
        Divider()
        Button(Words.upfront("pay.modal_title")) {
            guard let one = job else { return }
            shop.pendingPayment = Shop.PendingHold(id: one.id, project: one.project)
        }
        .keyboardShortcut("p", modifiers: [.command, .shift])
        .disabled(!canMove)
        Button(Words.upfront("ord.hold_btn")) {
            guard let one = job else { return }
            shop.pendingHold = Shop.PendingHold(id: one.id, project: one.project)
        }
        .keyboardShortcut("h", modifiers: [.command, .shift])
        .disabled(!canMove || job?.status == "on_hold")
    }
}

private struct ModelMenu: View {
    @Environment(Shop.self) private var shop

    /// A model is selected, the library is showing, and the book is ours.
    private var canEdit: Bool { shop.showingLibrary && shop.canEditSelection }
    /// …and its file is on this Mac.
    private var canReach: Bool { shop.showingLibrary && shop.selectionIsOnThisMac }

    var body: some View {
        // "Favourite", not "Add to Favourites" / "Remove from Favourites".
        //
        // It used to be the second, computed from the selection, and it never
        // once said either: a SwiftUI menu item's TITLE is baked when the menu
        // bar is built and is never rewritten — not on a change, not on
        // `NSMenu.update()`, not with the items in their own View or the model
        // injected through the environment. Every one of those was tried. So the
        // dynamic title read "Favourite" — its own no-selection fallback —
        // for every model, in every state, since the menu was added.
        //
        // The item toggles, and now it says so. Enablement is evaluated when the
        // menu is shown and does keep up; only the words are frozen.
        Button(Words.upfront("mac.favourite")) { shop.toggleFavouriteOnSelection() }
            .keyboardShortcut("d")
            .disabled(!canEdit)
        Divider()
        Button(Words.upfront("mac.reveal_in_finder")) { shop.revealSelection() }
            .keyboardShortcut("r", modifiers: [.command, .shift])
            .disabled(!canReach)
        Button(Words.upfront("mac.open")) { shop.openSelection() }
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
