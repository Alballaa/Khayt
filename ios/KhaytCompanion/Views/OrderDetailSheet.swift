import SwiftUI

struct OrderDetailSheet: View {
    let order: QueueOrder
    let isUpdating: Bool
    let onAdvance: () -> Void
    let onSetStatus: (String) -> Void
    var onAssigned: () -> Void = {}
    @EnvironmentObject private var api: KhaytAPIClient
    @Environment(\.dismiss) private var dismiss
    @State private var machines: [MachineInfo] = []
    @State private var assigning = false
    @State private var assignError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent("Project", value: order.displayTitle)
                    LabeledContent("Client", value: order.displayClient)
                    LabeledContent("Status") {
                        CompanionStatusBadge(status: order.status)
                    }
                    if let machine = order.machine, !machine.isEmpty {
                        LabeledContent("Machine", value: machine)
                    }
                    if let due = order.dueDate, !due.isEmpty {
                        LabeledContent("Due", value: due)
                    }
                    if let priority = order.priority, !priority.isEmpty {
                        LabeledContent("Priority", value: priority.capitalized)
                    }
                    LabeledContent("Order ID", value: order.id)
                        .font(.caption)
                }

                if OrderStatus(rawValue: order.status)?.nextInQueue != nil {
                    Section {
                        Button(action: onAdvance) {
                            if isUpdating {
                                HStack {
                                    Spacer()
                                    ProgressView()
                                    Spacer()
                                }
                            } else {
                                Label(L10n.tr("orders.detail.advance"), systemImage: "arrow.right.circle.fill")
                            }
                        }
                        .disabled(isUpdating)
                    }
                }

                Section(L10n.tr("orders.detail.assign_machine")) {
                    if machines.isEmpty {
                        Text(L10n.tr("orders.detail.no_machines"))
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.textMuted)
                    } else {
                        ForEach(machines) { m in
                            Button {
                                Task { await assign(m) }
                            } label: {
                                HStack {
                                    Image(systemName: "printer")
                                        .foregroundStyle(KhaytDesign.textMuted)
                                    Text(m.name ?? m.id)
                                    Spacer()
                                    if order.machine == m.name {
                                        Image(systemName: "checkmark").foregroundStyle(KhaytDesign.brand)
                                    }
                                }
                            }
                            .disabled(assigning || isUpdating)
                        }
                    }
                    if assigning {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    }
                    if let assignError {
                        Text(assignError).font(.caption).foregroundStyle(.red)
                    }
                }

                Section(L10n.tr("orders.detail.set_status")) {
                    ForEach(OrderStatus.allCases.filter { $0 != .completed }, id: \.self) { st in
                        Button {
                            onSetStatus(st.rawValue)
                        } label: {
                            HStack {
                                CompanionStatusBadge(status: st.rawValue, compact: true)
                                Spacer()
                                if order.status == st.rawValue {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(KhaytDesign.brand)
                                }
                            }
                        }
                        .disabled(isUpdating || order.status == st.rawValue)
                    }
                }
            }
            .navigationTitle("Order")
            .navigationBarTitleDisplayMode(.inline)
            .task { machines = (try? await api.fetchMachines()) ?? [] }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func assign(_ machine: MachineInfo) async {
        assigning = true
        assignError = nil
        defer { assigning = false }
        do {
            try await api.assignMachine(orderId: order.id, machineId: machine.id, machineName: machine.name)
            onAssigned()
            dismiss()
        } catch {
            assignError = error.localizedDescription
        }
    }
}
