import SwiftUI

struct ShopWindow: View {
    @Bindable var shop: Shop
    // Both restored on relaunch. Reopening an app onto a different screen from
    // the one you left is a small thing that makes it feel like a web page.
    @SceneStorage("inspector.showing") private var showInspector = true
    @SceneStorage("shelf") private var storedShelf = ""
    @SceneStorage("library.sort") private var storedSort = LibrarySort.khayt.rawValue
    /// Nil where a context has no undo, which the documentation says to expect
    /// and which every registration in `Shop` is guarded for.
    @Environment(\.undoManager) private var undoManager


    var body: some View {
        NavigationSplitView {
            Sidebar(shop: shop)
                .navigationSplitViewColumnWidth(min: 190, ideal: 215, max: 280)
        } detail: {
            VStack(spacing: 0) {
                // What the last move said, above whatever screen you are on.
                //
                // It used to live inside the board, which is where a drag
                // starts — but ⇧⌘H and the Job menu move a job from the table
                // too, and there a refusal appeared nowhere at all. A move that
                // did not happen and said nothing is the worst of the three
                // possible outcomes.
                MoveBanners(shop: shop)
                SpendBanner(shop: shop)

                if shop.showingDashboard {
                    Dashboard(shop: shop)
                } else if shop.showingLibrary {
                    LibraryGrid(shop: shop)
                } else if shop.showingBoard {
                    Kanban(shop: shop)
                } else if shop.showingMachines {
                    Machines(shop: shop)
                } else if shop.showingInventory {
                    Inventory(shop: shop)
                } else if shop.showingExpenses {
                    Expenses(shop: shop)
                } else if shop.showingWaste {
                    Waste(shop: shop)
                } else if shop.showingReports {
                    Reports(shop: shop)
                } else if shop.showingCustomers {
                    CustomersTable(shop: shop)
                } else {
                    OrdersTable(shop: shop)
                }
            }
        }
        // On the split view, not inside `detail`. Inside it, the detail content
        // is laid out against the window minus the inspector — the sidebar's
        // width is not taken off — so a Table stretches its columns across a
        // width it does not have and the right-hand ones are clipped away
        // rather than compressed. The Owed column disappeared twice that way.
        // Closed on the dashboard, not filled with a placeholder: that screen is
        // already a summary, and a panel beside it has nothing to say. The
        // binding is read-only there so the toolbar button cannot open an empty
        // one either.
        .inspector(isPresented: Binding(
            get: { showInspector && !shop.showingDashboard && !shop.showingBoard
                   && !shop.showingMachines && !shop.showingInventory
                   && !shop.showingExpenses && !shop.showingWaste && !shop.showingReports },
            set: { showInspector = $0 }
        )) {
            Group {
                if shop.showingMachines || shop.showingInventory || shop.showingBoard
                    || shop.showingExpenses || shop.showingWaste || shop.showingReports {
                    // Both screens carry their own detail — a card and a table
                    // wide enough to read. A panel beside them would repeat.
                    EmptyView()
                } else if shop.showingLibrary {
                    LibraryInspector(shop: shop)
                } else if shop.showingCustomers {
                    CustomerInspector(shop: shop)
                } else {
                    OrderInspector(shop: shop)
                }
            }
            .inspectorColumnWidth(min: 260, ideal: 310, max: 420)
        }
        .searchable(text: $shop.search, placement: .toolbar,
                    prompt: searchPrompt)
        // On the window rather than the board, because ⇧⌘H and the Job menu
        // reach a job from the table too, and the sheet has to be somewhere all
        // of them can raise it.
        .sheet(item: $shop.pendingHold) { AskFirst(shop: shop, subject: $0, kind: .hold) }
        .sheet(item: $shop.pendingQC) { AskFirst(shop: shop, subject: $0, kind: .qcPass) }
        .sheet(item: $shop.pendingPayment) { PaymentSheet(shop: shop, subject: $0) }
        .sheet(item: $shop.pendingEdit) { EditJobSheet(shop: shop, subject: $0) }
        .sheet(item: $shop.pendingQcFail) { QcFailSheet(shop: shop, subject: $0) }
        .sheet(isPresented: $shop.takingAJob) { NewJobSheet(shop: shop) }
        .sheet(item: $shop.editingCustomer) { CustomerSheet(shop: shop, existing: $0) }
        .sheet(item: $shop.pendingInvoice) { InvoiceSheet(shop: shop, subject: $0) }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                // Which book is open, always visible. Mistaking the sample for
                // the shop's real position is the one error this app must not
                // allow, so it is stated rather than implied.
                Menu {
                    ForEach(Shop.available) { source in
                        Button {
                            Task { await shop.load(source) }
                        } label: {
                            Label(source.title, systemImage: source.symbol)
                        }
                    }
                } label: {
                    Label(shop.source.title, systemImage: shop.source.symbol)
                }
            }
            ToolbarItem(placement: .principal) {
                if shop.showingLibrary { GroupMenu(shop: shop) } else { OwedSummary(shop: shop) }
            }
            ToolbarItem {
                Button {
                    showInspector.toggle()
                } label: {
                    Label("Details", systemImage: "sidebar.trailing")
                }
                .help("Show or hide the details")
                // The label above is the button's title; VoiceOver reads this.
                // "Don't include text that repeats information users already
                // have" — it is already a button, so this does not say so.
                .accessibilityLabel(showInspector ? "Hide details" : "Show details")
            }
        }
        // No `.environment(\.layoutDirection, …)` here on purpose: that line
        // loops SwiftUI's split view until AppKit aborts. The window is mirrored
        // before it exists instead — see `Direction`.
        // Handed over rather than reached for: `Shop` is not a view and has no
        // environment of its own. Re-run when it changes, because SwiftUI may
        // hand out a different manager than the one at first launch.
        .task(id: ObjectIdentifier(undoManager ?? UndoManager())) { shop.undoManager = undoManager }
        .task(id: shop.shelf) { storedShelf = Shelves.name(shop.shelf) }
        .task(id: shop.librarySort) { storedSort = shop.librarySort.rawValue }
        .task { shop.librarySort = LibrarySort(rawValue: storedSort) ?? .khayt }
        .task {
            // Only after the book has loaded: a group shelf means nothing until
            // the groups are known, and restoring one that no longer exists
            // would open on an empty screen with no way to tell why.
            if let restored = Shelves.shelf(storedShelf, in: shop) { shop.shelf = restored }
        }
        .navigationTitle(shop.shopName)
        .navigationSubtitle(subtitle)
    }

    /// Says which book is open before it says anything else. The sample must
    /// never be mistaken for the shop's real position.
    private var subtitle: String {
        // Says what this session can actually do. It said "read-only" for a
        // while after the app could write, which is the kind of stale label
        // people stop trusting the rest of the window over.
        let provenance = shop.source.isReal
            ? shop.words.callIt(shop.canWrite ? "mac.yours" : "mac.read_only")
            : shop.words.callIt("mac.not_real_shop")
        if shop.showingLibrary {
            let n = shop.shownFiles.count
            return "\(n) \(shop.words.callIt("mac.models_count")) · \(provenance)"
        }
        if shop.showingCustomers {
            let n = shop.shownCustomers.count
            return "\(n) \(shop.words.callIt("mac.customers_count")) · \(provenance)"
        }
        if shop.showingDashboard || shop.showingBoard { return provenance }
        if shop.showingMachines {
            return "\(shop.machines.count) \(shop.words.callIt("mac.machines")) · \(provenance)"
        }
        if shop.showingInventory {
            return "\(shop.spools.count) \(shop.words.callIt("mac.inventory")) · \(provenance)"
        }
        return provenance
    }

    private var searchPrompt: String {
        if shop.showingLibrary { return shop.words.callIt("mac.search_models") }
        if shop.showingCustomers { return shop.words.callIt("mac.search_people") }
        if shop.showingExpenses { return shop.words.callIt("mac.search_expenses") }
        if shop.showingWaste { return shop.words.callIt("mac.search_waste") }
        return shop.words.callIt("mac.search_jobs")
    }
}

