import Foundation
import KhaytCore

/// Asking Khayt Cloud what it holds.
///
/// **It reads. There is no push here, and that is the whole design of this
/// stage.** `cloud-backend.js` §7 spells out what a blob the server accepts
/// does to the shop's other devices: a full push with a baseRev the server
/// takes replaces its newer copy outright, and every device pulls the older
/// store down, with nothing said on either side. A reader can be wrong and
/// merely fail.
///
/// What it does is one cold pull — `GET /v1/shops/{id}/store` with the shop's
/// bearer token — and then the same fold the Electron app does: decrypt the
/// base with the data key, apply the delta chain with `KhaytSync.applyDeltas`.
/// The server includes the base exactly when the caller is behind it, and a
/// caller with no `?since=` is behind everything, so a cold reply always
/// carries one. Confirmed against the server's own handler, not only the
/// client's.
@MainActor
enum CloudReader {

    enum Failure: Error, CustomStringConvertible {
        case notConnected
        case badAddress(String)
        case unauthorised
        case noStoreYet
        case http(Int, String)
        case malformed(String)
        case noBase

        var description: String {
            switch self {
            case .notConnected:
                return "This book is not connected to Khayt Cloud."
            case .badAddress(let url):
                return "\(url) is not an address this app will connect to."
            case .unauthorised:
                return "Khayt Cloud did not accept this shop's token. It may have been reset."
            case .noStoreYet:
                return "Khayt Cloud has nothing for this shop yet — nothing has been sent to it."
            case .http(let code, let body):
                return "Khayt Cloud answered \(code)\(body.isEmpty ? "" : ": \(body)")"
            case .malformed(let what):
                return "Khayt Cloud's answer was not the shape this app expects: \(what)"
            case .noBase:
                return "Khayt Cloud sent changes but no store to apply them to. "
                     + "Refusing beats guessing: a store built on the wrong base is missing "
                     + "exactly the edits worth having."
            }
        }
    }

    /// What one pull came back with.
    struct Reply {
        /// The head revision — the whole chain's, not the slice's.
        let rev: Int
        let base: SyncCrypto.Blob?
        let deltas: [(rev: Int, blob: SyncCrypto.Blob)]
    }

    /// The shop's own cloud settings, as far as reading needs them.
    struct Connection {
        let url: String
        let shopId: String
        /// Still `__enc__` here. Opened at the moment of the request and never
        /// held — see `Secrets`.
        let storedToken: String
    }

    static func connection(_ settings: [String: JSONValue]) throws -> Connection {
        guard Shop.cloudConnected(settings), case .object(let cloud)? = settings["cloud"] else {
            throw Failure.notConnected
        }
        guard case .string(let url)? = cloud["url"], !url.isEmpty,
              case .string(let shop)? = cloud["shopId"], !shop.isEmpty else {
            throw Failure.notConnected
        }
        var token = ""
        if case .string(let t)? = cloud["token"] { token = t }
        return Connection(url: url, shopId: shop, storedToken: token)
    }

    // MARK: - The request

    /// One cold pull.
    ///
    /// `fetch` is a seam so the whole path can be exercised without a network
    /// or a shop's real credentials — every test in `CloudReaderTests` uses it,
    /// and none of them has ever spoken to the service.
    static func pull(_ connection: Connection, token: String,
                     fetch: (URLRequest) async throws -> (Data, URLResponse)) async throws -> Reply {
        guard let base = URL(string: connection.url), base.scheme == "https" else {
            // Not a preference: the token goes in a header, and http would put
            // a shop's shop-wide credential on the wire in the clear.
            throw Failure.badAddress(connection.url)
        }
        // `uriComponent`, not `.alphanumerics` — see the note there. Every shop
        // id Khayt issues contains an underscore, and escaping it produced a
        // path the server has no route for.
        let path = "/v1/shops/" + connection.shopId.uriComponent + "/store"
        guard let url = URL(string: base.absoluteString.trimmingTrailingSlash + path) else {
            throw Failure.badAddress(connection.url)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")

        let (data, response) = try await fetch(request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch code {
        case 200: break
        case 204: throw Failure.noStoreYet
        case 401, 403: throw Failure.unauthorised
        default:
            throw Failure.http(code, String(decoding: data.prefix(200), as: UTF8.self))
        }

        guard let body = try? JSONDecoder().decode(Body.self, from: data) else {
            throw Failure.malformed("it did not decode")
        }
        return Reply(rev: body.rev ?? 0, base: body.ciphertext,
                     deltas: (body.deltas ?? []).map { (rev: $0.rev, blob: $0.ciphertext) })
    }

    private struct Body: Decodable {
        let rev: Int?
        let ciphertext: SyncCrypto.Blob?
        let deltas: [Delta]?
        struct Delta: Decodable {
            let rev: Int
            let ciphertext: SyncCrypto.Blob
        }
    }

    // MARK: - The store

    /// Decrypt the base and fold the chain onto it — the same order `pull()`
    /// uses in cloud-backend.js.
    static func store(_ reply: Reply, dek: Data, engine: KhaytEngine) async throws -> Folded {
        guard let baseBlob = reply.base else { throw Failure.noBase }
        let base = try SyncCrypto.store(baseBlob, dek: dek)
        guard !reply.deltas.isEmpty else {
            return Folded(store: base, chain: 0, applied: 0, removed: 0)
        }
        let payloads = try reply.deltas.map { try SyncCrypto.store($0.blob, dek: dek) }
        let out = try await engine.foldDeltas(base: base, deltas: payloads)
        return Folded(store: out.store, chain: payloads.count,
                      applied: out.applied, removed: out.removed)
    }

    /// What the cloud's side of the comparison is built on.
    ///
    /// Carried so it can be SHOWN. "Nineteen jobs are newer here" means one
    /// thing if thirteen changes were folded onto the base and something else
    /// entirely if none were — and the two are indistinguishable from the
    /// answer alone.
    struct Folded {
        let store: [String: JSONValue]
        /// How many encrypted changes the server sent after the base.
        let chain: Int
        /// How many records those changes actually wrote.
        let applied: Int
        /// How many they deleted.
        let removed: Int
    }
}

private extension String {
    var trimmingTrailingSlash: String { hasSuffix("/") ? String(dropLast()) : self }
}
