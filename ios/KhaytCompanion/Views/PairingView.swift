import SwiftUI

/// First-run and re-pair flow: shop IP, port, owner LAN PIN (same as desktop kiosk).
struct PairingView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var step = 1
    @State private var testMessage: String?
    @State private var testOK = false
    @State private var isTesting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Pair with Khayt on your Mac or PC over Wi‑Fi. Your shop data stays on the desktop — this app is a remote control only.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section("1. Desktop LAN API") {
                    Label("Enable LAN REST API", systemImage: "checklist")
                    Label("Listen on all interfaces", systemImage: "antenna.radiowaves.left.and.right")
                    Label("Set Owner LAN PIN", systemImage: "key")
                }

                Section("2. Enter connection") {
                    TextField("Shop name", text: $settings.shopLabel)
                    TextField("Desktop IP (e.g. 192.168.1.42)", text: $settings.host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.decimalPad)
                    Stepper("Port: \(settings.port)", value: $settings.port, in: 1024...65535)
                    SecureField("Owner LAN PIN", text: $settings.pin)
                }

                Section("3. Verify") {
                    Button {
                        Task { await runPairingTest() }
                    } label: {
                        HStack {
                            Text("Test pairing")
                            Spacer()
                            if isTesting { ProgressView() }
                        }
                    }
                    .disabled(!settings.isConfigured || settings.pin.isEmpty || isTesting)

                    if let testMessage {
                        Text(testMessage)
                            .font(.caption)
                            .foregroundStyle(testOK ? .green : .red)
                    }
                }

                Section {
                    Button("Open companion") {
                        settings.isPaired = true
                    }
                    .disabled(!testOK)
                } footer: {
                    Text("Pairing checks reachability and PIN via GET /api/queue. See docs/LAN_API.md.")
                }
            }
            .navigationTitle("Pair with Khayt")
        }
    }

    private func runPairingTest() async {
        isTesting = true
        testOK = false
        testMessage = nil
        defer { isTesting = false }
        do {
            let status = try await api.validatePairing()
            testOK = true
            testMessage = "OK — \(status.queued) in queue, PIN accepted."
        } catch {
            testMessage = error.localizedDescription
        }
    }
}
