import SwiftUI

/// Presented from Inventory — pick how to add, then review optional fields.
struct AddSpoolSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth
    @EnvironmentObject private var nfc: NFCReader

    private var canSyncToDesktop: Bool { health.isDesktopReachable }

    enum Step {
        case chooseMethod
        case scanLabel
        case nfc
        case review
    }

    @State private var step: Step = .chooseMethod
    @State private var draft = SpoolDraft()
    @State private var showCamera = false
    @State private var scannedRaw: String?
    @State private var isUploading = false
    @State private var errorMessage: String?
    @State private var showWriteNFC = false
    @State private var nfcWriteStandard: NFCFilamentStandard?

    var onAdded: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .chooseMethod:
                    chooseMethodView
                case .scanLabel:
                    scanLabelView
                case .nfc:
                    nfcView
                case .review:
                    SpoolReviewForm(
                        draft: $draft,
                        isUploading: isUploading,
                        canSyncToDesktop: canSyncToDesktop,
                        errorMessage: errorMessage,
                        onWriteNFC: {
                            if draft.sourceNote.contains("OpenPrintTag") {
                                nfcWriteStandard = .openPrintTag
                            } else if draft.sourceNote.contains("OpenTag3D") {
                                nfcWriteStandard = .openTag3D
                            } else if draft.sourceNote.contains("OpenSpool") {
                                nfcWriteStandard = .openSpool
                            } else {
                                nfcWriteStandard = nil
                            }
                            showWriteNFC = true
                        }
                    ) {
                        Task { await submit() }
                    }
                }
            }
            .khaytSheet()
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(KhaytDesign.navBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(KhaytDesign.isDark ? .dark : .light, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("common.cancel")) { dismiss() }
                }
                if step != .chooseMethod && step != .review {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(L10n.tr("common.back")) { goBack() }
                    }
                }
            }
            .sheet(isPresented: $showCamera) {
                if BarcodeScannerView.isSupported() {
                    BarcodeScannerView(scannedText: $scannedRaw)
                } else {
                    Text(L10n.tr("spool.add.camera_unavailable"))
                        .padding()
                }
            }
            .onChange(of: scannedRaw) { _, value in
                guard let value else { return }
                draft = SpoolDraft.from(parsed: FilamentLabelParser.parse(text: value))
                step = .review
            }
            .onDisappear { nfc.invalidate() }
            .sheet(isPresented: $showWriteNFC) {
                WriteNFCTagSheet(draft: draft, suggestedStandard: nfcWriteStandard)
            }
        }
    }

    private var navTitle: String {
        switch step {
        case .chooseMethod: return L10n.tr("spool.add.title")
        case .scanLabel: return L10n.tr("spool.add.scan")
        case .nfc: return L10n.tr("spool.add.nfc")
        case .review: return L10n.tr("spool.add.confirm")
        }
    }

    private var chooseMethodView: some View {
        List {
            Section {
                Text(L10n.tr("spool.add.intro"))
                    .font(.subheadline)
                    .foregroundStyle(KhaytDesign.textDim)
                    .khaytListRows()
            }
            Section {
                KhaytMethodRow(
                    title: L10n.tr("spool.add.method.scan"),
                    subtitle: L10n.tr("spool.add.method.scan_hint"),
                    icon: "barcode.viewfinder"
                ) { step = .scanLabel }
                .khaytListRows()
                KhaytMethodRow(
                    title: L10n.tr("spool.add.method.nfc"),
                    subtitle: L10n.tr("spool.add.method.nfc_hint"),
                    icon: "wave.3.right"
                ) { step = .nfc }
                .khaytListRows()
                KhaytMethodRow(
                    title: L10n.tr("spool.add.method.manual"),
                    subtitle: L10n.tr("spool.add.method.manual_hint"),
                    icon: "keyboard"
                ) {
                    draft = SpoolDraft()
                    draft.sourceNote = L10n.tr("spool.add.manual_source")
                    step = .review
                }
                .khaytListRows()
            }
        }
        .khaytSheetList()
    }

    private var scanLabelView: some View {
        VStack(spacing: 20) {
            Spacer()
            KhaytHeroIcon(systemName: "camera.viewfinder")
            Text(L10n.tr("spool.add.scan.point"))
                .font(.title3.bold())
                .foregroundStyle(KhaytDesign.text)
            Text(L10n.tr("spool.add.scan.hint"))
                .font(.subheadline)
                .foregroundStyle(KhaytDesign.textDim)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button {
                showCamera = true
            } label: {
                Label(L10n.tr("spool.add.scan.camera"), systemImage: "camera.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal)
            Spacer()
        }
    }

    private var nfcView: some View {
        VStack(spacing: 20) {
            Spacer()
            KhaytHeroIcon(systemName: "nfc")
            Text(L10n.tr("spool.add.nfc.hold"))
                .font(.title3.bold())
                .foregroundStyle(KhaytDesign.text)
            if !nfc.isAvailable {
                Text(L10n.tr("nfc.unavailable"))
                    .foregroundStyle(KhaytDesign.warn)
                    .font(.caption)
            }
            Button {
                nfc.beginScan()
            } label: {
                Label(nfc.isScanning ? L10n.tr("spool.add.nfc.scanning") : L10n.tr("spool.add.nfc.scan"), systemImage: "wave.3.right")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!nfc.isAvailable || nfc.isScanning)
            .padding(.horizontal)

            if let tag = nfc.lastTag {
                TagPreviewCard(tag: tag)
                    .padding(.horizontal)
                Button(L10n.tr("spool.add.continue")) {
                    draft = SpoolDraft.from(tag: tag)
                    nfc.clearLastTag()
                    step = .review
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
                Button {
                    draft = SpoolDraft.from(tag: tag)
                    switch tag.standard {
                    case "OpenPrintTag": nfcWriteStandard = .openPrintTag
                    case "OpenSpool": nfcWriteStandard = .openSpool
                    default: nfcWriteStandard = .openTag3D
                    }
                    showWriteNFC = true
                } label: {
                    Label(L10n.tr("nfc.write.title"), systemImage: "square.and.pencil")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .padding(.horizontal)
            }
            Spacer()
        }
        .padding()
    }

    private func goBack() {
        switch step {
        case .scanLabel, .nfc:
            step = .chooseMethod
        default:
            step = .chooseMethod
        }
    }

    private func submit() async {
        guard canSyncToDesktop else {
            errorMessage = L10n.tr("offline.action_unavailable")
            return
        }
        isUploading = true
        errorMessage = nil
        defer { isUploading = false }
        do {
            _ = try await api.addSpool(draft: draft)
            if let inv = try? await api.fetchInventory() {
                CompanionDataCache.save { $0.inventory = inv }
            }
            onAdded()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Review form

struct SpoolReviewForm: View {
    @Binding var draft: SpoolDraft
    let isUploading: Bool
    var canSyncToDesktop = true
    var errorMessage: String?
    var onWriteNFC: (() -> Void)?
    let onSubmit: () -> Void

    var body: some View {
        Form {
            if let errorMessage, !errorMessage.isEmpty {
                Section {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(KhaytDesign.danger)
                        .khaytListRows()
                }
            }

            if !draft.sourceNote.isEmpty {
                Section {
                    Text(draft.sourceNote)
                        .font(.caption)
                        .foregroundStyle(KhaytDesign.textDim)
                        .khaytListRows()
                }
            }

            Section(header: Text(L10n.tr("spool.add.required"))) {
                TextField(L10n.tr("spool.add.material"), text: $draft.material)
                    .khaytListRows()
                TextField(L10n.tr("spool.add.weight"), text: Binding(
                    get: { String(draft.weightGrams) },
                    set: { draft.weightGrams = Int($0) ?? draft.weightGrams }
                ))
                .keyboardType(.numberPad)
                .khaytListRows()
            }

            Section(header: Text(L10n.tr("spool.add.optional"))) {
                TextField(L10n.tr("spool.brand"), text: $draft.brand)
                    .khaytListRows()
                TextField(L10n.tr("spool.sku"), text: $draft.sku)
                    .khaytListRows()
                TextField(L10n.tr("spool.batch"), text: $draft.lot)
                    .khaytListRows()
                TextField("\(L10n.tr("spool.print_temp")) (°C)", text: $draft.printTemp)
                    .keyboardType(.numberPad)
                    .khaytListRows()
                TextField("\(L10n.tr("spool.bed_temp")) (°C)", text: $draft.bedTemp)
                    .keyboardType(.numberPad)
                    .khaytListRows()
            }

            Section {
                if canSyncToDesktop {
                    Button(action: onSubmit) {
                        if isUploading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text(L10n.tr("spool.add.submit"))
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isUploading || draft.material.trimmingCharacters(in: .whitespaces).isEmpty)
                    .khaytListRows()
                }

                if let onWriteNFC {
                    Button(action: onWriteNFC) {
                        Label(L10n.tr("nfc.write.title"), systemImage: "wave.3.right")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(draft.material.trimmingCharacters(in: .whitespaces).isEmpty)
                    .khaytListRows()
                }
            } footer: {
                if !canSyncToDesktop {
                    Text(L10n.tr("spool.add.offline_footer"))
                        .font(.caption)
                }
            }
        }
        .khaytSheet()
        .foregroundStyle(KhaytDesign.text)
    }
}

// MARK: - Tag preview

struct TagPreviewCard: View {
    let tag: NFCFilamentTag

    var body: some View {
        KhaytCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    if let hex = tag.hex {
                        Circle()
                            .fill(Color(hex: hex) ?? KhaytDesign.textMuted)
                            .frame(width: 28, height: 28)
                    }
                    VStack(alignment: .leading) {
                        Text(tag.materialLabel.isEmpty ? L10n.tr("spool.tag.filament") : tag.materialLabel)
                            .font(.headline)
                            .foregroundStyle(KhaytDesign.text)
                        Text(tag.standard)
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.textDim)
                    }
                }
                HStack(spacing: 12) {
                    if let w = tag.weight { meta(L10n.tr("spool.tag.weight"), "\(w) g") }
                    if let p = tag.printTemp { meta(L10n.tr("spool.tag.print"), "\(p)°C") }
                    if let b = tag.bedTemp { meta(L10n.tr("spool.tag.bed"), "\(b)°C") }
                }
            }
        }
    }

    private func meta(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(KhaytDesign.textDim)
            Text(value).font(.caption.bold()).foregroundStyle(KhaytDesign.text)
        }
    }
}

extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt64(s, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
