import SwiftUI

/// Create a quick order or quote and send it to the desktop queue.
struct NewOrderSheet: View {
    let machines: [MachineInfo]
    var onCreated: () -> Void = {}

    @EnvironmentObject private var api: KhaytAPIClient
    @Environment(\.dismiss) private var dismiss

    @State private var draft = NewOrderDraft()
    @State private var hasDueDate = false
    @State private var dueDate = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var canSave: Bool {
        !draft.project.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
    }

    private var selectedMachineName: String {
        machines.first { $0.id == draft.machineId }?.name ?? "Unassigned"
    }

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $draft.isQuote) {
                    Text("Order").tag(false)
                    Text("Quote").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))

                Section("Details") {
                    TextField("Project", text: $draft.project)
                    TextField("Client", text: $draft.client)
                    TextField("Material", text: $draft.material)
                    TextField("Price (SAR)", text: $draft.price)
                        .keyboardType(.decimalPad)
                }

                Section("Schedule & machine") {
                    Toggle("Set due date", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: .date)
                    }
                    if !machines.isEmpty {
                        Menu {
                            Button { draft.machineId = nil } label: {
                                Label("Unassigned", systemImage: draft.machineId == nil ? "checkmark" : "circle")
                            }
                            ForEach(machines) { m in
                                Button { draft.machineId = m.id } label: {
                                    Label(m.name ?? m.id, systemImage: draft.machineId == m.id ? "checkmark" : "printer")
                                }
                            }
                        } label: {
                            HStack {
                                Text("Machine").foregroundStyle(KhaytDesign.text)
                                Spacer()
                                Text(selectedMachineName).foregroundStyle(KhaytDesign.textDim)
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.caption).foregroundStyle(KhaytDesign.textMuted)
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.caption).foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(draft.isQuote ? "Create quote" : "Add to queue")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!canSave)
                }
            }
            .navigationTitle(draft.isQuote ? "New quote" : "New order")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        if hasDueDate {
            let fmt = DateFormatter()
            fmt.dateFormat = "yyyy-MM-dd"
            fmt.locale = Locale(identifier: "en_US_POSIX")
            draft.dueDate = fmt.string(from: dueDate)
        } else {
            draft.dueDate = ""
        }
        do {
            try await api.createOrder(draft)
            CompanionHaptics.success()
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }
}
