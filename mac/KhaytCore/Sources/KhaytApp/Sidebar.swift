import SwiftUI

/// A source list: the pipeline, in the order a job moves through it.
///
/// Not alphabetical, and not "whatever statuses the data happens to contain".
/// The order comes from `lib/order-progress.js`, so the sidebar reads down the
/// way work actually flows — quotes at the top, delivered at the bottom.
struct Sidebar: View {
    @Bindable var shop: Shop

    var body: some View {
        List(selection: $shop.shelf) {
            Section {
                // First, and above the pipeline: it is the screen a shop opens
                // the app to look at.
                Row(title: shop.words.callIt("mac.dashboard"), symbol: "square.grid.2x2.fill",
                    count: shop.attention?.count ?? 0, selected: shop.shelf == .dashboard)
                    .tag(Shop.Shelf.dashboard)
                Row(title: shop.words.callIt("mac.all_jobs"), symbol: "tray.full", count: shop.orders.count,
                    selected: shop.shelf == .jobs(nil))
                    .tag(Shop.Shelf.jobs(nil))
            }
            Section(shop.words.callIt("mac.pipeline")) {
                Row(title: shop.words.callIt("mac.board"), symbol: "rectangle.split.3x1",
                    count: shop.orders.count { Stage.of($0).map { $0 != .delivered && $0 != .cancelled } ?? false },
                    selected: shop.shelf == .board)
                    .tag(Shop.Shelf.board)
                ForEach(Stage.allCases) { stage in
                    let n = shop.count(stage)
                    Row(title: shop.words.callIt(stage.key), symbol: stage.symbol, count: n,
                        selected: shop.shelf == .jobs(stage))
                        .tag(Shop.Shelf.jobs(stage))
                        // An empty stage stays visible and dimmed rather than
                        // disappearing: a sidebar that changes shape as work
                        // moves through it is a sidebar you cannot learn.
                        .foregroundStyle(n == 0 ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                }
            }
            // The floor: what the shop prints with and prints on.
            Section(shop.words.callIt("mac.the_floor")) {
                Row(title: shop.words.callIt("mac.machines"), symbol: "printer",
                    count: shop.machines.count, selected: shop.shelf == .machines)
                    .tag(Shop.Shelf.machines)
                Row(title: shop.words.callIt("mac.inventory"), symbol: "shippingbox",
                    count: shop.spools.count, selected: shop.shelf == .inventory)
                    .tag(Shop.Shelf.inventory)
                // Only for a shop that has one. A catalogue is a decision a
                // shop makes, not a screen everybody needs, and an empty row
                // on every launch is a row people stop seeing.
                if !shop.catalogueRows.isEmpty {
                    Row(title: shop.words.callIt("cat.title"), symbol: "tag",
                        count: shop.catalogueRows.count, selected: shop.shelf == .catalogue)
                        .tag(Shop.Shelf.catalogue)
                }
            }
            // What the shop spends and what it throws away. Below the floor,
            // because both are read at the end of a month rather than during a
            // day's work.
            Section(shop.words.callIt("mac.money")) {
                Row(title: shop.words.callIt("exp.title"), symbol: "creditcard",
                    count: shop.expenses.count, selected: shop.shelf == .expenses)
                    .tag(Shop.Shelf.expenses)
                Row(title: shop.words.callIt("waste.title"), symbol: "trash",
                    count: shop.wasteLog.count, selected: shop.shelf == .waste)
                    .tag(Shop.Shelf.waste)
                // No count: a quarter is not a thing a shop has a number of.
                Row(title: shop.words.callIt("an.pnl_title"), symbol: "chart.bar.doc.horizontal",
                    count: 0, selected: shop.shelf == .reports)
                    .tag(Shop.Shelf.reports)
            }
            Section(shop.words.callIt("mac.people")) {
                Row(title: shop.words.callIt("tab.clients"), symbol: "person.2", count: shop.customers.count,
                    selected: shop.shelf == .customers)
                    .tag(Shop.Shelf.customers)
            }
            // The models, below the work. A group is a set that belongs
            // together — the seven Saudi Kings, offered as one collection —
            // so the groups a shop has actually made are named here rather
            // than hidden behind a filter menu.
            Section(shop.words.callIt("mac.library")) {
                Row(title: shop.words.callIt("mac.all_models"), symbol: "square.grid.2x2", count: shop.files.count,
                    selected: shop.shelf == .library(nil))
                    .tag(Shop.Shelf.library(nil))
                ForEach(shop.groups, id: \.self) { group in
                    Row(title: group, symbol: "square.stack", count: shop.count(group: group),
                        selected: shop.shelf == .library(group))
                        .tag(Shop.Shelf.library(group))
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) { Provenance(shop: shop) }
    }

    private struct Row: View {
        let title: String
        let symbol: String
        let count: Int
        let selected: Bool

        var body: some View {
            HStack {
                Label(title, systemImage: symbol)
                Spacer(minLength: 8)
                Text("\(count)")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(selected ? AnyShapeStyle(.primary) : AnyShapeStyle(.secondary))
            }
        }
    }
}

/// Where these figures came from, at the foot of the sidebar.
///
/// A read-only app that opens someone else's file has to say which file, and
/// whether anything in it was skipped. "The list looks short today" is not a
/// thing a shop should be left to notice on its own.
private struct Provenance: View {
    let shop: Shop

    private var footerLabel: String {
        guard shop.source.isReal else { return shop.words.callIt("mac.sample") }
        return shop.words.callIt(shop.canWrite ? "mac.writable" : "mac.read_only")
    }
    private var footerSymbol: String {
        guard shop.source.isReal else { return "theatermasks" }
        return shop.canWrite ? "pencil" : "lock"
    }

    /// EVERY LINE HERE IS ONE LINE, and that is a layout rule rather than a
    /// taste.
    ///
    /// This view is the sidebar's `.safeAreaInset(edge: .bottom)`, and the
    /// sidebar is a RESIZABLE SPLIT-VIEW COLUMN. A label allowed to wrap makes
    /// this view's HEIGHT depend on the column's WIDTH — and a child whose
    /// size depends on the size it is given is a feedback loop with
    /// `SplitViewChildController.hostingView(_:didUpdateMinSize:maxSize:)`.
    /// AppKit ends that loop by throwing out of
    /// `_postWindowNeedsUpdateConstraints`, which is an abort with no reason
    /// attached to it.
    ///
    /// It happened: a two-line "changes here reach the cloud…" shipped in
    /// #997, showed only for a cloud-connected book — so never on the sample
    /// this app photographs — and took the app down after a minute or two of
    /// ordinary use. Long text goes in `.help`, where its length costs nothing.
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider()
            if let tax = shop.taxSummary {
                // Capped like every other line here. "VAT 15.00% included in
                // the price" is thirty-one characters and this column is
                // resizable, so without this its height depends on the width.
                Label(tax, systemImage: "percent").lineLimit(1).help(tax)
            }
            if !shop.skipped.isEmpty {
                Label(shop.words.callIt("mac.unreadable_records",
                                        ["n": .number(Double(shop.skipped.count))]),
                      systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .lineLimit(1)
                    .help(shop.skipped.prefix(8).joined(separator: "\n"))
            }
            if let backupProblem = shop.backupProblem {
                Label(shop.words.callIt("mac.backup_failed"), systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange).font(.caption).lineLimit(1)
                    .help(backupProblem)
            } else if let day = shop.lastBackup {
                // Quiet, and always there. A shop should be able to answer
                // "when was this last backed up" by looking, not by trusting.
                Label(shop.words.callIt("set.last_backup") + " " + day, systemImage: "clock.arrow.circlepath")
                    .foregroundStyle(.tertiary).font(.caption).lineLimit(1)
            }
            // Only for a book that expects to be in step with somewhere else.
            // A shop that has never connected to the cloud is not missing
            // anything, and a line telling it so is a line people stop reading.
            if shop.cloudConnected {
                // Not `icloud.slash`: the cloud is not switched off, and a
                // struck-through cloud beside a book this app can send from
                // says the opposite of what is true.
                Label(shop.words.callIt("mac.not_synced"), systemImage: "icloud.and.arrow.up")
                    .foregroundStyle(.tertiary).font(.caption).lineLimit(1)
                    .help(shop.words.callIt("mac.not_synced_why"))
            }
            // What the app said as it died last time. One line, like every
            // other line here; the reason is in the tooltip, and clicking it
            // says it has been read.
            if shop.lastCrash != nil {
                Label(shop.words.callIt("mac.last_crash"), systemImage: "exclamationmark.bubble")
                    .foregroundStyle(.orange).font(.caption).lineLimit(1)
                    .help(shop.lastCrash ?? "")
                    .onTapGesture { shop.forgetLastCrash() }
            }
            if let engineProblem = shop.engineProblem {
                // Above everything, in the one place that is on every screen.
                Label(shop.words.callIt("mac.engine_failed"), systemImage: "exclamationmark.octagon")
                    .foregroundStyle(.orange)
                    .font(.caption)
                    .lineLimit(1)
                    .help(engineProblem)
            }
            Label(footerLabel, systemImage: footerSymbol).lineLimit(1)
            // Who else has it open. Only shown when somebody does — a line that
            // says "nobody else is using this" on every ordinary launch is a
            // line people stop reading.
            if let owner = shop.owner {
                // The riskiest line here: this is another process's name, and
                // nothing bounds how long one of those is.
                Label(owner, systemImage: "person.badge.key")
                    .lineLimit(1).truncationMode(.middle)
                    .help(owner + "\n\n" + shop.words.callIt("mac.lock_why"))
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .labelStyle(.titleAndIcon)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}
