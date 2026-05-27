import SwiftUI

struct MachinesView: View {
    @Environment(AppState.self) private var appState
    @State private var machines: [Machine] = []
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
            }
            if machines.isEmpty {
                Section {
                    EmptyStateView(icon: "printer", title: "No machines", message: "Add machines on the desktop app.")
                }
            }
            ForEach(machines) { m in
                MachineRow(machine: m)
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .navigationTitle("Machines")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard let api = appState.api else { return }
        do {
            machines = try await api.machines()
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
