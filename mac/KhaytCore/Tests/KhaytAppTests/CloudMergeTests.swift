import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Bringing the cloud's copy down, run against a copy of a real book.
///
/// This is the only operation in the app that rewrites records the shop did not
/// touch, so it is tested the way the other write paths are: on a COPY of this
/// Mac's own store in a temp directory, through the same chain the app uses,
/// with ownership as a closure so the refusal can be exercised too. A write path
/// whose only trial run was a shop's live book has not been tested, it has been
/// risked.
@MainActor
struct CloudMergeTests {

    static func freshCopy() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "khayt-merge-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appending(path: "khayt-store.json")
        for build in StoreReader.Build.allCases where build.exists {
            try Data(contentsOf: build.storeURL).write(to: url)
            return url
        }
        try Data(contentsOf: Bundle.module.url(forResource: "sample-shop", withExtension: "json")!)
            .write(to: url)
        return url
    }

    static func read(_ url: URL) throws -> [String: JSONValue] {
        try JSONDecoder().decode([String: JSONValue].self, from: Data(contentsOf: url))
    }

    static func rows(_ root: [String: JSONValue], _ collection: String) -> [JSONValue] {
        if case .array(let a)? = root[collection] { return a } else { return [] }
    }

    static func record(_ root: [String: JSONValue], _ collection: String,
                       _ id: String) -> [String: JSONValue]? {
        for row in rows(root, collection) {
            if case .object(let o) = row, o["id"] == .string(id) { return o }
        }
        return nil
    }

    /// The collection this book actually has rows in, whichever book it is.
    static func aCollection(_ root: [String: JSONValue]) -> (name: String, id: String)? {
        for name in ["printLog", "printFiles", "inventory", "machines", "clients"] {
            for row in rows(root, name) {
                if case .object(let o) = row, case .string(let id)? = o["id"] { return (name, id) }
            }
        }
        return nil
    }

    /// The whole write, end to end: read a real book, merge a cloud store into
    /// it through the shared rule, and swap.
    static func merge(into url: URL, from server: [String: JSONValue],
                      owns: Bool = true) async throws -> KhaytEngine.Merged {
        let engine = try KhaytEngine()
        var report: KhaytEngine.Merged?
        try await StoreWriter.update(storeURL: url,
                                     owns: { owns },
                                     whoHasIt: { "Another copy of Khayt" }) { root in
            let merged = try await engine.mergeFromCloud(local: root, server: server)
            root = merged.store
            report = merged
        }
        return try #require(report)
    }

    // MARK: - what it changes

    @Test("a record the cloud holds a newer copy of is replaced on disk")
    func newerFromTheCloudWins() async throws {
        let url = try Self.freshCopy()
        let before = try Self.read(url)
        let target = try #require(Self.aCollection(before), "the book has no rows to merge into")

        var theirs = try #require(Self.record(before, target.name, target.id))
        let wasRev = { if case .number(let n)? = theirs["rev"] { return n } else { return 0.0 } }()
        theirs["rev"] = .number(wasRev + 50)
        theirs["mergeProbe"] = .string("from the cloud")

        let report = try await Self.merge(into: url,
                                          from: [target.name: .array([.object(theirs)])])
        #expect(report.applied == 1)

        let after = try Self.read(url)
        let now = try #require(Self.record(after, target.name, target.id))
        #expect(now["mergeProbe"] == .string("from the cloud"), "the merge did not reach the disk")

        // NOT STAMPED. A merged record keeps the cloud's rev — bumping it would
        // make this Mac look like it had edited every record it received, and
        // it would push them all straight back.
        #expect(now["rev"] == .number(wasRev + 50))
    }

    @Test("a record only this Mac has is left exactly as it was")
    func localOnlySurvives() async throws {
        let url = try Self.freshCopy()
        let before = try Self.read(url)
        let target = try #require(Self.aCollection(before))
        let mine = try #require(Self.record(before, target.name, target.id))

        // A cloud that holds a different record entirely.
        _ = try await Self.merge(into: url, from: [
            target.name: .array([.object(["id": .string("NOT-IN-THIS-BOOK"), "rev": .number(1)])]),
        ])

        let after = try Self.read(url)
        #expect(Self.record(after, target.name, target.id) == mine, "an untouched record moved")
        #expect(Self.record(after, target.name, "NOT-IN-THIS-BOOK") != nil, "the new one did not arrive")
    }

    /// The line that keeps a shop's own machine its own.
    @Test("settings are never brought down")
    func settingsStay() async throws {
        let url = try Self.freshCopy()
        let before = try Self.read(url)
        _ = try await Self.merge(into: url, from: [
            "settings": .object(["currency": .string("XXX"),
                                 "cloud": .object(["url": .string("https://not-yours.example")])]),
        ])
        let after = try Self.read(url)
        #expect(after["settings"] == before["settings"], "the cloud rewrote this Mac's settings")
    }

    /// Two devices that both logged waste on Tuesday have two entries, not one
    /// that won.
    @Test("a ledger is added to, never overwritten")
    func ledgersAreAppendOnly() async throws {
        let url = try Self.freshCopy()
        try await Self.mergeSeeding(url, entry: ["id": .string("W1"), "rev": .number(1),
                                                 "what": .string("ours")])

        _ = try await Self.merge(into: url, from: [
            "wasteLog": .array([
                .object(["id": .string("W1"), "rev": .number(99), "what": .string("theirs")]),
                .object(["id": .string("W2"), "rev": .number(1), "what": .string("also theirs")]),
            ]),
        ])
        let after = try Self.read(url)
        #expect(Self.record(after, "wasteLog", "W1")?["what"] == .string("ours"),
                "an entry that happened was overwritten")
        #expect(Self.record(after, "wasteLog", "W2") != nil, "a new entry was dropped")
    }

    /// Put one row in a collection this book may not have, without going through
    /// the merge — so the test above is testing the merge and not the setup.
    static func mergeSeeding(_ url: URL, entry: [String: JSONValue]) async throws {
        try await StoreWriter.update(storeURL: url, owns: { true }, whoHasIt: { nil }) { root in
            root["wasteLog"] = .array([.object(entry)])
        }
    }

    // MARK: - what it refuses

    @Test("a book this app does not own is not merged into")
    func refusesWithoutOwnership() async throws {
        let url = try Self.freshCopy()
        let before = try Data(contentsOf: url)
        let target = try #require(Self.aCollection(try Self.read(url)))

        await #expect(throws: StoreWriter.Refusal.self) {
            _ = try await Self.merge(into: url, from: [
                target.name: .array([.object(["id": .string("X"), "rev": .number(1)])]),
            ], owns: false)
        }
        #expect(try Data(contentsOf: url) == before, "the book was written anyway")
    }

    /// Nothing to bring down must leave the file untouched, byte for byte —
    /// not rewritten with the same content, which would churn every record's
    /// position and make the next diff meaningless.
    @Test("a cloud with nothing new changes no record")
    func emptyMergeChangesNothing() async throws {
        let url = try Self.freshCopy()
        let before = try Self.read(url)
        let report = try await Self.merge(into: url, from: ["printLog": .array([])])
        #expect(report.applied == 0)
        #expect(report.removed == 0)
        let after = try Self.read(url)
        for key in before.keys {
            #expect(after[key] == before[key], "\(key) changed with nothing to merge")
        }
    }

    // MARK: - what it says

    /// Delete wins over a local edit, and a shop is told. A merge that threw
    /// somebody's work away in silence is the failure this list exists for.
    @Test("a local edit lost to a deletion elsewhere is reported")
    func lostEditsAreReported() async throws {
        let url = try Self.freshCopy()
        let before = try Self.read(url)
        let target = try #require(Self.aCollection(before))
        var mine = try #require(Self.record(before, target.name, target.id))
        mine["rev"] = .number(9_000)

        // Bump the local copy first, so the deletion is discarding a real edit.
        try await StoreWriter.update(storeURL: url, owns: { true }, whoHasIt: { nil }) { root in
            var rows = Self.rows(root, target.name)
            for (i, row) in rows.enumerated() {
                if case .object(let o) = row, o["id"] == .string(target.id) {
                    rows[i] = .object(mine)
                }
            }
            root[target.name] = .array(rows)
        }

        let report = try await Self.merge(into: url, from: [
            target.name: .array([]),
            "tombstones": .array([.object(["collection": .string(target.name),
                                           "id": .string(target.id),
                                           "rev": .number(2),
                                           "deletedAt": .string("2026-09-01")])]),
        ])
        #expect(report.removed == 1)
        #expect(!report.conflicts.isEmpty, "the discarded edit was not reported")
        #expect(Self.record(try Self.read(url), target.name, target.id) == nil)
    }
}
