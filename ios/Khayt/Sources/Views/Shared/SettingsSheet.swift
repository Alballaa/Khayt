import SwiftUI

struct SettingsForm: View {
    @Environment(AppState.self) private var appState
    var onDisconnect: (() -> Void)?

    var body: some View {
        Form {
            Section("Role") {
                Picker("Open Khayt as", selection: Binding(
                    get: { appState.role },
                    set: { appState.setRole($0) }
                )) {
                    ForEach(UserRole.allCases) { role in
                        Label(role.title, systemImage: role.systemImage).tag(role)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            if let conn = appState.connection {
                Section("Server") {
                    LabeledContent("URL", value: conn.baseURL.absoluteString)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    LabeledContent("PIN", value: conn.pin.isEmpty ? "—" : String(repeating: "•", count: conn.pin.count))
                }
            }

            Section {
                Button("Disconnect", role: .destructive) {
                    appState.disconnect()
                    onDisconnect?()
                }
            }
        }
    }
}

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SettingsForm(onDisconnect: { dismiss() })
                .navigationTitle("Settings")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
    }
}

struct StatusBadge: View {
    let status: OrderStatus

    var body: some View {
        Text(status.label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.tint.opacity(0.18), in: .capsule)
            .foregroundStyle(status.tint)
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String?

    init(icon: String, title: String, message: String? = nil) {
        self.icon = icon
        self.title = title
        self.message = message
    }

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            if let message { Text(message) }
        }
    }
}

struct ErrorBanner: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.horizontal)
    }
}
