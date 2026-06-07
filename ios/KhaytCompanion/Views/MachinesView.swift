import SwiftUI

struct MachinesView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var machines: [MachineInfo] = []
    @State private var live: [MachineLiveStatus] = []
    @State private var queue: [QueueOrder] = []
    @State private var errorMessage: String?
    @State private var selectedMachine: MachineInfo?

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
                        Button {
                            selectedMachine = machine
                        } label: {
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
                            if let telemetry = live.first(where: { $0.id == machine.id }),
                               machine.supportsLiveTelemetry, telemetry.error == nil,
                               let progress = telemetry.progress, progress > 0 {
                                HStack(spacing: 8) {
                                    ProgressView(value: Double(progress), total: 100)
                                        .frame(maxWidth: 120)
                                    Text("\(progress)%")
                                        .font(.caption2)
                                        .foregroundStyle(KhaytDesign.brand)
                                    if let state = telemetry.state {
                                        Text(state)
                                            .font(.caption2)
                                            .foregroundStyle(KhaytDesign.textMuted)
                                    }
                                }
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
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .khaytScreen(title: L10n.tr("tab.machines"))
            .refreshable { await load() }
            .task { await load() }
            .sheet(item: $selectedMachine) { machine in
                MachineDetailSheet(machine: machine)
            }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            async let machinesTask = api.fetchMachines()
            async let queueTask = api.fetchQueue()
            async let liveTask = api.fetchMachineLive()
            let (m, q, l) = try await (machinesTask, queueTask, liveTask)
            machines = m
            queue = q
            live = l
        } catch {
            machines = []
            queue = []
            live = []
            errorMessage = error.localizedDescription
        }
    }
}
