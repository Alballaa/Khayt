import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var spools: [InventorySpool] = []
    @State private var errorMessage: String?
    @State private var showAddSpool = false
    @State private var newMaterial = ""
    @State private var newWeight = "1000"

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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAddSpool = true } label: { Image(systemName: "plus") }
                }
            }
            .alert("Add spool", isPresented: $showAddSpool) {
                TextField("Material", text: $newMaterial)
                TextField("Weight (g)", text: $newWeight)
                    .keyboardType(.numberPad)
                Button("Cancel", role: .cancel) {}
                Button("Add") { Task { await addManual() } }
            } message: {
                Text("Adds to desktop inventory via LAN API.")
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func addManual() async {
        let material = newMaterial.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !material.isEmpty, let w = Int(newWeight), w > 0 else {
            errorMessage = "Enter material and weight."
            return
        }
        do {
            _ = try await api.addSpool(material: material, weight: w)
            newMaterial = ""
            newWeight = "1000"
            await load()
        } catch {
            errorMessage = error.localizedDescription
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
