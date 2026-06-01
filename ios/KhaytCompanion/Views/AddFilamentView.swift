import SwiftUI

/// Add inventory spools via label scan (QR/barcode/text) or NFC tag.
struct AddFilamentView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var nfc: NFCReader

    enum Mode: String, CaseIterable, Identifiable {
        case label = "Label"
        case nfc = "NFC"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .label
    @State private var showScanner = false
    @State private var scannedRaw: String?
    @State private var parsed: ParsedFilamentLabel?
    @State private var material = ""
    @State private var weightText = "1000"
    @State private var isUploading = false
    @State private var successMessage: String?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Picker("Input", selection: $mode) {
                        ForEach(Mode.allCases) { m in
                            Text(m.rawValue).tag(m)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    switch mode {
                    case .label:
                        labelSection
                    case .nfc:
                        nfcSection
                    }

                    if let successMessage {
                        Text(successMessage)
                            .font(.subheadline)
                            .foregroundStyle(.green)
                            .multilineTextAlignment(.center)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding()
            }
            .navigationTitle("Add filament")
            .sheet(isPresented: $showScanner) {
                if BarcodeScannerView.isSupported() {
                    BarcodeScannerView(scannedText: $scannedRaw)
                        .ignoresSafeArea()
                } else {
                    Text("Camera scanning is not available on this device.")
                        .padding()
                }
            }
            .onChange(of: scannedRaw) { _, newValue in
                guard let newValue else { return }
                applyScannedText(newValue)
            }
            .onChange(of: mode) { _, _ in
                successMessage = nil
                errorMessage = nil
            }
        }
    }

    private var labelSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 52))
                .foregroundStyle(Color.accentColor)

            Text("Scan spool label")
                .font(.title2.bold())
            Text("Point the camera at the QR code or barcode on the spool. Khayt reads the code and suggests material, brand, and color.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                showScanner = true
            } label: {
                Label("Scan label", systemImage: "camera.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            if parsed != nil || !material.isEmpty {
                reviewCard
            }
        }
    }

    private var nfcSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "wave.3.right.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(Color.accentColor)

            Text("Tap NFC tag")
                .font(.title2.bold())
            Text("Hold your iPhone near the spool. Supports OpenTag3D and OpenPrintTag (Prusa).")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if !nfc.isAvailable {
                Label("NFC is not available on this device.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            }

            Button {
                nfc.beginScan()
            } label: {
                Label(nfc.isScanning ? "Scanning…" : "Scan NFC tag", systemImage: "nfc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!nfc.isAvailable || nfc.isScanning || isUploading)

            if let tag = nfc.lastTag {
                TagPreviewCard(tag: tag)
                Button {
                    Task { await uploadNFC(tag) }
                } label: {
                    uploadButtonLabel("Add to inventory")
                }
                .buttonStyle(.borderedProminent)
                .disabled(isUploading)
            }
        }
        .onChange(of: nfc.lastTag?.material ?? "") { _, _ in
            successMessage = nil
            errorMessage = nil
        }
    }

    private var reviewCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let parsed, !parsed.rawText.isEmpty {
                Text("Scanned")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                Text(parsed.rawText)
                    .font(.caption)
                    .lineLimit(3)
            }

            TextField("Material name", text: $material)
            TextField("Weight (grams)", text: $weightText)
                .keyboardType(.numberPad)

            Button {
                Task { await uploadManual() }
            } label: {
                uploadButtonLabel("Add to Khayt inventory")
            }
            .buttonStyle(.borderedProminent)
            .disabled(isUploading || material.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func uploadButtonLabel(_ title: String) -> some View {
        if isUploading {
            ProgressView().frame(maxWidth: .infinity)
        } else {
            Label(title, systemImage: "plus.circle.fill").frame(maxWidth: .infinity)
        }
    }

    private func applyScannedText(_ text: String) {
        let p = FilamentLabelParser.parse(text: text)
        parsed = p
        material = p.suggestedMaterial
        successMessage = nil
        errorMessage = nil
    }

    private func uploadManual() async {
        let name = material.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, let weight = Int(weightText), weight > 0 else {
            errorMessage = "Enter a material name and weight in grams."
            return
        }
        isUploading = true
        successMessage = nil
        errorMessage = nil
        defer { isUploading = false }
        do {
            let brand = parsed?.brand
            let spool = try await api.addSpool(material: name, weight: weight, brand: brand)
            successMessage = "Added \(spool.displayLabel) on your desktop."
            material = ""
            weightText = "1000"
            parsed = nil
            scannedRaw = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func uploadNFC(_ tag: NFCFilamentTag) async {
        isUploading = true
        successMessage = nil
        errorMessage = nil
        defer { isUploading = false }
        do {
            let spool = try await api.addSpool(from: tag)
            successMessage = "Added \(spool.displayLabel) on your desktop."
            nfc.clearLastTag()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Shared UI (NFC preview)

struct TagPreviewCard: View {
    let tag: NFCFilamentTag

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let hex = tag.hex {
                    Circle()
                        .fill(Color(hex: hex) ?? .gray)
                        .frame(width: 28, height: 28)
                }
                VStack(alignment: .leading) {
                    Text(tag.materialLabel.isEmpty ? "Filament tag" : tag.materialLabel)
                        .font(.headline)
                    Text(tag.standard)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let w = tag.weight {
                Text("Weight: \(w) g").font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
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
