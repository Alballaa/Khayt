import CoreNFC
import Foundation

/// NFC spool reader. Requires `KhaytCompanion-NFC.entitlements` + paid Apple Developer account for hardware NFC.
final class NFCReader: NSObject, ObservableObject {
    @MainActor @Published var lastTag: NFCFilamentTag?
    @MainActor @Published var lastError: String?
    @MainActor @Published var isScanning = false

    private var session: NFCTagReaderSession?

    @MainActor
    var isAvailable: Bool { NFCTagReaderSession.readingAvailable }

    @MainActor
    func beginScan() {
        guard NFCTagReaderSession.readingAvailable else {
            lastError = "NFC is not available on this device or simulator."
            return
        }
        lastTag = nil
        lastError = nil
        isScanning = true
        session = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
        session?.alertMessage = "Hold your iPhone near the filament spool tag."
        session?.begin()
    }

    @MainActor
    func invalidate() {
        session?.invalidate()
        session = nil
        isScanning = false
    }

    @MainActor
    func clearLastTag() {
        lastTag = nil
        lastError = nil
    }

    @MainActor
    private func finish(session: NFCTagReaderSession, tag: NFCFilamentTag) {
        lastTag = tag
        lastError = nil
        isScanning = false
        session.alertMessage = "Tag read successfully."
        session.invalidate()
    }
}

extension NFCReader: NFCTagReaderSessionDelegate {
    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        Task { @MainActor in
            isScanning = false
            self.session = nil
            if let nfcError = error as? NFCReaderError,
               nfcError.code == .readerSessionInvalidationErrorUserCanceled {
                return
            }
            if (error as NSError).code != 200 {
                lastError = error.localizedDescription
            }
        }
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag detected.")
            return
        }
        session.connect(to: tag) { [weak self] error in
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }
            self?.readPayload(from: tag, session: session)
        }
    }

    private func readPayload(from tag: NFCTag, session: NFCTagReaderSession) {
        let handle: (NFCNDEFMessage?, Error?) -> Void = { [weak self] message, error in
            self?.handleNDEF(message: message, error: error, session: session)
        }
        switch tag {
        case .miFare(let miFare):
            miFare.readNDEF(completionHandler: handle)
        case .iso7816(let iso):
            iso.readNDEF(completionHandler: handle)
        case .iso15693(let iso):
            iso.readNDEF(completionHandler: handle)
        case .feliCa(let feliCa):
            feliCa.readNDEF(completionHandler: handle)
        @unknown default:
            session.invalidate(errorMessage: "Unsupported tag type.")
        }
    }

    private func handleNDEF(message: NFCNDEFMessage?, error: Error?, session: NFCTagReaderSession) {
        var allBytes: [UInt8] = []
        if let records = message?.records {
            for record in records {
                allBytes.append(contentsOf: record.payload)
                if record.typeNameFormat == .media,
                   let type = String(data: record.type, encoding: .utf8) {
                    let payload = [UInt8](record.payload)
                    if type == "application/opentag3d",
                       case .success(let tag) = NFCParser.parse(bytes: payload) {
                        Task { @MainActor in self.finish(session: session, tag: tag) }
                        return
                    }
                    if type == "application/vnd.openprinttag",
                       case .success(let tag) = NFCParser.parse(bytes: payload) {
                        Task { @MainActor in self.finish(session: session, tag: tag) }
                        return
                    }
                }
            }
        }
        if allBytes.isEmpty {
            session.invalidate(errorMessage: error?.localizedDescription ?? "Could not read tag.")
            return
        }
        switch NFCParser.parse(bytes: allBytes) {
        case .success(let tag):
            Task { @MainActor in self.finish(session: session, tag: tag) }
        case .failure(let msg):
            session.invalidate(errorMessage: msg)
        }
    }
}
