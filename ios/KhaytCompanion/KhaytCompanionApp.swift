import SwiftUI

@main
struct KhaytCompanionApp: App {
    @StateObject private var settings: ConnectionSettings
    @StateObject private var api: KhaytAPIClient
    @StateObject private var nfc = NFCReader()

    init() {
        let s = ConnectionSettings()
        _settings = StateObject(wrappedValue: s)
        _api = StateObject(wrappedValue: KhaytAPIClient(settings: s))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .environmentObject(api)
                .environmentObject(nfc)
                .tint(Color(red: 0.39, green: 0.40, blue: 0.95))
        }
    }
}
