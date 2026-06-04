import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All"
        case lowStock = "Low stock"
        var id: String { rawValue }
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
                        filter == .lowStock ? "No low stock" : "No spools",
                        systemImage: "cylinder",
                        description: Text(
                            errorMessage
                                ?? (searchText.isEmpty
                                    ? "Tap + to add a spool."
                                    : "No match for \"\(searchText)\".")
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
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Inventory")
            .searchable(text: $searchText, prompt: "Material, SKU, batch…")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("Filter", selection: $filter) {
                            ForEach(Filter.allCases) { f in
                                Text(f.rawValue).tag(f)
                            }
                        }
                        Toggle("Newest first", isOn: $sortNewestFirst)
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAddSpool = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showAddSpool) {
                AddSpoolSheet { Task { await load() } }
            }
            .sheet(item: $selectedSpool) { spool in
                SpoolDetailSheet(spool: spool)
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
                    .foregroundStyle(.primary)
                Spacer()
                if spool.isLowStock {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            HStack(spacing: 8) {
                if let remaining = spool.remaining ?? spool.weight {
                    Text("\(Int(remaining)) g")
                        .font(.caption)
                        .foregroundStyle(spool.isLowStock ? .orange : .secondary)
                }
                if let p = spool.printTemp, let b = spool.bedTemp {
                    Text("\(p)° / \(b)°")
                        .font(.caption2)
                        .foregroundStyle(CompanionTheme.brand)
                }
                if let lot = spool.lot, !lot.isEmpty {
                    Text(lot)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.12), in: Capsule())
                }
            }
        }
        .padding(.vertical, 2)
    }
}
