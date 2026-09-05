import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Sending what is only on this Mac.
///
/// **Not one test here speaks to the service**, for the same reason as
/// `CloudReaderTests`: `send` takes its fetch as a parameter, so the whole path
/// — build the payload, seal it, put it on a request, read the answer — runs
/// against a shop that does not exist.
///
/// The reply shapes are khayt-cloud's own, from `index.php`:
///
///     POST /v1/shops/{id}/deltas   { ciphertext, baseRev }
///          200 { rev, deltaCount }   appended; rev is the new head
///          409 { rev }               baseRev is not the head
///          404                       this shop's chain is closed
@MainActor
struct CloudWriterTests {

    static let connection = CloudReader.Connection(
        url: "https://cloud.khayt.example", shopId: "shop_282eb707", storedToken: "__enc__x")
    static let dek = Data((0..<32).map { UInt8($0) })

    static let payload = KhaytEngine.Outbox(
        deltas: [.object(["collection": .string("orders"),
                          "record": .object(["id": .string("o1"), "rev": .number(4)])])],
        tombstones: [], cursor: .object(["rev": .number(0), "ts": .string("")]),
        settingsDiffer: true)

    static func answer(_ status: Int, _ json: String) -> (URLRequest) async throws -> (Data, URLResponse) {
        { request in
            (Data(json.utf8),
             HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    // MARK: - The request

    /// The route is the safety property, so it is asserted rather than assumed.
    /// `PUT /store` from this app would upload a book that has merged nobody
    /// else's work and compact the chain behind it; `POST /deltas` can only add.
    @Test("it appends to the chain — it never puts a whole store")
    func routeAndHeaders() async throws {
        var seen: URLRequest?
        _ = try? await CloudWriter.send(Self.connection, token: "the-real-token",
                                        payload: Self.payload, dek: Self.dek, baseRev: 12) { request in
            seen = request
            return (Data(#"{"rev":13}"#.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        #expect(seen?.httpMethod == "POST")
        #expect(seen?.url?.absoluteString
                == "https://cloud.khayt.example/v1/shops/shop_282eb707/deltas")
        #expect(seen?.value(forHTTPHeaderField: "Authorization") == "Bearer the-real-token")
        // Not a courtesy header on this route: `recordDeviceCap` runs before
        // `shopTakesDeltas`, so a send that stayed quiet would close the shop's
        // gate and then be refused by the gate it had just closed.
        #expect(seen?.value(forHTTPHeaderField: "x-delta-capable") == "1")
    }

    @Test("the body carries the payload sealed with the shop's key, and the rev it was measured against")
    func bodyShape() async throws {
        var seen: URLRequest?
        _ = try? await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                        dek: Self.dek, baseRev: 12) { request in
            seen = request
            return (Data(#"{"rev":13}"#.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        struct Body: Decodable { let ciphertext: SyncCrypto.Blob; let baseRev: Int }
        let sentBody = try #require(seen?.httpBody)
        let body = try JSONDecoder().decode(Body.self, from: sentBody)
        #expect(body.baseRev == 12)

        let opened = try SyncCrypto.store(body.ciphertext, dek: Self.dek)
        #expect(opened["deltas"] == .array(Self.payload.deltas))
        #expect(opened["tombstones"] == .array([]))
        // `settingsDiffer` is a fact about THIS device. It must not travel
        // inside a blob every other device folds.
        #expect(opened["settingsDiffer"] == nil)
    }

    // MARK: - What the service says back

    /// The one that matters. A 409 means something reached the cloud between
    /// the pull and the button, so the payload was measured against a store
    /// that no longer exists — and the answer is to look again, not to retry.
    @Test("a cloud that moved on is refused, with the revision it moved to")
    func conflict() async throws {
        await #expect(throws: CloudWriter.Failure.moved(19)) {
            try await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                       dek: Self.dek, baseRev: 12,
                                       fetch: Self.answer(409, #"{"rev":19}"#))
        }
    }

    @Test("a shop whose chain is closed is told so, not shown an HTTP code")
    func chainClosed() async throws {
        for code in [404, 405] {
            await #expect(throws: CloudWriter.Failure.notAccepted) {
                try await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                           dek: Self.dek, baseRev: 12,
                                           fetch: Self.answer(code, #"{"error":"nope"}"#))
            }
        }
    }

    @Test("a rejected token says what it is")
    func unauthorised() async throws {
        await #expect(throws: CloudWriter.Failure.unauthorised) {
            try await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                       dek: Self.dek, baseRev: 12,
                                       fetch: Self.answer(401, "{}"))
        }
    }

    /// A 200 with no revision is not success. Reporting one would leave the
    /// screen saying the change went up with nothing to show it did.
    @Test("a success with no revision is not a success")
    func noRev() async throws {
        await #expect(throws: CloudWriter.Failure.malformed("it carried no revision")) {
            try await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                       dek: Self.dek, baseRev: 12,
                                       fetch: Self.answer(200, "{}"))
        }
    }

    @Test("what went up is reported by kind, from the payload rather than the reply")
    func reportsWhatItSent() async throws {
        let both = KhaytEngine.Outbox(
            deltas: Self.payload.deltas,
            tombstones: [.object(["collection": .string("spools"), "id": .string("s9")])],
            cursor: .object([:]), settingsDiffer: false)
        let sent = try await CloudWriter.send(Self.connection, token: "t", payload: both,
                                              dek: Self.dek, baseRev: 12,
                                              fetch: Self.answer(200, #"{"rev":14,"deltaCount":3}"#))
        #expect(sent.rev == 14)
        #expect(sent.deltas == 1)
        #expect(sent.tombstones == 1)
    }

    // MARK: - the whole store, for a shop whose chain is closed

    static let merged = KhaytEngine.Merged(store: [:], applied: 0, skipped: 0,
                                           removed: 0, conflicts: [])

    /// A different route and a different verb. `POST /deltas` appends; this
    /// REPLACES, and the service compacts the chain behind it.
    @Test("the whole store goes by PUT, to the store, with the revision it was merged from")
    func wholeStoreRoute() async throws {
        var seen: URLRequest?
        _ = try? await CloudWriter.sendWholeStore(
            Self.connection, token: "t", store: ["orders": .array([])], dek: Self.dek,
            baseRev: 16, mergedFrom: Self.merged) { request in
            seen = request
            return (Data(#"{"rev":17}"#.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        #expect(seen?.httpMethod == "PUT")
        #expect(seen?.url?.absoluteString
                == "https://cloud.khayt.example/v1/shops/shop_282eb707/store")
        #expect(seen?.value(forHTTPHeaderField: "x-delta-capable") == "1")

        struct Body: Decodable { let ciphertext: SyncCrypto.Blob; let baseRev: Int }
        let raw = try #require(seen?.httpBody)
        let body = try JSONDecoder().decode(Body.self, from: raw)
        // The revision the merge was folded from, so anything that arrived in
        // between is a 409 rather than an overwrite.
        #expect(body.baseRev == 16)
        #expect(try SyncCrypto.store(body.ciphertext, dek: Self.dek)["orders"] == .array([]))
    }

    /// The guard that makes the whole thing safe. Without it, a book that is no
    /// longer a superset of the cloud would replace it.
    @Test("a cloud that moved while we were merging is refused, not overwritten")
    func wholeStoreConflict() async throws {
        await #expect(throws: CloudWriter.Failure.moved(21)) {
            try await CloudWriter.sendWholeStore(
                Self.connection, token: "t", store: [:], dek: Self.dek, baseRev: 16,
                mergedFrom: Self.merged, fetch: Self.answer(409, #"{"rev":21}"#))
        }
    }

    @Test("what went up is described as the whole book, not as one change")
    func wholeStoreIsSaidPlainly() async throws {
        let sent = try await CloudWriter.sendWholeStore(
            Self.connection, token: "t", store: [:], dek: Self.dek, baseRev: 16,
            mergedFrom: Self.merged, fetch: Self.answer(200, #"{"rev":17}"#))
        #expect(sent.wholeStore)
        #expect(sent.rev == 17)
        #expect(sent.count == 0, "it is not a count of records")
    }

    /// A delta send says nothing about the whole store, so the screen can tell
    /// the two apart.
    @Test("an ordinary send is not marked as the whole book")
    func deltaSendIsNotWholeStore() async throws {
        let sent = try await CloudWriter.send(Self.connection, token: "t", payload: Self.payload,
                                              dek: Self.dek, baseRev: 12,
                                              fetch: Self.answer(200, #"{"rev":13}"#))
        #expect(!sent.wholeStore)
    }

    // MARK: - End to end, through the real rules

    /// The proof that the parts fit: take two stores that disagree, build the
    /// payload with the shared rule, seal it as the wire carries it, open it as
    /// another device would, fold it with the shared merge engine, and require
    /// that the comparison screen then reports agreement.
    ///
    /// Every step here is the shipped one. Nothing is restated in the test.
    @Test("a Mac's changes, sent and folded, bring the two into step")
    func endToEnd() async throws {
        let engine = try KhaytEngine()
        let here: [String: JSONValue] = [
            "orders": .array([
                .object(["id": .string("made-here"), "rev": .number(1), "title": .string("new")]),
                .object(["id": .string("edited-here"), "rev": .number(7)]),
                .object(["id": .string("theirs"), "rev": .number(2)]),
            ]),
            "tombstones": .array([.object(["collection": .string("orders"),
                                           "id": .string("dropped"), "rev": .number(1),
                                           "deletedAt": .string("2026-09-02")])]),
        ]
        let there: [String: JSONValue] = [
            "orders": .array([
                .object(["id": .string("edited-here"), "rev": .number(6)]),
                .object(["id": .string("theirs"), "rev": .number(9)]),
                .object(["id": .string("dropped"), "rev": .number(1)]),
            ]),
            "tombstones": .array([]),
        ]

        let outbox = try await engine.changesToSend(local: here, server: there)
        #expect(outbox.deltas.count == 2)      // made-here and edited-here; NOT theirs
        #expect(outbox.tombstones.count == 1)

        // Over the wire and back, exactly as another device would receive it.
        let blob = try SyncCrypto.seal(outbox.wire, dek: Self.dek)
        let asReceived = try SyncCrypto.store(blob, dek: Self.dek)
        let folded = try await engine.foldDeltas(base: there, deltas: [asReceived])
        #expect(folded.applied == 2)
        #expect(folded.removed == 1)

        // `theirs` was never sent, so the cloud's newer copy survives untouched.
        // This is the direction that destroys a shop's work.
        guard case .array(let ordersAfter)? = folded.store["orders"] else {
            Issue.record("the fold lost the orders collection entirely"); return
        }
        let theirs = ordersAfter.first {
            if case .object(let o) = $0 { return o["id"] == .string("theirs") }
            return false
        }
        guard case .object(let row)? = theirs else {
            Issue.record("`theirs` is gone — the send removed a record it never sent"); return
        }
        #expect(row["rev"] == .number(9))

        // And now the screen agrees — on the collections the payload could carry.
        let after = CloudCompare.compare(here: here, there: folded.store,
                                         collections: ["orders", "tombstones"], cloudRev: 13)
        #expect(after.agrees == false, "the stale record is still a difference, and honestly so")
        #expect(after.differing.count == 1)
        #expect(after.differing.first?.collection == "orders")
    }
}
