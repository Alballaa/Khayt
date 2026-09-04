import Foundation
import KhaytCore

/// Asking the shop's printers what they are doing.
///
/// The one thing this app could not answer without the Electron app running:
/// "is it printing, and how far along". A shop that has to open a second app to
/// look at its own machine has not stopped using the second app.
///
/// **It reads, and it reads only.** No pause, no resume, no cancel and no
/// upload. Those are commands, and a command sent to the wrong machine — or to
/// something that is not a machine — costs a shop a print, so they belong
/// behind a deliberate piece of work rather than arriving with a status card.
///
/// **Moonraker only, for now, and it says so.** Khayt speaks seven protocols;
/// there is one printer on this bench and it is a Klipper toolchanger, so it is
/// the one that could be verified against a machine rather than against a
/// document. A machine on any other protocol is told plainly that this app does
/// not poll it yet — a card that silently shows nothing looks broken, and a
/// shop would go back to the other app without knowing why.
///
/// **The reading is `lib/moonraker.js`'s.** Four corrections live in there, each
/// found on a real printer, and none of them is re-decided in Swift. What is
/// Swift is the socket and the clock.
@MainActor
@Observable
final class PrinterWatch {

    /// What a machine last said, and when.
    struct Reading: Sendable, Equatable {
        var status: KhaytEngine.PrinterStatus?
        /// Why there is no status. A sentence a shop can act on, not a socket's
        /// vocabulary — `explainPrinterHttp` exists for the same reason.
        var problem: String?
        var at: Date
    }

    /// Why a machine is not being polled at all, which is different from a poll
    /// that failed.
    enum NotWatched: Equatable {
        case noConnection
        case otherProtocol(String)
    }

    private(set) var readings: [Machine.ID: Reading] = [:]

    /// What the printers last said, in the shape `dashboard-facts` reads —
    /// the same `{ [machineId]: { state, … } }` main.js keeps. A machine that
    /// has not answered is absent rather than present-and-blank, because the
    /// module treats an absent one as "not counted" and a blank one as live.
    var statusCache: [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for (id, seen) in readings {
            if let status = seen.status {
                out[id] = .object([
                    "state": .string(status.state),
                    "progress": .number(Double(status.progress)),
                    "filename": .string(status.filename),
                    "lastUpdated": .number(seen.at.timeIntervalSince1970 * 1000),
                ])
            } else if seen.problem != nil {
                // A machine that did not answer is offline, which is a fact the
                // fleet tile has to count — not an absence.
                out[id] = .object(["state": .string("offline"),
                                   "lastUpdated": .number(seen.at.timeIntervalSince1970 * 1000)])
            }
        }
        return out
    }
    private var task: Task<Void, Never>?

    /// How often. Khayt's own poller runs on ten seconds; a printer answers in
    /// milliseconds on a LAN and this is one small request per machine.
    static let every: Duration = .seconds(10)

    /// Long enough for a printer waking its wifi, short enough that a machine
    /// that is off does not hold the loop. Khayt uses the same five seconds.
    static let timeout: TimeInterval = 5

    /// Is this a machine this app can ask? Nil when it can.
    static func notWatched(_ machine: Machine) -> NotWatched? {
        let type = machine.printerApi?.type ?? ""
        if type.isEmpty || type == "none" { return .noConnection }
        return type == "moonraker" ? nil : .otherProtocol(type)
    }

