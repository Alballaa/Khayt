import SwiftUI

@main
struct KhaytCompanionApp: App {
    @StateObject private var settings: ConnectionSettings
    @StateObject private var api: KhaytAPIClient
    @StateObject private var health: ConnectionHealth
    @StateObject private var nfc = NFCReader()

    init() {
        let s = ConnectionSettings()
        let apiClient = KhaytAPIClient(settings: s)
        _settings = StateObject(wrappedValue: s)
        _api = StateObject(wrappedValue: apiClient)
        _health = StateObject(wrappedValue: ConnectionHealth(api: apiClient))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .environmentObject(api)
                .environmentObject(health)
                .environmentObject(nfc)
                .tint(Color(red: 0.39, green: 0.40, blue: 0.95))
        }
    }
}
