import SwiftUI
import VisionKit

/// Camera scanner for filament labels — collects QR/barcode payloads **and** visible printed text.
struct BarcodeScannerView: View {
    @Binding var scannedText: String?
    @Environment(\.dismiss) private var dismiss

    /// When true, waits for you to tap **Use label text** so SKU / batch / temps can be read from the label.
    var captureFullLabel: Bool = true

    @State private var liveLineCount = 0
    @State private var recognizedItems: [RecognizedItem] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            ScannerHost(
                captureFullLabel: captureFullLabel,
                scannedText: $scannedText,
                dismiss: dismiss,
                liveLineCount: $liveLineCount,
                recognizedItems: $recognizedItems
            )
            .ignoresSafeArea()

            if captureFullLabel {
                captureOverlay
            }
        }
    }

    private var captureOverlay: some View {
        VStack(spacing: 12) {
            VStack(spacing: 6) {
                Text("Scan the whole label")
                    .font(.headline)
                Text("Include printed text for SKU, batch, and temperatures — not only the QR code.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if liveLineCount > 0 {
                    Text("\(liveLineCount) text region\(liveLineCount == 1 ? "" : "s") detected")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal)

            Button {
                finishLabelCapture()
            } label: {
                Label("Use label text", systemImage: "checkmark.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(liveLineCount == 0)
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .padding(.top, 12)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private func finishLabelCapture() {
        let blob = ScannerHost.aggregateRecognizedText(from: recognizedItems)
        guard !blob.isEmpty else { return }
        scannedText = blob
        dismiss()
    }

    static func isSupported() -> Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }
}

// MARK: - UIKit host

private struct ScannerHost: UIViewControllerRepresentable {
    let captureFullLabel: Bool
    @Binding var scannedText: String?
    let dismiss: DismissAction
    @Binding var liveLineCount: Int
    @Binding var recognizedItems: [RecognizedItem]

    func makeCoordinator() -> Coordinator {
        Coordinator(
            captureFullLabel: captureFullLabel,
            scannedText: $scannedText,
            dismiss: dismiss,
            liveLineCount: $liveLineCount,
            recognizedItems: $recognizedItems
        )
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let types: Set<DataScannerViewController.RecognizedDataType> = [.barcode(), .text()]
        let scanner = DataScannerViewController(
            recognizedDataTypes: types,
            qualityLevel: captureFullLabel ? .accurate : .balanced,
            recognizesMultipleItems: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        context.coordinator.scanner = uiViewController
        context.coordinator.startIfNeeded(scanner: uiViewController)
        context.coordinator.refreshLiveCount()
    }

    static func aggregateRecognizedText(from items: [RecognizedItem]) -> String {
        var lines: [String] = []
        var seen = Set<String>()
        for item in items {
            let piece: String?
            switch item {
            case .barcode(let barcode):
                piece = barcode.payloadStringValue
            case .text(let text):
                piece = text.transcript
            @unknown default:
                piece = nil
            }
            guard let piece else { continue }
            let trimmed = piece.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let key = trimmed.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            lines.append(trimmed)
        }
        return lines.joined(separator: "\n")
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let captureFullLabel: Bool
        @Binding var scannedText: String?
        let dismiss: DismissAction
        @Binding var liveLineCount: Int
        @Binding var recognizedItems: [RecognizedItem]

        weak var scanner: DataScannerViewController?
        private var didStart = false

        init(
            captureFullLabel: Bool,
            scannedText: Binding<String?>,
            dismiss: DismissAction,
            liveLineCount: Binding<Int>,
            recognizedItems: Binding<[RecognizedItem]>
        ) {
            self.captureFullLabel = captureFullLabel
            _scannedText = scannedText
            self.dismiss = dismiss
            _liveLineCount = liveLineCount
            _recognizedItems = recognizedItems
        }

        func startIfNeeded(scanner: DataScannerViewController) {
            guard !didStart else { return }
            didStart = true
            self.scanner = scanner
            Task { @MainActor in
                try? await scanner.startScanning()
            }
        }

        func refreshLiveCount() {
            let count = ScannerHost.aggregateRecognizedText(from: recognizedItems)
                .components(separatedBy: .newlines)
                .filter { !$0.isEmpty }
                .count
            if liveLineCount != count {
                liveLineCount = count
            }
        }

        private func syncItems(_ allItems: [RecognizedItem]) {
            recognizedItems = allItems
            refreshLiveCount()
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            if captureFullLabel {
                refreshLiveCount()
            } else {
                applyQuick(item)
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            if captureFullLabel {
                syncItems(allItems)
            } else if let first = addedItems.first {
                applyQuick(first)
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            if captureFullLabel {
                syncItems(allItems)
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            if captureFullLabel {
                syncItems(allItems)
            }
        }

        private func applyQuick(_ item: RecognizedItem) {
            switch item {
            case .barcode(let barcode):
                if let value = barcode.payloadStringValue, !value.isEmpty {
                    scannedText = value
                    dismiss()
                }
            case .text(let text):
                let transcript = text.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                if !transcript.isEmpty {
                    scannedText = transcript
                    dismiss()
                }
            @unknown default:
                break
            }
        }
    }
}
