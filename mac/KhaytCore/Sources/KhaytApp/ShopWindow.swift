import SwiftUI

struct ShopWindow: View {
    @Bindable var shop: Shop
    @State private var showInspector = true

    var body: some View {
        NavigationSplitView {
            Sidebar(shop: shop)
                .navigationSplitViewColumnWidth(min: 190, ideal: 215, max: 280)
        } detail: {
            if shop.showingLibrary {
                LibraryGrid(shop: shop)
            } else if shop.showingCustomers {
                CustomersTable(shop: shop)
            } else {
                OrdersTable(shop: shop)
            }
        }
        // On the split view, not inside `detail`. Inside it, the detail content
        // is laid out against the window minus the inspector — the sidebar's
        // width is not taken off — so a Table stretches its columns across a
        // width it does not have and the right-hand ones are clipped away
        // rather than compressed. The Owed column disappeared twice that way.
        .inspector(isPresented: $showInspector) {
            Group {
                if shop.showingLibrary {
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
            ToolbarItem(placement: .principal) { OwedSummary(shop: shop) }
            ToolbarItem {
                Button {
                    showInspector.toggle()
                } label: {
                    Label("Details", systemImage: "sidebar.trailing")
                }
                .help("Show or hide the job details")
            }
        }
        .navigationTitle(shop.shopName)
        .navigationSubtitle(subtitle)
    }

    /// Says which book is open before it says anything else. The sample must
    /// never be mistaken for the shop's real position.
    private var subtitle: String {
        let provenance = shop.source.isReal ? "read-only" : "sample data — not a real shop"
        if shop.showingLibrary {
            let n = shop.shownFiles.count
            return "\(n) model\(n == 1 ? "" : "s") · \(provenance)"
        }
        if shop.showingCustomers {
            let n = shop.shownCustomers.count
            return "\(n) customer\(n == 1 ? "" : "s") · \(provenance)"
        }
        return provenance
    }

    private var searchPrompt: String {
        if shop.showingLibrary { return "Model, material or tag" }
        if shop.showingCustomers { return "Customer or job" }
        return "Job, customer or number"
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
                Text("Owed")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .textCase(.uppercase)
                    .tracking(0.6)
                Text(Money.text(shop.owed, shop.currency))
                    .font(.system(size: 13, weight: .medium))
                    .monospacedDigit()
            }
            if shop.overdueCount > 0 {
                Label("\(shop.overdueCount) late", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.orange)
                    .labelStyle(.titleAndIcon)
                    .help("\(shop.overdueCount) unpaid jobs are past their due date")
            }
        }
        .padding(.horizontal, 4)
    }
}
