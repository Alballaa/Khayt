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
                Row(title: shop.words.callIt("mac.all_jobs"), symbol: "tray.full", count: shop.orders.count,
                    selected: shop.shelf == .jobs(nil))
                    .tag(Shop.Shelf.jobs(nil))
            }
            Section(shop.words.callIt("mac.pipeline")) {
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

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider()
            if let tax = shop.taxSummary {
                Label(tax, systemImage: "percent")
            }
            if !shop.skipped.isEmpty {
                Label("\(shop.skipped.count) records could not be read",
                      systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .help(shop.skipped.prefix(8).joined(separator: "\n"))
            }
            Label(footerLabel, systemImage: footerSymbol)
            // Who else has it open. Only shown when somebody does — a line that
            // says "nobody else is using this" on every ordinary launch is a
            // line people stop reading.
            if let owner = shop.owner {
                Label(owner, systemImage: "person.badge.key")
                    .help("Khayt serialises writes per process. While another app owns "
                          + "this book, only it may change anything.")
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
