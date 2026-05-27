import SwiftUI

struct PairServerView: View {
    @Environment(AppState.self) private var appState

    @State private var urlText: String = "http://"
    @State private var pinText: String = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(systemName: "scale.3d")
                        .font(.system(size: 56, weight: .light))
                        .foregroundStyle(.tint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    Text("Pair with your Khayt desktop")
                        .font(.title2.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .center)
                    Text("On the desktop, open Settings → LAN Server, start the server, and copy the URL and PIN.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)

                Section("Server") {
                    TextField("http://192.168.1.42:3219", text: $urlText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("PIN (optional)", text: $pinText)
                        .keyboardType(.numberPad)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        if isConnecting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Connect").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isConnecting || !isValidURL)
                }
            }
            .navigationTitle("Khayt")
        }
    }

    private var isValidURL: Bool {
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespaces)),
              let scheme = url.scheme, ["http", "https"].contains(scheme.lowercased()),
              url.host?.isEmpty == false else { return false }
        return true
    }

    private func connect() async {
        errorMessage = nil
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespaces)) else {
            errorMessage = "Invalid URL"
            return
        }
        isConnecting = true
        defer { isConnecting = false }

        let candidate = ServerConnection(baseURL: url, pin: pinText)
        let client = APIClient(connection: candidate)
        do {
            _ = try await client.ping()
            appState.connect(baseURL: url, pin: pinText)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
