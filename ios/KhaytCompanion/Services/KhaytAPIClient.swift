import Foundation

@MainActor
final class KhaytAPIClient: ObservableObject {
    private let settings: ConnectionSettings
    private let session: URLSession

    var isConfigured: Bool { settings.isConfigured }

    init(settings: ConnectionSettings) {
        self.settings = settings
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: config)
    }

    func fetchStatus() async throws -> ShopStatus {
        try await get("/api/status", requiresPin: false, as: ShopStatus.self)
    }

    func fetchQueue() async throws -> [QueueOrder] {
        try await get("/api/queue", requiresPin: true, as: [QueueOrder].self)
    }

    func fetchInventory() async throws -> [InventorySpool] {
        try await get("/api/inventory", requiresPin: true, as: [InventorySpool].self)
    }

    func updateOrderStatus(orderId: String, status: String) async throws {
        let body = try JSONEncoder().encode(["status": status])
        _ = try await request(
            path: "/api/orders/\(orderId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? orderId)",
            method: "PATCH",
            body: body,
            requiresPin: true
        )
    }

    func addSpool(from tag: NFCFilamentTag) async throws -> InventorySpool {
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        var payload: [String: Any] = [
            "id": "spool-\(Int(Date().timeIntervalSince1970 * 1000))",
            "material": tag.materialLabel.isEmpty ? (tag.material ?? "Filament") : tag.materialLabel,
            "brand": tag.manufacturer ?? "",
            "color": tag.hex ?? tag.colorName ?? "#888888",
            "weight": tag.weight ?? 1000,
            "weightTotal": tag.weight ?? 1000,
            "weightRemaining": tag.weight ?? 1000,
            "remaining": tag.weight ?? 1000,
            "purchasedAt": String(today),
            "materialType": "fdm",
            "nfcStandard": tag.standard
        ]
        if let w = tag.weight { payload["weight"] = w }
        let data = try JSONSerialization.data(withJSONObject: payload)
        let (responseData, response) = try await request(
            path: "/api/inventory",
            method: "POST",
            body: data,
            requiresPin: true
        )
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw try decodeAPIError(responseData, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        struct AddResponse: Codable { let spool: InventorySpool? }
        if let decoded = try? JSONDecoder().decode(AddResponse.self, from: responseData), let spool = decoded.spool {
            return spool
        }
        return InventorySpool(
            id: payload["id"] as? String ?? UUID().uuidString,
            material: payload["material"] as? String,
            brand: payload["brand"] as? String,
            color: payload["color"] as? String,
            weight: Double(tag.weight ?? 1000),
            remaining: Double(tag.weight ?? 1000),
            cost: nil,
            purchasedAt: String(today),
            addedAt: nil,
            materialType: "fdm",
            lot: nil
        )
    }

    func validatePairing() async throws -> ShopStatus {
        let status = try await fetchStatus()
        _ = try await fetchQueue()
        return status
    }

    func fetchMachines() async throws -> [MachineInfo] {
        try await get("/api/machines", requiresPin: true, as: [MachineInfo].self)
    }

    func addSpool(material: String, weight: Int, color: String = "#888888") async throws -> InventorySpool {
        let today = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        let payload: [String: Any] = [
            "id": "spool-\(Int(Date().timeIntervalSince1970 * 1000))",
            "material": material,
            "color": color,
            "weight": weight,
            "weightTotal": weight,
            "weightRemaining": weight,
            "remaining": weight,
            "purchasedAt": today,
            "materialType": "fdm"
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        let (responseData, response) = try await request(path: "/api/inventory", method: "POST", body: data, requiresPin: true)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw try decodeAPIError(responseData, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        struct AddResponse: Codable { let spool: InventorySpool? }
        if let decoded = try? JSONDecoder().decode(AddResponse.self, from: responseData), let spool = decoded.spool {
            return spool
        }
        throw KhaytAPIError.server("Unexpected response adding spool")
    }

    func probeConnection() async throws -> ShopStatus {
        try await validatePairing()
    }

    // MARK: - HTTP

    private func get<T: Decodable>(_ path: String, requiresPin: Bool, as type: T.Type) async throws -> T {
        let (data, response) = try await request(path: path, method: "GET", body: nil, requiresPin: requiresPin)
        guard let http = response as? HTTPURLResponse else { throw KhaytAPIError.transport(URLError(.badServerResponse)) }
        guard (200...299).contains(http.statusCode) else {
            throw try decodeAPIError(data, status: http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    @discardableResult
    private func request(path: String, method: String, body: Data?, requiresPin: Bool) async throws -> (Data, URLResponse) {
        guard let base = settings.baseURL else { throw KhaytAPIError.notConfigured }
        guard let url = URL(string: path, relativeTo: base) else { throw KhaytAPIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        let pin = settings.pin.trimmingCharacters(in: .whitespacesAndNewlines)
        if requiresPin, !pin.isEmpty {
            req.setValue(pin, forHTTPHeaderField: "x-khayt-pin")
        }

        do {
            return try await session.data(for: req)
        } catch {
            throw KhaytAPIError.transport(error)
        }
    }

    private func decodeAPIError(_ data: Data, status: Int) throws -> KhaytAPIError {
        if status == 401 { return .unauthorized }
        if let decoded = try? JSONDecoder().decode(APIErrorResponse.self, from: data),
           let msg = decoded.error, !msg.isEmpty {
            return .server(msg)
        }
        return .server("Request failed (HTTP \(status))")
    }
}
