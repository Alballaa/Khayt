import SwiftUI

struct SpoolDetailSheet: View {
    let spool: InventorySpool
    @Environment(\.dismiss) private var dismiss
    @State private var showWriteNFC = false

    var body: some View {
        NavigationStack {
            List {
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
                    if let remaining = spool.remaining ?? spool.weight {
                        LabeledContent("Remaining", value: "\(Int(remaining)) g")
                        if spool.isLowStock {
                            Label("Low stock", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }
                    if let weight = spool.weight {
                        LabeledContent("Initial weight", value: "\(Int(weight)) g")
                    }
                    if let purchased = spool.purchasedAt {
                        LabeledContent("Purchased", value: purchased)
                    }
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
        }
    }
}
