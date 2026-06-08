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
            ZStack {
                KhaytScreenBackground()
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
                                .foregroundStyle(KhaytDesign.text)
                            Text(L10n.tr("pairing.use_offline.footer"))
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textDim)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                    .padding(.bottom, 12)
                }
            }
            .khaytInlineScreen(title: L10n.tr("pairing.title"))
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ForEach(0..<totalSteps, id: \.self) { i in
                    Capsule()
                        .fill(i <= step ? KhaytDesign.brand : KhaytDesign.textFaint)
                        .frame(height: 4)
                }
            }
            Text(String(format: L10n.tr("pairing.step"), step + 1, totalSteps))
                .font(.caption)
                .foregroundStyle(KhaytDesign.textDim)
        }
    }

    private var bottomBar: some View {
        HStack {
            if step > 0 {
                KhaytGhostButton(title: L10n.tr("common.back")) { step -= 1 }
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
            KhaytCard {
                VStack(alignment: .leading, spacing: 10) {
                    checklistRow(L10n.tr("pairing.desktop.check1"), icon: "network")
                    checklistRow(L10n.tr("pairing.desktop.check2"), icon: "antenna.radiowaves.left.and.right")
                    checklistRow(L10n.tr("pairing.desktop.check3"), icon: "key.fill")
                }
            }
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

                KhaytCard {
                    VStack(alignment: .leading, spacing: 12) {
                        pairingField(L10n.tr("pairing.connection.shop_optional"), text: $settings.shopLabel)
                        pairingField(L10n.tr("pairing.connection.ip"), text: $settings.host, keyboard: .URL)
                        Stepper(String(format: L10n.tr("settings.port"), settings.port), value: $settings.port, in: 1024...65535)
                            .foregroundStyle(KhaytDesign.text)
                        SecureField(L10n.tr("pairing.connection.pin"), text: $settings.pin)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                KhaytCard(padding: 12) {
                    DisclosureGroup(L10n.tr("pairing.connection.ip_help"), isExpanded: $showIPHelp) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(L10n.tr("pairing.connection.ip_help_terminal"))
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textDim)
                            Text("ipconfig getifaddr en0")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(KhaytDesign.text)
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(KhaytDesign.surface2, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusSM))
                            Text(L10n.tr("pairing.connection.ip_help_hint"))
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textDim)
                        }
                        .padding(.top, 4)
                    }
                    .font(.subheadline)
                    .foregroundStyle(KhaytDesign.text)
                }
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
                KhaytFeedbackPanel(
                    tone: testOK ? .success : .error,
                    message: testMessage
                )
                .padding(.horizontal)
            }

            Spacer()
        }
    }

    private func stepCard(icon: String, title: String, body: String) -> some View {
        VStack(spacing: 12) {
            KhaytHeroIcon(systemName: icon)
            Text(title)
                .font(.title2.bold())
                .foregroundStyle(KhaytDesign.text)
                .multilineTextAlignment(.center)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(KhaytDesign.textDim)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 8)
    }

    private func checklistRow(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(KhaytDesign.text)
    }

    private func pairingField(_ placeholder: String, text: Binding<String>, keyboard: UIKeyboardType = .default) -> some View {
        TextField(placeholder, text: text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .textFieldStyle(.roundedBorder)
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
