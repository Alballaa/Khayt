import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient

    let isOnboarding: Bool

    @State private var testResult: String?
    @State private var isTesting = false

    var body: some View {
        Form {
            Section {
                TextField("Shop name", text: $settings.shopLabel)
                TextField("Desktop IP or hostname", text: $settings.host)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Stepper("Port: \(settings.port)", value: $settings.port, in: 1024...65535)
                SecureField("LAN PIN (from Khayt Settings → LAN API)", text: $settings.pin)
            } header: {
                Text("Connection")
            } footer: {
                Text("On your Mac or PC running Khayt: enable **LAN REST API**, set **Listen on all network interfaces**, and note the owner LAN PIN. Use the computer’s local IP (e.g. 192.168.1.42). Default port is 3219.")
            }

            Section {
                Button {
                    Task { await testConnection() }
                } label: {
                    HStack {
                        Text("Test connection")
                        Spacer()
                        if isTesting { ProgressView() }
                    }
                }
                if let testResult {
                    Text(testResult)
                        .font(.caption)
                        .foregroundStyle(testResult.contains("OK") ? .green : .red)
                }
            }

            if isOnboarding {
                Section {
                    NavigationLink {
                        MainTabView()
                    } label: {
                        Text("Continue to app")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(!settings.isConfigured)
                }
            }
        }
        .navigationTitle(isOnboarding ? "Connect to Khayt" : "Settings")
    }

    private func testConnection() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let status = try await api.probeConnection()
            testResult = "OK — \(status.queued) jobs in queue."
        } catch {
            testResult = error.localizedDescription
        }
    }
}
