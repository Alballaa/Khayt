import Foundation
import Security

@MainActor
final class ConnectionSettings: ObservableObject {
    @Published var host: String {
        didSet { UserDefaults.standard.set(host, forKey: Keys.host) }
    }
    @Published var port: Int {
        didSet { UserDefaults.standard.set(port, forKey: Keys.port) }
    }
    @Published var pin: String {
        didSet { KeychainHelper.set(pin, for: Keys.pinKeychain) }
    }
    @Published var isPaired: Bool {
        didSet { UserDefaults.standard.set(isPaired, forKey: Keys.paired) }
    }
    @Published var shopLabel: String {
        didSet { UserDefaults.standard.set(shopLabel, forKey: Keys.shopLabel) }
    }

    private enum Keys {
        static let host = "khayt.host"
        static let port = "khayt.port"
        static let shopLabel = "khayt.shopLabel"
        static let pinKeychain = "khayt.lanPin"
        static let paired = "khayt.paired"
    }

    init() {
        let defaults = UserDefaults.standard
        host = defaults.string(forKey: Keys.host) ?? ""
        port = defaults.object(forKey: Keys.port) as? Int ?? 3219
        shopLabel = defaults.string(forKey: Keys.shopLabel) ?? "My Shop"
        isPaired = defaults.bool(forKey: Keys.paired)
        pin = KeychainHelper.get(Keys.pinKeychain) ?? ""
    }

    var baseURL: URL? {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        var hostPart = trimmed
        if hostPart.hasPrefix("http://") { hostPart = String(hostPart.dropFirst(7)) }
        if hostPart.hasPrefix("https://") { hostPart = String(hostPart.dropFirst(8)) }
        if hostPart.hasSuffix("/") { hostPart = String(hostPart.dropLast()) }
        return URL(string: "http://\(hostPart):\(port)")
    }

    var isConfigured: Bool { baseURL != nil }
}

enum KeychainHelper {
    static func set(_ value: String, for key: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else { return nil }
        return str
    }
}
