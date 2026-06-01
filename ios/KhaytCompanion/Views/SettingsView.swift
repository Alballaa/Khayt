import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var testResult: String?
    @State private var isTesting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("LAN status")
                        Spacer()
                        ConnectionBadge()
                    }
                    if let checked = health.lastChecked {
                        Text("Last checked \(checked.formatted(date: .omitted, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Connection") {
                    TextField("Shop name", text: $settings.shopLabel)
                    TextField("Desktop IP or hostname", text: $settings.host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Stepper("Port: \(settings.port)", value: $settings.port, in: 1024...65535)
                    SecureField("Owner LAN PIN", text: $settings.pin)
                } footer: {
                    Text("Same PIN as Khayt → Settings → LAN API / kiosk. Desktop v2.2.1+ required.")
                }

                Section {
                    Button {
                        Task { await testConnection() }
                    } label: {
                        HStack {
                            Text("Re-test pairing")
                            Spacer()
                            if isTesting { ProgressView() }
                        }
                    }
                    if let testResult {
                        Text(testResult)
                            .font(.caption)
                            .foregroundStyle(testResult.hasPrefix("OK") ? .green : .red)
                    }
                }

                Section {
                    Button("Unpair this device", role: .destructive) {
                        settings.isPaired = false
                    }
                } footer: {
                    Text("Clears paired state; PIN remains in Keychain until you change it.")
                }

                Section("Documentation") {
                    Link("LAN API reference", destination: URL(string: "https://github.com/Alballaa/Khayt/blob/main/docs/LAN_API.md")!)
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func testConnection() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let status = try await api.validatePairing()
            testResult = "OK — \(status.queued) in queue."
            await health.refresh()
        } catch {
            testResult = error.localizedDescription
        }
    }
}
