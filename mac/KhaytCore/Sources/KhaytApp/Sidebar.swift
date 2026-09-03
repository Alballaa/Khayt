import SwiftUI

/// A source list: the pipeline, in the order a job moves through it.
///
/// Not alphabetical, and not "whatever statuses the data happens to contain".
/// The order comes from `lib/order-progress.js`, so the sidebar reads down the
/// way work actually flows — quotes at the top, delivered at the bottom.
struct Sidebar: View {
    @Bindable var shop: Shop

    var body: some View {
        List(selection: $shop.stage) {
            Section {
                Row(title: "All jobs", symbol: "tray.full", count: shop.orders.count,
                    selected: shop.stage == nil)
                    .tag(Stage?.none)
            }
            Section("Pipeline") {
                ForEach(Stage.allCases) { stage in
                    let n = shop.count(stage)
                    Row(title: stage.title, symbol: stage.symbol, count: n,
                        selected: shop.stage == stage)
                        .tag(Stage?.some(stage))
                        // An empty stage stays visible and dimmed rather than
                        // disappearing: a sidebar that changes shape as work
                        // moves through it is a sidebar you cannot learn.
                        .foregroundStyle(n == 0 ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
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
            Label(shop.source.isReal ? "Opened read-only" : "Sample data",
                  systemImage: shop.source.isReal ? "lock" : "theatermasks")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .labelStyle(.titleAndIcon)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}
