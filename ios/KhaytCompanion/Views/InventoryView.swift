import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var spools: [InventorySpool] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if spools.isEmpty && errorMessage == nil {
                    ProgressView()
                } else if spools.isEmpty {
                    ContentUnavailableView(
                        "No spools",
                        systemImage: "cylinder",
                        description: Text(errorMessage ?? "Add spools from the Scan tab or desktop app.")
                    )
                } else {
                    List(spools) { spool in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(spool.displayLabel)
                                .font(.headline)
                            HStack {
                                if let remaining = spool.remaining ?? spool.weight {
                                    Text("\(Int(remaining)) g remaining")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let purchased = spool.purchasedAt {
                                    Text("· \(purchased)")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Inventory")
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
