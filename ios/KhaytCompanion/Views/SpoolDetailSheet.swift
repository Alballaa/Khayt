import SwiftUI

struct SpoolDetailSheet: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @Environment(\.dismiss) private var dismiss

    @State private var spool: InventorySpool
    @State private var showWriteNFC = false
    @State private var remainingText: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showDeleteConfirm = false

    var onChanged: () -> Void

    init(spool: InventorySpool, onChanged: @escaping () -> Void = {}) {
        _spool = State(initialValue: spool)
        let grams = Int(spool.remaining ?? spool.weight ?? 0)
        _remainingText = State(initialValue: String(grams))
        self.onChanged = onChanged
    }

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

                Section("Filament") {
                    LabeledContent("Name", value: spool.displayLabel)
                    if let brand = spool.brand, !brand.isEmpty {
                        LabeledContent("Brand", value: brand)
                    }
                    if let material = spool.material, !material.isEmpty {
                        LabeledContent("Material", value: material)
                    }
                }

                Section("Stock") {
                    TextField(L10n.tr("spool.remaining"), text: $remainingText)
                        .keyboardType(.numberPad)
                    if let weight = spool.weight {
                        LabeledContent(L10n.tr("spool.initial"), value: "\(Int(weight)) g")
                    }
                    if spool.isLowStock {
                        Label(L10n.tr("inventory.low_badge"), systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                    }
                    HStack {
                        quickDeductButton(50)
                        quickDeductButton(100)
                        Button(L10n.tr("spool.mark_empty")) {
                            remainingText = "0"
                            Task { await saveRemaining() }
                        }
                    }
                    Button {
                        Task { await saveRemaining() }
                    } label: {
                        if isSaving {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(L10n.tr("spool.save_remaining"))
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSaving)
                }

                if spool.hasOptionalMeta {
                    Section("Label / tag info") {
                        if let sku = spool.sku, !sku.isEmpty {
                            LabeledContent("SKU", value: sku)
                        }
                        if let lot = spool.lot, !lot.isEmpty {
                            LabeledContent("Batch / lot", value: lot)
                        }
                        if let p = spool.printTemp {
                            LabeledContent("Print temp", value: "\(p)°C")
                        }
                        if let b = spool.bedTemp {
                            LabeledContent("Bed temp", value: "\(b)°C")
                        }
                    }
                }

                Section {
                    Button {
                        showWriteNFC = true
                    } label: {
                        Label(L10n.tr("nfc.write.title"), systemImage: "wave.3.right")
                    }
                } footer: {
                    Text(L10n.tr("nfc.write.footer"))
                        .font(.caption)
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label(L10n.tr("spool.delete"), systemImage: "trash")
                    }
                    .disabled(isSaving)
                }

                Section {
                    LabeledContent("ID", value: spool.id)
                        .font(.caption)
                }
            }
            .navigationTitle("Spool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showWriteNFC) {
                WriteNFCTagSheet(draft: SpoolDraft.from(spool: spool))
            }
            .confirmationDialog(L10n.tr("spool.delete_confirm"), isPresented: $showDeleteConfirm) {
                Button(L10n.tr("spool.delete"), role: .destructive) {
                    Task { await deleteSpool() }
                }
            }
        }
    }

    private func quickDeductButton(_ grams: Int) -> some View {
        Button("-\(grams)g") {
            let current = Int(remainingText) ?? 0
            remainingText = String(max(current - grams, 0))
            Task { await saveRemaining() }
        }
        .buttonStyle(.bordered)
    }

    private func saveRemaining() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let grams = Int(remainingText) ?? 0
        do {
            spool = try await api.updateSpoolRemaining(id: spool.id, grams: grams)
            remainingText = String(Int(spool.remaining ?? spool.weight ?? 0))
            CompanionHaptics.success()
            onChanged()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }

    private func deleteSpool() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await api.deleteSpool(id: spool.id)
            CompanionHaptics.success()
            onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }
}
