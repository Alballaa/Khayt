import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Asking Khayt Cloud what it holds, and saying how far apart the two are.
///
/// **Not one test here speaks to the service.** `pull` takes its fetch as a
/// parameter for exactly that reason: a shop's shop-wide bearer token and its
/// real store are not things a test suite should be reaching for, and the whole
/// path can be exercised without either.
///
/// The reply shapes are the server's own, read out of `khayt-cloud/index.php`
/// rather than from the client that talks to it — a 200 with `{rev, deltas,
/// ciphertext?}`, a 204 when the shop has never pushed, a 401 when the token is
/// not this shop's.
@MainActor
struct CloudReaderTests {

    static let connection = CloudReader.Connection(
        url: "https://cloud.khayt.example", shopId: "shop_282eb707", storedToken: "__enc__x")

    static func reply(_ status: Int, _ json: String) -> (URLRequest) async throws -> (Data, URLResponse) {
        { request in
            (Data(json.utf8),
             HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    // MARK: - The request

    @Test("the token goes in the header and the shop in the path")
    func requestShape() async throws {
        var seen: URLRequest?
        _ = try? await CloudReader.pull(Self.connection, token: "the-real-token") { request in
            seen = request
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200,
                                                     httpVersion: nil, headerFields: nil)!)
        }
        // ON `absoluteString`, NOT ON `path`. `URL.path` decodes, so it read
        // back `/v1/shops/shop_282eb707/store` for a URL that actually carried
        // `shop%5F282eb707` — and khayt-cloud, whose route is
        // `[A-Za-z0-9_\-]+`, answered 404. The test agreed with the bug.
        #expect(seen?.url?.absoluteString
                == "https://cloud.khayt.example/v1/shops/shop_282eb707/store")
        #expect(seen?.value(forHTTPHeaderField: "Authorization") == "Bearer the-real-token")
        #expect(seen?.httpMethod == "GET")
        // No `?since=`: this app holds no server view, so it is behind
        // everything and must be sent the base.
        #expect(seen?.url?.query == nil)
    }

