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
                        Text(L10n.tr("settings.lan_status"))
                        Spacer()
                        ConnectionBadge()
                    }
                    .khaytListRows()
                    if let checked = health.lastChecked {
                        Text(checked.formatted(date: .omitted, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.textMuted)
                            .khaytListRows()
                    }
                }

                if settings.prefersOfflineTools && !settings.isPaired {
                    Section {
                        Text(L10n.tr("offline.welcome.body"))
                            .font(.subheadline)
                            .foregroundStyle(KhaytDesign.textDim)
                            .khaytListRows()
                    } header: {
                        Text(L10n.tr("offline.welcome.title"))
                    }
                }

                Section(
                    header: Text(L10n.tr("settings.connection")),
                    footer: Text(L10n.tr("settings.connection.footer"))
                ) {
                    TextField(L10n.tr("settings.shop_name"), text: $settings.shopLabel)
                        .khaytListRows()
                    TextField(L10n.tr("settings.host"), text: $settings.host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .khaytListRows()
                    if let err = settings.hostValidationError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.danger)
                            .khaytListRows()
                    } else if settings.isConfigured {
                        Text("\(L10n.tr("settings.endpoint")) \(settings.displayURL)")
                            .font(.caption)
                            .foregroundStyle(KhaytDesign.textMuted)
                            .khaytListRows()
                    }
                    Stepper(String(format: L10n.tr("settings.port"), settings.port), value: $settings.port, in: 1024...65535)
                        .khaytListRows()
                    SecureField(L10n.tr("settings.pin"), text: $settings.pin)
                        .khaytListRows()
                }

                Section(header: Text(L10n.tr("settings.language"))) {
                    Picker(L10n.tr("settings.language"), selection: $settings.appLanguage) {
                        ForEach(AppLanguage.allCases) { lang in
                            Text(lang.label).tag(lang)
                        }
                    }
                    .khaytListRows()
                }

                Section(header: Text(L10n.tr("settings.appearance"))) {
                    Picker(L10n.tr("settings.appearance"), selection: $settings.appAppearance) {
                        ForEach(AppAppearance.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .khaytListRows()
                }

                Section(
                    header: Text(L10n.tr("settings.notifications")),
                    footer: Text(L10n.tr("settings.notify.footer"))
                ) {
                    Toggle(L10n.tr("settings.notify.queue"), isOn: $settings.notifyQueueChanges)
                        .khaytListRows()
                    Toggle(L10n.tr("settings.notify.connection"), isOn: $settings.notifyConnection)
                        .khaytListRows()
                    Toggle(L10n.tr("settings.notify.overdue"), isOn: $settings.notifyOverdue)
                        .khaytListRows()
                    Toggle(L10n.tr("settings.notify.low_stock"), isOn: $settings.notifyLowStock)
                        .khaytListRows()
                    Button {
                        Task { await CompanionNotifications.shared.requestAuthorizationIfNeeded() }
                    } label: {
                        Text(L10n.tr("settings.allow_notifications"))
                    }
                    .khaytListRows()
                }

                Section(header: Text(L10n.tr("settings.shop_data"))) {
                    NavigationLink {
                        ClientsView()
                    } label: {
                        Label(L10n.tr("clients.title"), systemImage: "person.2")
                    }
                    .khaytListRows()
                }

                Section(
                    header: Text(L10n.tr("settings.widget")),
                    footer: Text(L10n.tr("settings.widget.footer"))
                ) {
                    Link(L10n.tr("settings.widget_guide"), destination: URL(string: "https://github.com/Alballaa/Khayt/blob/main/ios/XCODE_WIDGET.md")!)
                        .khaytListRows()
                }

                Section {
                    Button {
                        Task { await testConnection() }
                    } label: {
                        HStack {
                            Text(L10n.tr("settings.retest"))
                            Spacer()
                            if isTesting { ProgressView() }
                        }
                    }
                    .khaytListRows()
                    if let testResult {
                        Text(testResult)
                            .font(.caption)
                            .foregroundStyle(testResult.hasPrefix("OK") ? KhaytDesign.ok : KhaytDesign.danger)
                            .khaytListRows()
                    }
                }

                Section(footer: Text(L10n.tr("settings.unpair.footer"))) {
                    Button(L10n.tr("settings.unpair"), role: .destructive) {
                        settings.unpair()
                    }
                    .khaytListRows()
                }

                Section(header: Text(L10n.tr("settings.docs"))) {
                    Link(
                        L10n.tr("settings.docs"),
                        destination: URL(string: "https://github.com/Alballaa/Khayt/blob/main/docs/LAN_API.md")!
                    )
                    .khaytListRows()
                }
            }
            .khaytForm()
            .foregroundStyle(KhaytDesign.text)
            .khaytScreen(title: L10n.tr("tab.settings"))
        }
    }

    private func testConnection() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let status = try await api.validatePairing()
            testResult = String(format: L10n.tr("settings.test_ok"), status.queued)
            settings.isPaired = true
            settings.prefersOfflineTools = false
            await health.refresh()
        } catch {
            testResult = error.localizedDescription
        }
    }
}
