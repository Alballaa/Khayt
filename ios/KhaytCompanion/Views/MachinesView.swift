import SwiftUI

struct MachinesView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var machines: [MachineInfo] = []
    @State private var queue: [QueueOrder] = []
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
                        VStack(alignment: .leading, spacing: 6) {
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
                            let assigned = queue.filter {
                                $0.machineId == machine.id || $0.machine == machine.name
                            }
                            if !assigned.isEmpty {
                                Text(String(format: L10n.tr("machines.assigned"), assigned.count))
                                    .font(.caption)
                                    .foregroundStyle(KhaytDesign.textMuted)
                                ForEach(assigned.prefix(3)) { order in
                                    Text("• \(order.displayTitle)")
                                        .font(.caption2)
                                        .foregroundStyle(KhaytDesign.textDim)
                                        .lineLimit(1)
                                }
                            }
                        }
                        .padding(.vertical, 4)
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
            async let machinesTask = api.fetchMachines()
            async let queueTask = api.fetchQueue()
            let (m, q) = try await (machinesTask, queueTask)
            machines = m
            queue = q
        } catch {
            machines = []
            queue = []
            errorMessage = error.localizedDescription
        }
    }
}
