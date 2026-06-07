import SwiftUI

/// Guided setup: connect the companion to Khayt desktop over Wi‑Fi.
struct PairingView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var step = 0
    @State private var testMessage: String?
    @State private var testOK = false
    @State private var isTesting = false
    @State private var showIPHelp = false

    private let totalSteps = 4

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressHeader
                    .padding()

                TabView(selection: $step) {
                    welcomeStep.tag(0)
                    desktopStep.tag(1)
                    connectionStep.tag(2)
                    verifyStep.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: step)

                bottomBar
                    .padding()

                Button {
                    settings.prefersOfflineTools = true
                } label: {
                    VStack(spacing: 4) {
                        Text(L10n.tr("pairing.use_offline"))
                            .font(.subheadline.weight(.semibold))
                        Text(L10n.tr("pairing.use_offline.footer"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
                .padding(.bottom, 12)
            }
            .navigationTitle(L10n.tr("pairing.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ForEach(0..<totalSteps, id: \.self) { i in
                    Capsule()
                        .fill(i <= step ? Color.accentColor : Color.secondary.opacity(0.25))
                        .frame(height: 4)
                }
            }
            Text(String(format: L10n.tr("pairing.step"), step + 1, totalSteps))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var bottomBar: some View {
        HStack {
            if step > 0 {
                Button(L10n.tr("common.back")) { step -= 1 }
            }
            Spacer()
            if step < totalSteps - 1 {
                Button(L10n.tr("pairing.continue")) { step += 1 }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canAdvance)
            } else {
                Button(L10n.tr("pairing.open")) {
                    settings.isPaired = true
                    settings.prefersOfflineTools = false
                }
                .buttonStyle(.borderedProminent)
                .disabled(!testOK)
            }
        }
    }

    private var canAdvance: Bool {
        switch step {
        case 2: return settings.isConfigured && !settings.pin.isEmpty
        default: return true
        }
    }

    private var welcomeStep: some View {
        stepCard(
            icon: "iphone.and.arrow.forward",
            title: L10n.tr("pairing.welcome.title"),
            body: L10n.tr("pairing.welcome.body")
        )
    }

    private var desktopStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepCard(
                icon: "desktopcomputer",
                title: L10n.tr("pairing.desktop.title"),
                body: L10n.tr("pairing.desktop.body")
            )
            VStack(alignment: .leading, spacing: 10) {
                checklistRow(L10n.tr("pairing.desktop.check1"), icon: "network")
                checklistRow(L10n.tr("pairing.desktop.check2"), icon: "antenna.radiowaves.left.and.right")
                checklistRow(L10n.tr("pairing.desktop.check3"), icon: "key.fill")
            }
            .padding()
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal)
    }

    private var connectionStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                stepCard(
                    icon: "link",
                    title: L10n.tr("pairing.connection.title"),
                    body: L10n.tr("pairing.connection.body")
                )

                Group {
                    TextField(L10n.tr("pairing.connection.shop_optional"), text: $settings.shopLabel)
                    TextField(L10n.tr("pairing.connection.ip"), text: $settings.host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Stepper(String(format: L10n.tr("settings.port"), settings.port), value: $settings.port, in: 1024...65535)
                    SecureField(L10n.tr("pairing.connection.pin"), text: $settings.pin)
                }
                .textFieldStyle(.roundedBorder)

                DisclosureGroup(L10n.tr("pairing.connection.ip_help"), isExpanded: $showIPHelp) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L10n.tr("pairing.connection.ip_help_terminal"))
                            .font(.caption)
                        Text("ipconfig getifaddr en0")
                            .font(.system(.caption, design: .monospaced))
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                        Text(L10n.tr("pairing.connection.ip_help_hint"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)
                }
                .font(.subheadline)
            }
            .padding(.horizontal)
        }
        .onChange(of: settings.host) { _, _ in invalidatePairingTest() }
        .onChange(of: settings.port) { _, _ in invalidatePairingTest() }
        .onChange(of: settings.pin) { _, _ in invalidatePairingTest() }
    }

    private var verifyStep: some View {
        VStack(spacing: 20) {
            stepCard(
                icon: "checkmark.shield",
                title: L10n.tr("pairing.verify.title"),
                body: L10n.tr("pairing.verify.body")
            )
            .padding(.horizontal)

            Button {
                Task { await runPairingTest() }
            } label: {
                HStack {
                    Label(L10n.tr("pairing.verify.test"), systemImage: "bolt.fill")
                    Spacer()
                    if isTesting { ProgressView() }
                }
                .padding()
            }
            .buttonStyle(.borderedProminent)
            .disabled(!settings.isConfigured || settings.pin.isEmpty || isTesting)
            .padding(.horizontal)

            if let testMessage {
                HStack(spacing: 8) {
                    Image(systemName: testOK ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(testOK ? .green : .red)
                    Text(testMessage)
                        .font(.subheadline)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }

            Spacer()
        }
    }

    private func stepCard(icon: String, title: String, body: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 8)
    }

    private func checklistRow(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
    }

    private func invalidatePairingTest() {
        testOK = false
        testMessage = nil
    }

    private func runPairingTest() async {
        isTesting = true
        testOK = false
        testMessage = nil
        defer { isTesting = false }
        do {
            let status = try await api.validatePairing()
            testOK = true
            testMessage = String(format: L10n.tr("pairing.verify.success"), status.queued)
        } catch {
            testMessage = error.localizedDescription
        }
    }
}
