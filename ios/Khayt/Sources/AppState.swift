import Foundation
import Observation

enum UserRole: String, CaseIterable, Identifiable, Codable {
    case owner, op, customer

    var id: String { rawValue }

    var title: String {
        switch self {
        case .owner: "Owner"
        case .op: "Operator"
        case .customer: "Customer"
        }
    }

    var systemImage: String {
        switch self {
        case .owner: "chart.bar.fill"
        case .op: "wrench.and.screwdriver.fill"
        case .customer: "person.fill"
        }
    }
}

struct ServerConnection: Equatable, Codable {
    var baseURL: URL
    var pin: String
}

@Observable
final class AppState {
    var connection: ServerConnection?
    var role: UserRole
    var api: APIClient?

    private let roleKey = "khayt.role"

    init() {
        let stored = UserDefaults.standard.string(forKey: roleKey).flatMap(UserRole.init(rawValue:))
        self.role = stored ?? .owner
        self.connection = KeychainStore.loadConnection()
        if let connection {
            self.api = APIClient(connection: connection)
        }
    }

    func connect(baseURL: URL, pin: String) {
        let conn = ServerConnection(baseURL: baseURL, pin: pin)
        connection = conn
        api = APIClient(connection: conn)
        KeychainStore.saveConnection(conn)
    }

    func disconnect() {
        connection = nil
        api = nil
        KeychainStore.clearConnection()
    }

    func setRole(_ role: UserRole) {
        self.role = role
        UserDefaults.standard.set(role.rawValue, forKey: roleKey)
    }
}