/// What the shop is owed, in the title bar.
///
/// The number an owner opens the app to find. It is not a card halfway down a
/// dashboard here — it is on screen whatever else you are looking at, because
/// it is the only figure that is true of the whole book at once.
private struct OwedSummary: View {
    let shop: Shop

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .trailing, spacing: 0) {
                Text(shop.words.callIt("mac.owed_caps"))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .textCase(.uppercase)
                    .tracking(0.6)
                Text(Money.text(shop.owed, shop.currency))
                    .font(.system(size: 13, weight: .medium))
                    .monospacedDigit()
            }
            if shop.overdueCount > 0 {
                Label("\(shop.overdueCount) \(shop.words.callIt("mac.late"))",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.orange)
                    .labelStyle(.titleAndIcon)
                    .help("\(shop.overdueCount) unpaid jobs are past their due date")
            }
        }
        .padding(.horizontal, 4)
    }
}


/// Which shelf was open, as something that survives a relaunch.
///
/// A string rather than the enum: `SceneStorage` takes only simple values, and a
/// shelf that names a group has to be checked against the book before it is
/// restored — the group may have been renamed or emptied since.
@MainActor enum Shelves {
    static func name(_ shelf: Shop.Shelf) -> String {
        switch shelf {
        case .jobs(nil): "jobs"
        case .jobs(let stage?): "jobs:\(stage.rawValue)"
        case .customers: "customers"
        case .dashboard: "dashboard"
        case .machines: "machines"
        case .inventory: "inventory"
        case .board: "board"
        case .expenses: "expenses"
        case .waste: "waste"
        case .reports: "reports"
        case .library(nil): "library"
        case .library(let group?): "library:\(group)"
        }
    }

    static func shelf(_ name: String, in shop: Shop) -> Shop.Shelf? {
        guard !name.isEmpty else { return nil }
        let parts = name.split(separator: ":", maxSplits: 1).map(String.init)
        switch parts.first {
        case "jobs":
            guard parts.count == 2 else { return .jobs(nil) }
            return Stage(rawValue: parts[1]).map(Shop.Shelf.jobs)
        case "customers":
            return .customers
        case "dashboard":
            return .dashboard
        case "machines":
            return .machines
        case "inventory":
            return .inventory
        case "board":
            return .board
        case "expenses":
            return .expenses
        case "waste":
            return .waste
        case "reports":
            return .reports
        case "library":
            guard parts.count == 2 else { return .library(nil) }
            // Only if it is still a group this shop has.
            return shop.groups.contains(parts[1]) ? .library(parts[1]) : .library(nil)
        default:
            return nil
        }
    }
}