    func start(shop: Shop) {
        stop()
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.sweep(shop: shop)
                try? await Task.sleep(for: Self.every)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    /// Ask every machine once, one after another.
    ///
    /// Serially rather than all at once: a shop has a handful of printers, and
    /// a burst of simultaneous requests to a Klipper host is a way to find out
    /// what its request queue does under load, on somebody's live print.
    private func sweep(shop: Shop) async {
        var asked = false
        for machine in shop.machines where Self.notWatched(machine) == nil {
            if Task.isCancelled { return }
            await poll(machine, engine: shop.engine)
            asked = true
        }
        // The fleet tile is `dashboard-facts`'s answer and it reads this cache,
        // so a dashboard computed before the first poll says every machine is
        // neither live nor offline — it read 0/1 with the machine beside it
        // demonstrably printing.
        if asked { await shop.printersAnswered() }
    }

    private func poll(_ machine: Machine, engine: KhaytEngine?) async {
        guard let engine else { return }
        do {
            let base = try await Self.baseURL(machine, engine: engine)
            let query = try await engine.moonrakerQuery()
            let reply = try await Self.get(base, path: "/printer/objects/query?" + query)
            // Only the machines that need it pay for the second request, and a
            // failure there keeps toolhead zero's reading rather than nothing.
            var hot: [String: JSONValue]?
            let hotName = try await engine.moonrakerActiveExtruder(reply)
            if let hotName, let escaped = hotName.addingPercentEncoding(withAllowedCharacters: .alphanumerics) {
                hot = try? await Self.get(base, path: "/printer/objects/query?" + escaped)
            }
            let status = try await engine.moonrakerStatus(reply, hot: hot, hotName: hotName)
            readings[machine.id] = Reading(status: status, problem: nil, at: Date())
        } catch {
            readings[machine.id] = Reading(status: nil, problem: Self.say(error), at: Date())
        }
    }

    // MARK: - The socket

    enum Refusal: Error, CustomStringConvertible {
        case noHost
        case notALanAddress(String)
        case badPort(Int)
        case redirected
        case http(Int)
        case notJSON

        var description: String {
            switch self {
            case .noHost:
                return "This machine has no address yet."
            case .notALanAddress(let host):
                return "\(host) is not an address on this network. A printer is a machine "
                     + "in the workshop, so only the private ranges are allowed."
            case .badPort(let port):
                return "\(port) is not a port."
            case .redirected:
                return "The printer sent this request somewhere else, so it was dropped."
            case .http(let code):
                return "The printer's server answered \(code)."
            case .notJSON:
                return "The printer's answer was not JSON."
            }
        }
    }

    /// Where to reach a machine, refused unless it is on this network.
    ///
    /// The guard is `lib/printer-host.js`'s, not a Swift opinion. A public
    /// address here is server-side request forgery with a printer card as the
    /// pretext, and the spellings that matter are the numeric ones —
    /// `2130706433` and `127.1` are loopback and neither looks like an address.
    static func baseURL(_ machine: Machine, engine: KhaytEngine) async throws -> URL {
        let raw = machine.printerApi?.host ?? ""
        let host = try await engine.printerHost(raw)
        guard !host.isEmpty else { throw Refusal.noHost }
        guard try await engine.printerHostAllowed(host) else { throw Refusal.notALanAddress(host) }
        let port = machine.printerApi?.port ?? 7125
        guard port > 0, port <= 65535 else { throw Refusal.badPort(port) }
        guard let url = URL(string: "http://\(host):\(port)") else { throw Refusal.noHost }
        return url
    }

    /// One GET, with the redirect refused.
    ///
    /// A misconfigured or compromised printer host must not be able to 302 this
    /// off the address that was checked and onto loopback or a metadata
    /// endpoint — the check above would then have guarded nothing.
    static func get(_ base: URL, path: String) async throws -> [String: JSONValue] {
        guard let url = URL(string: base.absoluteString + path) else { throw Refusal.noHost }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.httpMethod = "GET"
        let (data, response) = try await Self.session.data(for: request)
        if let http = response as? HTTPURLResponse {
            if (300..<400).contains(http.statusCode) { throw Refusal.redirected }
            guard (200..<300).contains(http.statusCode) else { throw Refusal.http(http.statusCode) }
        }
        guard let decoded = try? JSONDecoder().decode([String: JSONValue].self, from: data) else {
            throw Refusal.notJSON
        }
        return decoded
    }

    /// A session that does not follow redirects and keeps nothing.
    ///
    /// No cache: a printer's status is the one thing that must never come from
    /// one, and a poll every ten seconds would otherwise fill a cache with
    /// answers that were already stale when they were written.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.urlCache = nil
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout * 2
        return URLSession(configuration: config, delegate: NoRedirects.shared, delegateQueue: nil)
    }()

    /// `redirect: 'manual'`, in AppKit's vocabulary.
    private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        static let shared = NoRedirects()
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest,
                        completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)   // hand back the 3xx; `get` refuses it
        }
    }

    /// Put a reading in place, for a test that has no printer to ask.
    func setReadingForTesting(_ id: Machine.ID, _ reading: Reading) { readings[id] = reading }

    // MARK: - Saying it

    /// `2h 14m`, or `14m`. Not a countdown to the second: the estimate is
    /// extrapolated from progress and does not deserve that much precision.
    static func spell(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        if hours > 0 { return "\(hours)h \(minutes)m" }
        if minutes > 0 { return "\(minutes)m" }
        return "<1m"
    }

    static func degrees(_ value: Double) -> String { "\(Int(value.rounded()))°" }

    /// A failure in the vocabulary of the person who has to fix it.
    static func say(_ error: any Error) -> String {
        if let refusal = error as? Refusal { return refusal.description }
        let ns = error as NSError
        switch ns.code {
        case NSURLErrorTimedOut:
            return "The printer did not answer in time. It may be asleep or off the network."
        case NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost:
            return "Nothing answered at that address. Check the printer is on and on this network."
        case NSURLErrorCannotFindHost:
            return "That name did not resolve to anything on this network."
        default:
            return ns.localizedDescription
        }
    }
}
