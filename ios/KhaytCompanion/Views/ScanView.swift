import SwiftUI

struct ScanView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var nfc: NFCReader

    @State private var isUploading = false
    @State private var successMessage: String?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Image(systemName: "wave.3.right.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(Color.accentColor)
                        .padding(.top, 24)

                    Text("Tap a spool tag")
                        .font(.title2.bold())
                    Text("Supports OpenTag3D and OpenPrintTag (Prusa). The spool is added to your Khayt inventory on the desktop app over Wi‑Fi.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    if !nfc.isAvailable {
                        Label("NFC is not available on this device.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                            .padding()
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
                            Task { await upload(tag) }
                        } label: {
                            if isUploading {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Label("Add to inventory", systemImage: "plus.circle.fill")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isUploading)
                    }

                    if let successMessage {
                        Text(successMessage)
                            .font(.subheadline)
                            .foregroundStyle(.green)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundStyle(.red)
                    }
                    if let err = nfc.lastError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                .padding()
            }
            .navigationTitle("Scan NFC")
            .onChange(of: nfc.lastTag?.material ?? "") { _, _ in
                successMessage = nil
                errorMessage = nil
            }
        }
    }

    private func upload(_ tag: NFCFilamentTag) async {
        isUploading = true
        successMessage = nil
        errorMessage = nil
        defer { isUploading = false }
        do {
            let spool = try await api.addSpool(from: tag)
            successMessage = "Added \(spool.displayLabel) — syncs to Khayt desktop."
            nfc.clearLastTag()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct TagPreviewCard: View {
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
                Text("Weight: \(w) g")
                    .font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt64(s, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
