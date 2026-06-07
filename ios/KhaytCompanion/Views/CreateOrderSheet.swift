import SwiftUI

struct CreateOrderSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var draft = NewOrderDraft()
    @State private var machines: [MachineInfo] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    var onCreated: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.subheadline)
                    }
                }

                Section(header: Text(L10n.tr("order.create.required"))) {
                    TextField(L10n.tr("order.create.project"), text: $draft.project)
                    Picker(L10n.tr("order.create.type"), selection: $draft.asQuote) {
                        Text(L10n.tr("order.create.job")).tag(false)
                        Text(L10n.tr("order.create.quote")).tag(true)
                    }
                    .pickerStyle(.segmented)
                }

                Section(header: Text(L10n.tr("order.create.optional"))) {
                    TextField(L10n.tr("order.create.client"), text: $draft.client)
                    TextField(L10n.tr("order.create.material"), text: $draft.material)
                    TextField(L10n.tr("order.create.price"), text: $draft.price)
                        .keyboardType(.decimalPad)
                    TextField(L10n.tr("order.create.due"), text: $draft.dueDate)
                    TextField(L10n.tr("order.create.notes"), text: $draft.notes, axis: .vertical)
                        .lineLimit(2...4)
                    if !machines.isEmpty {
                        Picker(L10n.tr("order.machine"), selection: $draft.machineId) {
                            Text(L10n.tr("order.unassigned")).tag("")
                            ForEach(machines) { m in
                                Text(m.name ?? m.id).tag(m.id)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSaving {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(draft.asQuote ? L10n.tr("order.create.save_quote") : L10n.tr("order.create.save_job"))
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSaving || draft.project.trimmingCharacters(in: .whitespaces).isEmpty)
                } footer: {
                    Text(L10n.tr("order.create.footer"))
                        .font(.caption)
                }
            }
            .navigationTitle(L10n.tr("order.create.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("nfc.write.done")) { dismiss() }
                }
            }
            .task {
                machines = (try? await api.fetchMachines()) ?? []
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            _ = try await api.createOrder(draft: draft)
            CompanionHaptics.success()
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }
}
