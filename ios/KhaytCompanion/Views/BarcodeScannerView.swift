import SwiftUI
import VisionKit

/// Camera scanner for QR codes and barcodes on filament spool labels.
struct BarcodeScannerView: UIViewControllerRepresentable {
    @Binding var scannedText: String?
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(scannedText: $scannedText, dismiss: dismiss)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let types: Set<DataScannerViewController.RecognizedDataType> = [.barcode(), .text()]
        let scanner = DataScannerViewController(
            recognizedDataTypes: types,
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        context.coordinator.startIfNeeded(scanner: uiViewController)
    }

    static func isSupported() -> Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        @Binding var scannedText: String?
        let dismiss: DismissAction
        private var didStart = false

        init(scannedText: Binding<String?>, dismiss: DismissAction) {
            _scannedText = scannedText
            self.dismiss = dismiss
        }

        func startIfNeeded(scanner: DataScannerViewController) {
            guard !didStart else { return }
            didStart = true
            Task { @MainActor in
                try? await scanner.startScanning()
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            apply(item)
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            if let first = addedItems.first {
                apply(first)
            }
        }

        private func apply(_ item: RecognizedItem) {
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
