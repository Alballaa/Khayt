import SwiftUI

struct MachinesView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var machines: [MachineInfo] = []
    @State private var live: [MachineLiveStatus] = []
    @State private var queue: [QueueOrder] = []
    @State private var errorMessage: String?
    @State private var selectedMachine: MachineInfo?
    @State private var usingCachedData = false
    @State private var cacheSavedAt: Date?

    var body: some View {
        NavigationStack {
            Group {
                if usingCachedData {
                    CachedDataBanner(savedAt: cacheSavedAt)
                }
                if machines.isEmpty && errorMessage == nil && !usingCachedData {
                    ProgressView()
                } else if machines.isEmpty {
                    ContentUnavailableView(
                        L10n.tr("machines.empty"),
                        systemImage: "printer",
                        description: Text(errorMessage ?? L10n.tr("machines.empty_hint"))
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
                        .listRowBackground(KhaytDesign.surface)
                    }
                    .khaytPlainList()
                }
            }
            .khaytScreen(title: L10n.tr("tab.machines"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ConnectionBadge()
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .sheet(item: $selectedMachine) { machine in
                MachineDetailSheet(machine: machine)
            }
        }
    }

    private func load() async {
        errorMessage = nil
        usingCachedData = false
        guard api.isConfigured else {
            applyCacheFallback()
            return
        }
        do {
            async let machinesTask = api.fetchMachines()
            async let queueTask = api.fetchQueue()
            async let liveTask = api.fetchMachineLive()
            let (m, q, l) = try await (machinesTask, queueTask, liveTask)
            machines = m
            queue = q
            live = l
            CompanionDataCache.save {
                $0.machines = m
                $0.queue = q
            }
            cacheSavedAt = nil
        } catch {
            if !applyCacheFallback() {
                machines = []
                queue = []
                live = []
                errorMessage = health.isDesktopReachable ? error.localizedDescription : L10n.tr("offline.connect_hint")
            }
        }
    }

    private func applyCacheFallback() -> Bool {
        guard let cached = CompanionDataCache.load(),
              let m = cached.machines, !m.isEmpty else { return false }
        machines = m
        queue = cached.queue ?? []
        live = []
        usingCachedData = true
        cacheSavedAt = cached.savedAt
        errorMessage = nil
        return true
    }
}
