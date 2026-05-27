import SwiftUI

struct InventoryView: View {
    @Environment(AppState.self) private var appState
    @State private var spools: [Spool] = []
    @State private var error: String?
    @State private var showAdd = false

    var body: some View {
        List {
            if let error { Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) } }
            if spools.isEmpty {
                Section {
                    EmptyStateView(icon: "shippingbox", title: "No spools", message: "Tap + to add one.")
                }
            }
            ForEach(spools) { spool in
                SpoolRow(spool: spool)
            }
        }
        .navigationTitle("Inventory")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showAdd) {
            AddSpoolView { await load() }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard let api = appState.api else { return }
        do {
            spools = try await api.inventory()
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct SpoolRow: View {
    let spool: Spool
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(spool.displayName).font(.body.weight(.medium))
                Spacer()
                Text("\(Int(spool.grams)) g").font(.caption.monospacedDigit())
            }
            ProgressView(value: spool.fillRatio)
                .progressViewStyle(.linear)
                .tint(.accentColor)
        }
        .padding(.vertical, 4)
    }
}
