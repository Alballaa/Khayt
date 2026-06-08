import SwiftUI

/// Pick NFC standard (printer-dependent) and write spool data to a blank tag.
struct WriteNFCTagSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var nfc: NFCReader

    let draft: SpoolDraft
    var suggestedStandard: NFCFilamentStandard?

    @State private var selectedStandard: NFCFilamentStandard = .openSpool
    @State private var encodeError: String?
    @State private var hasStartedWrite = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(L10n.tr("nfc.write.intro"))
                        .font(.subheadline)
                        .foregroundStyle(KhaytDesign.textDim)
                        .khaytListRows()
                }

                Section(header: Text(L10n.tr("nfc.write.standard"))) {
                    ForEach(NFCFilamentStandard.allCases) { standard in
                        Button {
                            selectedStandard = standard
                            encodeError = nil
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(standard.label)
                                        .font(.headline)
                                        .foregroundStyle(KhaytDesign.text)
                                    Text(standard.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(KhaytDesign.textDim)
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer()
                                if selectedStandard == standard {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(KhaytDesign.brand)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .khaytListRows()
                    }
                }

                Section(header: Text(L10n.tr("nfc.write.preview"))) {
                    LabeledContent(L10n.tr("nfc.write.material"), value: draft.material.isEmpty ? "—" : draft.material)
                        .khaytListRows()
                    if !draft.brand.isEmpty {
                        LabeledContent(L10n.tr("nfc.write.brand"), value: draft.brand)
                            .khaytListRows()
                    }
                    LabeledContent(L10n.tr("nfc.write.weight"), value: "\(draft.weightGrams) g")
                        .khaytListRows()
                    if !draft.printTemp.isEmpty {
                        LabeledContent(L10n.tr("nfc.write.print_temp"), value: "\(draft.printTemp)°C")
                            .khaytListRows()
                    }
                    if !draft.bedTemp.isEmpty {
                        LabeledContent(L10n.tr("nfc.write.bed_temp"), value: "\(draft.bedTemp)°C")
                            .khaytListRows()
                    }
                }

                if let encodeError {
                    Section {
                        Text(encodeError)
                            .font(.subheadline)
                            .foregroundStyle(KhaytDesign.danger)
                            .khaytListRows()
                    }
                }

                if nfc.writeSucceeded {
                    Section {
                        Label(L10n.tr("nfc.write.success"), systemImage: "checkmark.circle.fill")
                            .foregroundStyle(KhaytDesign.ok)
                            .khaytListRows()
                    }
                } else if let err = nfc.lastError, hasStartedWrite {
                    Section {
                        Text(err)
                            .font(.subheadline)
                            .foregroundStyle(KhaytDesign.danger)
                            .khaytListRows()
                    }
                }

                Section {
                    if !nfc.isAvailable {
                        Text(L10n.tr("nfc.unavailable"))
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.warn)
                            .khaytListRows()
                    }
                    Button {
                        startWrite()
                    } label: {
                        Label(
                            nfc.isWriting ? L10n.tr("nfc.write.scanning") : L10n.tr("nfc.write.tap_blank"),
                            systemImage: "wave.3.right"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(!nfc.isAvailable || nfc.isWriting || draft.material.trimmingCharacters(in: .whitespaces).isEmpty)
                    .khaytListRows()
                } footer: {
                    Text(L10n.tr("nfc.write.footer"))
                        .font(.caption)
                }
            }
            .khaytSheetList()
            .navigationTitle(L10n.tr("nfc.write.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(KhaytDesign.navBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(KhaytDesign.isDark ? .dark : .light, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("nfc.write.done")) {
                        nfc.clearWriteState()
                        dismiss()
                    }
                }
            }
            .onAppear {
                if let suggested = suggestedStandard {
                    selectedStandard = suggested
                } else if draft.sourceNote.contains("OpenPrintTag") {
                    selectedStandard = .openPrintTag
                } else if draft.sourceNote.contains("OpenTag3D") {
                    selectedStandard = .openTag3D
                } else if draft.sourceNote.contains("OpenSpool") {
                    selectedStandard = .openSpool
                }
            }
            .onDisappear { nfc.invalidate() }
        }
    }

    private func startWrite() {
        encodeError = nil
        hasStartedWrite = true
        do {
            let message = try NFCEncoder.encode(draft: draft, standard: selectedStandard)
            nfc.beginWrite(message: message)
        } catch {
            encodeError = error.localizedDescription
        }
    }
}
