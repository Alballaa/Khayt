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
        try await get("/api/status?format=json", requiresPin: false, as: ShopStatus.self)
    }

    func fetchQueue() async throws -> [QueueOrder] {
        try await get("/api/queue", requiresPin: true, as: [QueueOrder].self)
    }

    func fetchRecentOrders(limit: Int = 40, status: String? = nil) async throws -> [OrderLogEntry] {
        var path = "/api/orders?limit=\(min(max(limit, 1), 200))"
        if let status, !status.isEmpty {
            let encoded = status.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? status
            path += "&status=\(encoded)"
        }
        return try await get(path, requiresPin: true, as: [OrderLogEntry].self)
    }

    func fetchInventory() async throws -> [InventorySpool] {
        try await get("/api/inventory", requiresPin: true, as: [InventorySpool].self)
    }

    func fetchMachines() async throws -> [MachineInfo] {
        try await get("/api/machines", requiresPin: true, as: [MachineInfo].self)
    }

    func updateOrderStatus(orderId: String, status: String) async throws {
        let encodedId = try encodeOrderIdForPath(orderId)
        let body = try JSONEncoder().encode(["status": status])
        _ = try await request(
            path: "/api/orders/\(encodedId)",
            method: "PATCH",
            body: body,
            requiresPin: true
        )
    }

    func addSpool(from tag: NFCFilamentTag) async throws -> InventorySpool {
        try await addSpool(draft: SpoolDraft.from(tag: tag))
    }

    func addSpool(material: String, weight: Int, color: String = "#888888", brand: String? = nil) async throws -> InventorySpool {
        var draft = SpoolDraft()
        draft.material = material
        draft.weightGrams = weight
        draft.colorHex = color
        draft.brand = brand ?? ""
        draft.sourceNote = "Manual"
        return try await addSpool(draft: draft)
    }

    func addSpool(draft: SpoolDraft) async throws -> InventorySpool {
        let today = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        let material = draft.material.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !material.isEmpty else {
            throw KhaytAPIError.server("Material name is required.")
        }

        var payload: [String: Any] = [
            "id": "spool-\(Int(Date().timeIntervalSince1970 * 1000))",
            "material": InputLimits.clamp(material, max: InputLimits.maxMaterial),
            "brand": InputLimits.clamp(draft.brand.trimmingCharacters(in: .whitespacesAndNewlines)),
            "color": InputLimits.clamp(draft.colorHex.isEmpty ? "#888888" : draft.colorHex, max: 32),
            "weight": draft.weightGrams,
            "weightTotal": draft.weightGrams,
            "weightRemaining": draft.weightGrams,
            "remaining": draft.weightGrams,
            "purchasedAt": today,
            "materialType": "fdm"
        ]

        let sku = InputLimits.clamp(draft.sku.trimmingCharacters(in: .whitespacesAndNewlines))
        if !sku.isEmpty { payload["sku"] = sku }

        let lot = InputLimits.clamp(draft.lot.trimmingCharacters(in: .whitespacesAndNewlines))
        if !lot.isEmpty { payload["lot"] = lot }

        let printTrim = draft.printTemp.trimmingCharacters(in: .whitespacesAndNewlines)
        if let printTemp = Int(printTrim), printTemp > 0 { payload["printTemp"] = printTemp }

        let bedTrim = draft.bedTemp.trimmingCharacters(in: .whitespacesAndNewlines)
        if let bedTemp = Int(bedTrim), bedTemp > 0 { payload["bedTemp"] = bedTemp }

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
        throw KhaytAPIError.server("Unexpected response adding spool")
    }

    func validatePairing() async throws -> ShopStatus {
        guard settings.isConfigured else { throw KhaytAPIError.notConfigured }
        let status: ShopStatus
        do {
            status = try await fetchStatus()
        } catch let err as KhaytAPIError {
            switch err {
            case .transport, .notConfigured, .invalidURL:
                throw KhaytAPIError.server(
                    String(format: L10n.tr("connection.error.reach_status"), settings.displayURL)
                )
            default:
                throw err
            }
        } catch {
            throw KhaytAPIError.server(
                String(format: L10n.tr("connection.error.reach_status"), settings.displayURL)
            )
        }
        do {
            _ = try await fetchQueue()
        } catch let err as KhaytAPIError {
            if case .unauthorized = err {
                throw KhaytAPIError.unauthorized
            }
            throw err
        }
        return status
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

    private func encodeOrderIdForPath(_ orderId: String) throws -> String {
        let trimmed = orderId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              trimmed.count <= 128,
              !trimmed.contains("/"),
              !trimmed.contains("..") else {
            throw KhaytAPIError.server("Invalid order ID.")
        }
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_")
        guard let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: allowed) else {
            throw KhaytAPIError.server("Invalid order ID.")
        }
        return encoded
    }

    private func makeURL(path: String) throws -> URL {
        guard let base = settings.baseURL else { throw KhaytAPIError.notConfigured }
        guard path.hasPrefix("/") else { throw KhaytAPIError.invalidURL }
        var components = URLComponents()
        components.scheme = base.scheme ?? "http"
        components.host = base.host
        components.port = base.port
        components.path = path
        guard let url = components.url else { throw KhaytAPIError.invalidURL }
        return url
    }

    @discardableResult
    private func request(path: String, method: String, body: Data?, requiresPin: Bool) async throws -> (Data, URLResponse) {
        let url = try makeURL(path: path)

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
