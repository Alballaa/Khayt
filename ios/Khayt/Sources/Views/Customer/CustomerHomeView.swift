import SwiftUI

struct CustomerHomeView: View {
    var body: some View {
        TabView {
            NavigationStack { TrackOrderView() }
                .tabItem { Label("Track", systemImage: "magnifyingglass") }
            NavigationStack {
                SettingsForm()
                    .navigationTitle("Settings")
            }
            .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
