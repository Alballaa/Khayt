import SwiftUI

struct OrderDetailSheet: View {
    let order: QueueOrder
    let isUpdating: Bool
    let onAdvance: () -> Void
    let onSetStatus: (String) -> Void
    let onAssignMachine: (String?) -> Void

    @EnvironmentObject private var api: KhaytAPIClient
    @Environment(\.dismiss) private var dismiss
    @State private var machines: [MachineInfo] = []

    init(
        order: QueueOrder,
        isUpdating: Bool,
        onAdvance: @escaping () -> Void,
        onSetStatus: @escaping (String) -> Void,
        onAssignMachine: @escaping (String?) -> Void = { _ in }
    ) {
        self.order = order
        self.isUpdating = isUpdating
        self.onAdvance = onAdvance
        self.onSetStatus = onSetStatus
        self.onAssignMachine = onAssignMachine
    }

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

                if !machines.isEmpty {
                    Section(L10n.tr("order.assign_machine")) {
                        Picker(L10n.tr("order.machine"), selection: Binding(
                            get: { order.machineId ?? "" },
                            set: { newValue in
                                onAssignMachine(newValue.isEmpty ? nil : newValue)
                            }
                        )) {
                            Text(L10n.tr("order.unassigned")).tag("")
                            ForEach(machines) { machine in
                                Text(machine.name ?? machine.id).tag(machine.id)
                            }
                        }
                        .disabled(isUpdating)
                    }
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
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                machines = (try? await api.fetchMachines()) ?? []
            }
        }
    }
}

struct OrderLogDetailSheet: View {
    let entry: OrderLogEntry
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent("Project", value: entry.displayTitle)
                    LabeledContent("Client", value: entry.displayClient)
                    LabeledContent("Status") {
                        CompanionStatusBadge(status: entry.status)
                    }
                    if let material = entry.material, !material.isEmpty {
                        LabeledContent("Material", value: material)
                    }
                    if let price = entry.price {
                        LabeledContent(L10n.tr("order.price"), value: String(format: "%.2f", price))
                    }
                    if let payment = entry.paymentStatus, !payment.isEmpty {
                        LabeledContent(L10n.tr("order.payment"), value: payment.capitalized)
                    }
                    if let due = entry.dueDate, !due.isEmpty {
                        LabeledContent("Due", value: due)
                    }
                    if let date = entry.date, !date.isEmpty {
                        LabeledContent(L10n.tr("order.date"), value: date)
                    }
                    LabeledContent("Order ID", value: entry.id)
                        .font(.caption)
                }
            }
            .navigationTitle(L10n.tr("order.history"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
