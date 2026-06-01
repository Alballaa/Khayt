import Foundation

enum ConnectionHealthState: String, Sendable {
    case unknown
    case connected
    case unreachable
    case unauthorized

    var label: String {
        switch self {
        case .unknown: return "Checking…"
        case .connected: return "Connected"
        case .unreachable: return "Unreachable"
        case .unauthorized: return "Wrong PIN"
        }
    }

    var systemImage: String {
        switch self {
        case .unknown: return "wifi.exclamationmark"
        case .connected: return "wifi"
        case .unreachable: return "wifi.slash"
        case .unauthorized: return "lock.slash"
        }
    }
}

@MainActor
final class ConnectionHealth: ObservableObject {
    @Published private(set) var state: ConnectionHealthState = .unknown
    @Published private(set) var lastChecked: Date?
    @Published private(set) var lastStatus: ShopStatus?

    private let api: KhaytAPIClient
    private var task: Task<Void, Never>?

    init(api: KhaytAPIClient) {
        self.api = api
    }

    func startPolling(intervalSeconds: UInt64 = 30) {
        task?.cancel()
        task = Task {
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(nanoseconds: intervalSeconds * 1_000_000_000)
            }
        }
    }

    func stopPolling() {
        task?.cancel()
        task = nil
    }

    func refresh() async {
        guard api.isConfigured else {
            state = .unreachable
            lastChecked = Date()
            return
        }
        do {
            let status = try await api.fetchStatus()
            lastStatus = status
            do {
                _ = try await api.fetchQueue()
                state = .connected
            } catch let err as KhaytAPIError {
                if case .unauthorized = err { state = .unauthorized }
                else { state = .connected }
            }
            lastChecked = Date()
        } catch let err as KhaytAPIError {
            if case .unauthorized = err { state = .unauthorized }
            else { state = .unreachable }
            lastChecked = Date()
        } catch {
            state = .unreachable
            lastChecked = Date()
        }
    }
}
