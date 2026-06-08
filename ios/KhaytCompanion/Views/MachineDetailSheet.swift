import SwiftUI

struct MachineDetailSheet: View {
    let machine: MachineInfo
    @EnvironmentObject private var api: KhaytAPIClient
    @Environment(\.dismiss) private var dismiss

    @State private var live: MachineLiveStatus?
    @State private var assigned: [QueueOrder] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section(L10n.tr("tab.machines")) {
                    LabeledContent(L10n.tr("common.name"), value: machine.name ?? machine.id)
                    if let type = machine.type {
                        LabeledContent(L10n.tr("common.type"), value: type.uppercased())
                    }
                    if let status = machine.status {
                        LabeledContent(L10n.tr("common.status")) {
                            CompanionStatusBadge(status: status, compact: true)
                        }
                    }
                }

                Section(header: Text(L10n.tr("machine.live"))) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(KhaytDesign.danger)
                            .font(.subheadline)
                            .khaytListRows()
                    } else if !machine.supportsLiveTelemetry {
                        Text(L10n.tr("machine.live_unconfigured"))
                            .font(.subheadline)
                            .foregroundStyle(KhaytDesign.textDim)
                            .khaytListRows()
                    } else if let live {
                        if let err = live.error {
                            Label(err, systemImage: "exclamationmark.triangle")
                                .foregroundStyle(KhaytDesign.warn)
                                .khaytListRows()
                        } else {
                            if let state = live.state {
                                LabeledContent(L10n.tr("machine.state"), value: state)
                            }
                            if let progress = live.progress {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(L10n.tr("machine.progress"))
                                        Spacer()
                                        Text("\(progress)%")
                                    }
                                    ProgressView(value: Double(progress), total: 100)
                                }
                            }
                            if let file = live.filename, !file.isEmpty {
                                LabeledContent(L10n.tr("machine.file"), value: file)
                            }
                            if let eta = live.etaLabel {
                                LabeledContent(L10n.tr("machine.eta"), value: eta)
                            }
                            if live.tempNozzle != nil || live.tempBed != nil {
                                LabeledContent(L10n.tr("machine.temps"), value: tempsLabel(live))
                            }
                        }
                    } else {
                        ProgressView()
                    }
                }

                if !assigned.isEmpty {
                    Section(L10n.tr("machines.assigned_header")) {
                        ForEach(assigned) { order in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(order.displayTitle).font(.headline)
                                CompanionStatusBadge(status: order.status, compact: true)
                            }
                        }
                    }
                }
            }
            .khaytSheetList()
            .navigationTitle(machine.name ?? machine.id)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("common.done")) { dismiss() }
                }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func tempsLabel(_ live: MachineLiveStatus) -> String {
        let n = live.tempNozzle.map { "\($0)°" } ?? "—"
        let b = live.tempBed.map { "\($0)°" } ?? "—"
        return "\(n) / \(b)"
    }

    private func load() async {
        errorMessage = nil
        do {
            async let liveTask = api.fetchMachineLive()
            async let queueTask = api.fetchQueue()
            let (allLive, queue) = try await (liveTask, queueTask)
            live = allLive.first { $0.id == machine.id }
            assigned = queue.filter { $0.machineId == machine.id || $0.machine == machine.name }
        } catch {
            live = nil
            assigned = []
            errorMessage = error.localizedDescription
        }
    }
}
