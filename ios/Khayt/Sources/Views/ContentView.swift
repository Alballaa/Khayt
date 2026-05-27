import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        if appState.connection == nil {
            PairServerView()
        } else {
            RoleRootView()
        }
    }
}

struct RoleRootView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        switch appState.role {
        case .owner: OwnerHomeView()
        case .op: OperatorHomeView()
        case .customer: CustomerHomeView()
        }
    }
}
