import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    enum Filter: CaseIterable, Identifiable {
        case all
        case lowStock
        var id: Self { self }
        var label: String {
            switch self {
            case .all: return L10n.tr("inventory.filter.all")
            case .lowStock: return L10n.tr("inventory.filter.low")
            }
        }
    }

    @State private var spools: [InventorySpool] = []
    @State private var errorMessage: String?
    @State private var showAddSpool = false
    @State private var searchText = ""
    @State private var filter: Filter = .all
    @State private var selectedSpool: InventorySpool?
    @State private var sortNewestFirst = true

    private var displayed: [InventorySpool] {
        var list = spools
        if filter == .lowStock {
            list = list.filter(\.isLowStock)
        }
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !q.isEmpty {
            list = list.filter {
                $0.displayLabel.lowercased().contains(q)
                    || ($0.lot ?? "").lowercased().contains(q)
                    || ($0.sku ?? "").lowercased().contains(q)
            }
        }
        return list.sorted { a, b in
            let da = a.purchasedAt ?? a.addedAt ?? ""
            let db = b.purchasedAt ?? b.addedAt ?? ""
            return sortNewestFirst ? da > db : da < db
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if spools.isEmpty && errorMessage == nil {
                    ProgressView()
                } else if displayed.isEmpty {
                    ContentUnavailableView(
                        filter == .lowStock ? L10n.tr("inventory.empty_low") : L10n.tr("inventory.empty"),
                        systemImage: "cylinder",
                        description: Text(
                            errorMessage
                                ?? (searchText.isEmpty
                                    ? L10n.tr("inventory.empty_hint")
                                    : String(format: L10n.tr("common.no_match"), searchText))
                        )
                    )
                } else {
                    List(displayed) { spool in
                        Button {
                            selectedSpool = spool
                        } label: {
                            SpoolRow(spool: spool)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(KhaytDesign.surface)
                    }
                    .khaytPlainList()
                }
            }
            .khaytScreen(title: L10n.tr("tab.inventory"))
            .searchable(text: $searchText, prompt: L10n.tr("inventory.search"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker(L10n.tr("inventory.filter"), selection: $filter) {
                            ForEach(Filter.allCases) { f in
                                Text(f.label).tag(f)
                            }
                        }
                        Toggle(L10n.tr("inventory.sort.newest"), isOn: $sortNewestFirst)
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Button { showAddSpool = true } label: { Image(systemName: "plus") }
                        ConnectionBadge()
                    }
                }
            }
            .sheet(isPresented: $showAddSpool) {
                AddSpoolSheet { Task { await load() } }
            }
            .sheet(item: $selectedSpool) { spool in
                SpoolDetailSheet(spool: spool) {
                    Task { await load() }
                }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            spools = try await api.fetchInventory()
        } catch {
            spools = []
            errorMessage = error.localizedDescription
        }
    }
}

private struct SpoolRow: View {
    let spool: InventorySpool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(spool.displayLabel)
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                if spool.isLowStock {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(KhaytDesign.warn)
                }
            }
            HStack(spacing: 8) {
                if let remaining = spool.remaining ?? spool.weight {
                    Text("\(Int(remaining)) g")
                        .font(.caption)
                        .foregroundStyle(spool.isLowStock ? KhaytDesign.warn : KhaytDesign.textDim)
                }
                if let p = spool.printTemp, let b = spool.bedTemp {
                    Text("\(p)° / \(b)°")
                        .font(.caption2)
                        .foregroundStyle(KhaytDesign.brand)
                }
                if let lot = spool.lot, !lot.isEmpty {
                    Text(lot)
                        .font(.caption2)
                        .foregroundStyle(KhaytDesign.textMuted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(KhaytDesign.surface2, in: Capsule())
                }
            }
        }
        .padding(.vertical, 2)
    }
}
