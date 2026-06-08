import SwiftUI

struct SpoolDetailSheet: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth
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

                Section(L10n.tr("spool.section.filament")) {
                    LabeledContent(L10n.tr("common.name"), value: spool.displayLabel)
                    if let brand = spool.brand, !brand.isEmpty {
                        LabeledContent(L10n.tr("spool.brand"), value: brand)
                    }
                    if let material = spool.material, !material.isEmpty {
                        LabeledContent(L10n.tr("field.material"), value: material)
                    }
                }

                Section {
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
                    .disabled(isSaving || !health.isDesktopReachable)
                } header: {
                    Text(L10n.tr("spool.section.stock"))
                } footer: {
                    if !health.isDesktopReachable {
                        Text(L10n.tr("offline.action_unavailable"))
                            .font(.caption)
                    }
                }

                if spool.hasOptionalMeta {
                    Section(L10n.tr("spool.section.label")) {
                        if let sku = spool.sku, !sku.isEmpty {
                            LabeledContent(L10n.tr("spool.sku"), value: sku)
                        }
                        if let lot = spool.lot, !lot.isEmpty {
                            LabeledContent(L10n.tr("spool.batch"), value: lot)
                        }
                        if let p = spool.printTemp {
                            LabeledContent(L10n.tr("spool.print_temp"), value: "\(p)°C")
                        }
                        if let b = spool.bedTemp {
                            LabeledContent(L10n.tr("spool.bed_temp"), value: "\(b)°C")
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
                    .disabled(isSaving || !health.isDesktopReachable)
                }

                Section {
                    LabeledContent(L10n.tr("common.id"), value: spool.id)
                        .font(.caption)
                }
            }
            .scrollContentBackground(.hidden)
            .background(KhaytDesign.sheetBg)
            .navigationTitle(L10n.tr("spool.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("common.done")) { dismiss() }
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
        guard health.isDesktopReachable else {
            errorMessage = L10n.tr("offline.action_unavailable")
            return
        }
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
        guard health.isDesktopReachable else {
            errorMessage = L10n.tr("offline.action_unavailable")
            return
        }
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
