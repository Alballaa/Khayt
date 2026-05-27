import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case rateLimited
    case http(Int, String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid server URL"
        case .unauthorized: "Wrong PIN or unauthorized"
        case .rateLimited: "Too many attempts — try again in a minute"
        case .http(let code, let msg): "Server error \(code)\(msg.map { ": \($0)" } ?? "")"
        case .decoding(let err): "Response decoding failed: \(err.localizedDescription)"
        case .transport(let err): "Network error: \(err.localizedDescription)"
        }
    }
}

actor APIClient {
    private let connection: ServerConnection
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(connection: ServerConnection, session: URLSession = .shared) {
        self.connection = connection
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // MARK: Public endpoints

    func status() async throws -> QueueStatus {
        try await request("/api/status")
    }

    func queue() async throws -> [Order] {
        try await request("/api/queue")
    }

    func machines() async throws -> [Machine] {
        try await request("/api/machines")
    }

    // MARK: PIN-gated endpoints

    func orders(limit: Int = 50, status: OrderStatus? = nil) async throws -> [Order] {
        var query: [URLQueryItem] = [URLQueryItem(name: "limit", value: String(limit))]
        if let status { query.append(URLQueryItem(name: "status", value: status.rawValue)) }
        return try await request("/api/orders", query: query)
    }

    func inventory() async throws -> [Spool] {
        try await request("/api/inventory")
    }

    func addSpool(_ spool: NewSpool) async throws -> Spool {
        struct Wrapper: Decodable { let spool: Spool }
        let res: Wrapper = try await request("/api/inventory", method: "POST", body: spool)
        return res.spool
    }

    func updateOrderStatus(id: String, status: OrderStatus) async throws {
        struct Body: Encodable { let status: String }
        struct Empty: Decodable {}
        let _: Empty = try await request(
            "/api/orders/\(id)",
            method: "PATCH",
            body: Body(status: status.rawValue)
        )
    }

    // MARK: Connection check

    func ping() async throws -> QueueStatus {
        try await status()
    }

    // MARK: Internal

    private func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Encodable? = nil
    ) async throws -> T {
        guard var components = URLComponents(url: connection.baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        components.path = path
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        if !connection.pin.isEmpty {
            request.setValue(connection.pin, forHTTPHeaderField: "X-Khayt-PIN")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(-1, nil)
        }
        switch http.statusCode {
        case 200...299:
            if T.self == EmptyResponse.self {
                return EmptyResponse() as! T
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                // Accept empty 2xx responses
                if data.isEmpty, let empty = EmptyResponse() as? T { return empty }
                throw APIError.decoding(error)
            }
        case 401, 403: throw APIError.unauthorized
        case 429: throw APIError.rateLimited
        default:
            let msg = String(data: data, encoding: .utf8)
            throw APIError.http(http.statusCode, msg)
        }
    }
}

struct EmptyResponse: Decodable {}

private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init(_ wrapped: Encodable) {
        self._encode = wrapped.encode
    }
    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