    /// Not a courtesy header. khayt-cloud's `recordDeviceCap` writes the
    /// capability of every credential it hears from, and `deltaGateOpen`
    /// refuses the whole shop the moment one row says `delta_capable = 0`:
    ///
    ///     if ($c['no'] > 0) return false;   // a device we know cannot read a chain
    ///
    /// So a pull that says nothing does not merely fail to help — it takes
    /// delta sync away from every other device in the shop, which then sends
    /// the entire store on every save. This app folds chains; it must say so.
    @Test("the pull says it can read a delta chain")
    func announcesDeltaCapability() async throws {
        var seen: URLRequest?
        _ = try? await CloudReader.pull(Self.connection, token: "t") { request in
            seen = request
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200,
                                                     httpVersion: nil, headerFields: nil)!)
        }
        #expect(seen?.value(forHTTPHeaderField: "x-delta-capable") == "1")
    }

    @Test("only https")
    func refusesPlainHttp() async throws {
        // The token is a shop-wide credential and it goes in a header.
        let plain = CloudReader.Connection(url: "http://cloud.khayt.example",
                                           shopId: "s", storedToken: "")
        await #expect(throws: CloudReader.Failure.self) {
            try await CloudReader.pull(plain, token: "t", fetch: Self.reply(200, "{}"))
        }
    }

    @Test("a shop that has never pushed is told so, not shown an error")
    func noStoreYet() async throws {
        // The server sends 204 when there is no blob row at all.
        await #expect(throws: CloudReader.Failure.self) {
            try await CloudReader.pull(Self.connection, token: "t", fetch: Self.reply(204, ""))
        }
    }

    @Test("a rejected token says what it is")
    func unauthorised() async throws {
        for code in [401, 403] {
            do {
                _ = try await CloudReader.pull(Self.connection, token: "t",
                                               fetch: Self.reply(code, #"{"error":"Missing bearer token"}"#))
                Issue.record("\(code) was not refused")
            } catch let f as CloudReader.Failure {
                #expect(f.description.contains("did not accept"))
            }
        }
    }

    @Test("the head revision is read from the reply, not from the deltas")
    func readsTheHead() async throws {
        // The server computes the head from the WHOLE chain: a caller that is
        // already current gets no deltas back and must still be told the rev it
        // is current WITH.
        let out = try await CloudReader.pull(Self.connection, token: "t", fetch: Self.reply(200, #"""
        {"rev":12,"deltas":[],"ciphertext":{"v":1,"iv":"EH03WcogAQtcxYpD","ct":"HaA1Zh8M7IJql2D+4JISicY=","tag":"KudXT8nGuzXk46FyILKA1g=="}}
        """#))
        #expect(out.rev == 12)
        #expect(out.base != nil)
        #expect(out.deltas.isEmpty)
    }

    @Test("a reply with changes and nothing to apply them to is refused")
    func noBase() async throws {
        // Refusing beats guessing, the same way `foldDeltas` refuses: a store
        // built on the wrong base is missing exactly the edits worth having.
        let reply = CloudReader.Reply(rev: 5, base: nil, deltas: [])
        await #expect(throws: CloudReader.Failure.self) {
            try await CloudReader.store(reply, dek: Data(repeating: 7, count: 32),
                                        engine: try KhaytEngine())
        }
    }

    @Test("a base with no deltas is the store")
    func baseOnly() async throws {
        let out = try await CloudReader.pull(Self.connection, token: "t", fetch: Self.reply(200, #"""
        {"rev":1,"deltas":[],"ciphertext":{"v":1,"iv":"EH03WcogAQtcxYpD","ct":"HaA1Zh8M7IJql2D+4JISicY=","tag":"KudXT8nGuzXk46FyILKA1g=="}}
        """#))
        let folded = try await CloudReader.store(out, dek: Data(repeating: 7, count: 32),
                                                 engine: try KhaytEngine())
        #expect(folded.store["hello"] == .string("world"))
        #expect(folded.chain == 0, "no chain to fold, and it says so rather than implying one")
        #expect(folded.applied == 0)
    }

    // MARK: - Which book is connected

    @Test("an unconnected book is refused before any request is built")
    func notConnected() {
        #expect(throws: CloudReader.Failure.self) { try CloudReader.connection([:]) }
        #expect(throws: CloudReader.Failure.self) {
            try CloudReader.connection(["cloud": .object(["enabled": .bool(true)])])
        }
    }

    @Test("a connected book yields its address and shop")
    func connected() throws {
        let c = try CloudReader.connection(["cloud": .object([
            "enabled": .bool(true), "verified": .bool(true),
            "shopId": .string("shop_282eb707"), "url": .string("https://cloud.khayt.example"),
            "token": .string("__enc__abc"),
        ])])
        #expect(c.shopId == "shop_282eb707")
        #expect(c.storedToken == "__enc__abc", "still sealed — it is opened at the request and not before")
    }
}

/// How far apart the two books are.
@MainActor
struct CloudCompareTests {

    static func rows(_ pairs: [(String, Double)]) -> JSONValue {
        .array(pairs.map { .object(["id": .string($0.0), "rev": .number($0.1)]) })
    }

    @Test("two books that agree say so")
    func agrees() {
        let book: [String: JSONValue] = ["printLog": Self.rows([("A", 3), ("B", 1)])]
        let out = CloudCompare.compare(here: book, there: book,
                                       collections: ["printLog"], cloudRev: 12)
        #expect(out.agrees)
        #expect(out.differing.isEmpty)
        #expect(out.lines.first?.here == 2)
    }

    @Test("a job this Mac has and the cloud does not")
    func onlyHere() {
        // The exact case the sidebar warns about: work done here that no other
        // device has seen.
        let out = CloudCompare.compare(here: ["printLog": Self.rows([("A", 1), ("NEW", 1)])],
                                       there: ["printLog": Self.rows([("A", 1)])],
                                       collections: ["printLog"], cloudRev: 12)
        #expect(!out.agrees)
        #expect(out.lines.first?.onlyHere == 1)
        #expect(out.lines.first?.onlyThere == 0)
    }

    @Test("an edit each way is counted as an edit, not as a missing record")
    func revsDecide() {
        // Compared by `rev`, which is what sync compares. The Mac stamps it on
        // every write for exactly this reason.
        let out = CloudCompare.compare(here: ["printLog": Self.rows([("A", 5), ("B", 1)])],
                                       there: ["printLog": Self.rows([("A", 2), ("B", 9)])],
                                       collections: ["printLog"], cloudRev: 12)
        let line = out.lines.first
        #expect(line?.newerHere == 1)
        #expect(line?.newerThere == 1)
        #expect(line?.onlyHere == 0)
        #expect(line?.onlyThere == 0)
    }

    @Test("a collection neither side has is not a line")
    func emptyCollectionsAreSkipped() {
        // Thirty-one rows of zeroes is a screen nobody reads.
        let out = CloudCompare.compare(here: [:], there: [:],
                                       collections: ["printLog", "clients", "giftCards"],
                                       cloudRev: 0)
        #expect(out.lines.isEmpty)
    }

    @Test("a record with no id is skipped rather than counted as a difference")
    func rowsWithoutIds() {
        // Sync keys on the id; a row without one was never going to travel.
        let odd: JSONValue = .array([.object(["rev": .number(1)]),
                                     .object(["id": .string("A"), "rev": .number(1)])])
        let out = CloudCompare.compare(here: ["printLog": odd], there: ["printLog": Self.rows([("A", 1)])],
                                       collections: ["printLog"], cloudRev: 1)
        #expect(out.agrees)
        #expect(out.lines.first?.here == 1)
    }

    @Test("a missing rev is rev zero, not a mismatch with itself")
    func missingRev() {
        let bare: JSONValue = .array([.object(["id": .string("A")])])
        let out = CloudCompare.compare(here: ["printLog": bare], there: ["printLog": bare],
                                       collections: ["printLog"], cloudRev: 1)
        #expect(out.agrees)
    }
}

/// What the fold actually did.
///
/// THE REASON THIS EXISTS: the first version threw `applyDeltas`'s report away,
/// so a chain that applied NOTHING was indistinguishable from one that worked —
/// and the comparison built on it would have reported the whole book as "newer
/// here" with no way to tell that from the truth. A number nobody can check is
/// not evidence.
@MainActor
struct FoldReportTests {

    static func record(_ id: String, rev: Double, extra: [String: JSONValue] = [:]) -> JSONValue {
        var row: [String: JSONValue] = ["id": .string(id), "rev": .number(rev)]
        for (k, v) in extra { row[k] = v }
        return .object(row)
    }

    @Test("a chain that writes records says how many")
    func appliedIsReported() async throws {
        let base: [String: JSONValue] = ["printLog": .array([Self.record("O-1", rev: 1)])]
        let payload: [String: JSONValue] = ["deltas": .array([
            .object(["collection": .string("printLog"), "record": Self.record("O-1", rev: 5)]),
            .object(["collection": .string("printLog"), "record": Self.record("O-2", rev: 1)]),
        ])]
        let out = try await KhaytEngine().foldDeltas(base: base, deltas: [payload])
        #expect(out.applied == 2)
        guard case .array(let rows)? = out.store["printLog"] else { Issue.record("no printLog"); return }
        #expect(rows.count == 2, "the chain was folded onto the base, not dropped")
    }

    @Test("a chain the base already has is skipped, not applied")
    func skippedIsNotApplied() async throws {
        // Normal, and not a fault — but it must not read as work done.
        let base: [String: JSONValue] = ["printLog": .array([Self.record("O-1", rev: 9)])]
        let payload: [String: JSONValue] = ["deltas": .array([
            .object(["collection": .string("printLog"), "record": Self.record("O-1", rev: 2)]),
        ])]
        let out = try await KhaytEngine().foldDeltas(base: base, deltas: [payload])
        #expect(out.applied == 0)
        #expect(out.skipped == 1)
    }

    @Test("a tombstone in the chain removes, and says so")
    func removedIsReported() async throws {
        let base: [String: JSONValue] = ["printFiles": .array([Self.record("PF-1", rev: 1)])]
        let payload: [String: JSONValue] = ["tombstones": .array([
            .object(["collection": .string("printFiles"), "id": .string("PF-1"), "rev": .number(2)]),
        ])]
        let out = try await KhaytEngine().foldDeltas(base: base, deltas: [payload])
        #expect(out.removed == 1)
    }

    @Test("a fold that did nothing is visible as nothing")
    func nothingIsVisible() async throws {
        let base: [String: JSONValue] = ["printLog": .array([Self.record("O-1", rev: 1)])]
        let out = try await KhaytEngine().foldDeltas(base: base, deltas: [["deltas": .array([])]])
        #expect(out.applied == 0 && out.skipped == 0 && out.removed == 0)
    }
}

/// A tombstone's id is not unique on its own.
@MainActor
struct TombstoneKeyTests {

    @Test("two deletions with the same id in different collections are two")
    func keyedByCollection() {
        // `keyOf` in lib/sync.js keys them `collection:id` for exactly this
        // reason. Keyed on the id alone, these collapse into one and the count
        // is quietly halved.
        let here: [String: JSONValue] = ["tombstones": .array([
            .object(["id": .string("X-1"), "collection": .string("printFiles"), "rev": .number(1)]),
            .object(["id": .string("X-1"), "collection": .string("printLog"), "rev": .number(1)]),
        ])]
        let out = CloudCompare.compare(here: here, there: [:],
                                       collections: ["tombstones"], cloudRev: 1)
        #expect(out.lines.first?.here == 2)
        #expect(out.lines.first?.onlyHere == 2)
    }

    @Test("an ordinary collection is still keyed by id alone")
    func othersUnchanged() {
        let here: [String: JSONValue] = ["printLog": .array([
            .object(["id": .string("O-1"), "collection": .string("ignored"), "rev": .number(1)]),
        ])]
        let out = CloudCompare.compare(here: here, there: here,
                                       collections: ["printLog"], cloudRev: 1)
        #expect(out.agrees)
    }
}
