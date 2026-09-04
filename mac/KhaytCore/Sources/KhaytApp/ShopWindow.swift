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
            ToolbarItem(placement: .principal) {
                if shop.showingLibrary { GroupMenu(shop: shop) } else { OwedSummary(shop: shop) }
            }
            ToolbarItem {
                Button {
                    showInspector.toggle()
                } label: {
                    Label("Details", systemImage: "sidebar.trailing")
                }
                .help("Show or hide the job details")
            }
        }
        // NOT `.environment(\.layoutDirection, …)` — see `Words.layout`. The one
        // line that would mirror this window loops SwiftUI's split view until
        // the window is 3380pt wide and AppKit gives up. The words are Arabic;
        // the mirroring is not done yet, and pretending otherwise with a crash
        // would be worse than saying so.
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
        return provenance
    }

    private var searchPrompt: String {
        if shop.showingLibrary { return shop.words.callIt("mac.search_models") }
        if shop.showingCustomers { return shop.words.callIt("mac.search_people") }
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
