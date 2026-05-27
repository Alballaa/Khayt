import SwiftUI

@main
struct KhaytApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .tint(.accentColor)
        }
    }
}
