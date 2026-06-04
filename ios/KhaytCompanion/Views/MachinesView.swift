import SwiftUI

struct MachinesView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var machines: [MachineInfo] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if machines.isEmpty && errorMessage == nil {
                    ProgressView()
                } else if machines.isEmpty {
                    ContentUnavailableView(
                        "No machines",
                        systemImage: "printer",
                        description: Text(errorMessage ?? "Add printers in Khayt desktop.")
                    )
                } else {
                    List(machines) { machine in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(machine.name ?? machine.id)
                                    .font(.headline)
                                if let type = machine.type {
                                    Text(type.uppercased())
                                        .font(.caption)
                                        .foregroundStyle(KhaytDesign.textDim)
                                }
                            }
                            Spacer()
                            if let status = machine.status {
                                CompanionStatusBadge(status: status, compact: true)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .khaytScreen(title: L10n.tr("tab.machines"))
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            machines = try await api.fetchMachines()
        } catch {
            machines = []
            errorMessage = error.localizedDescription
        }
    }

}
