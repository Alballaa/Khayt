import CoreNFC
import Foundation

@MainActor
final class NFCReader: NSObject, ObservableObject {
    @Published var lastTag: NFCFilamentTag?
    @Published var lastError: String?
    @Published var isScanning = false

    private var session: NFCTagReaderSession?

    var isAvailable: Bool { NFCTagReaderSession.readingAvailable }

    func beginScan() {
        guard NFCTagReaderSession.readingAvailable else {
            lastError = "NFC is not available on this device."
            return
        }
        lastTag = nil
        lastError = nil
        isScanning = true
        session = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
        session?.alertMessage = "Hold your iPhone near the filament spool tag."
        session?.begin()
    }

    func invalidate() {
        session?.invalidate()
        session = nil
        isScanning = false
    }

    func clearLastTag() {
        lastTag = nil
        lastError = nil
    }
}

extension NFCReader: NFCTagReaderSessionDelegate {
    nonisolated func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    nonisolated func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        Task { @MainActor in
            self.isScanning = false
            self.session = nil
            if let nfcError = error as? NFCReaderError, nfcError.code == .readerSessionInvalidationErrorUserCanceled {
                return
            }
            if (error as NSError).code != 200 { // cancelled
                self.lastError = error.localizedDescription
            }
        }
    }

    nonisolated func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag detected.")
            return
        }
        session.connect(to: tag) { error in
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }
            self.readPayload(from: tag, session: session)
        }
    }

    nonisolated private func readPayload(from tag: NFCTag, session: NFCTagReaderSession) {
        switch tag {
        case .miFare(let miFare):
            miFare.readNDEF { message, error in
                self.handleNDEF(message: message, error: error, session: session, fallbackBytes: nil)
            }
        case .iso7816(let iso):
            iso.readNDEF { message, error in
                self.handleNDEF(message: message, error: error, session: session, fallbackBytes: nil)
            }
        case .iso15693(let iso):
            iso.readNDEF { message, error in
                self.handleNDEF(message: message, error: error, session: session, fallbackBytes: nil)
            }
        case .feliCa(let feliCa):
            feliCa.readNDEF { message, error in
                self.handleNDEF(message: message, error: error, session: session, fallbackBytes: nil)
            }
        @unknown default:
            session.invalidate(errorMessage: "Unsupported tag type.")
        }
    }

    nonisolated private func handleNDEF(
        message: NFCNDEFMessage?,
        error: Error?,
        session: NFCTagReaderSession,
        fallbackBytes: [UInt8]?
    ) {
        var allBytes: [UInt8] = fallbackBytes ?? []
        if let records = message?.records {
            for record in records {
                allBytes.append(contentsOf: record.payload)
                if record.typeNameFormat == .media,
                   let type = String(data: record.type, encoding: .utf8) {
                    let payload = [UInt8](record.payload)
                    if type == "application/opentag3d", let tag = parseOpenTag3DDirect(payload) {
                        finish(session: session, tag: tag)
                        return
                    }
                    if type == "application/vnd.openprinttag", case .success(let tag) = NFCParser.parse(bytes: payload) {
                        finish(session: session, tag: tag)
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
            finish(session: session, tag: tag)
        case .failure(let msg):
            session.invalidate(errorMessage: msg)
        }
    }

    nonisolated private func parseOpenTag3DDirect(_ bytes: [UInt8]) -> NFCFilamentTag? {
        if case .success(let tag) = NFCParser.parse(bytes: bytes) { return tag }
        return nil
    }

    nonisolated private func finish(session: NFCTagReaderSession, tag: NFCFilamentTag) {
        Task { @MainActor in
            self.lastTag = tag
            self.lastError = nil
            self.isScanning = false
        }
        session.alertMessage = "Tag read successfully."
        session.invalidate()
    }
}
