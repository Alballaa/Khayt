import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// Moving a job is the most consequential write this app makes.
///
/// It changes three collections at once — the job, the spools its filament came
/// off, the consumables it spent — and a book where the job says "completed"
/// while the spools still hold its filament has told a shop it has stock it has
/// already used. So every case here runs the real path against a real store
/// shape and reads the file back.
///
/// The RULES are not tested here; they are tested where they live, in Node and
/// again through JavaScriptCore. What is tested here is that this app asks for
/// them correctly, writes down every collection they changed, stamps what it
/// changed and nothing else, and refuses whole rather than half.
@MainActor
struct MoveJobTests {

    // MARK: - a book to move a job in

    /// A small shop with the awkward parts present: two spools of the same
    /// material where one is nearly empty, a packaging item, an hourly
    /// consumable, and a job whose filament will not fit on its own spool.
    static func book(settings: [String: JSONValue] = ["autoDeduct": .bool(true)]) -> [String: JSONValue] {
        [
            "printLog": .array([
                .object([
                    "id": .string("J1"), "project": .string("Bracket"), "status": .string("printing"),
                    "client": .string("Acme"), "price": .number(400), "rev": .number(3),
                    "parts": .array([.object([
                        "filamentId": .string("S1"), "printWeight": .number(150),
                        "supportWeight": .number(10), "qty": .number(1), "baseCost": .number(22.5),
                    ])]),
                    "printTime": .number(4),
                ]),
                .object(["id": .string("J2"), "project": .string("Other"), "status": .string("pending")]),
            ]),
            "inventory": .array([
                .object(["id": .string("S1"), "material": .string("PLA"), "weight": .number(100), "rev": .number(1)]),
                .object(["id": .string("S2"), "material": .string("PLA"), "weight": .number(900), "rev": .number(1)]),
                .object(["id": .string("S3"), "material": .string("PETG"), "weight": .number(900), "rev": .number(1)]),
            ]),
            "consumables": .array([
                .object(["id": .string("C1"), "name": .string("IPA"), "stock": .number(10),
                         "minStock": .number(2), "usagePerHour": .number(0.5), "rev": .number(1)]),
                .object(["id": .string("C2"), "name": .string("Box"), "stock": .number(5),
                         "minStock": .number(1), "isPackaging": .bool(true), "rev": .number(1)]),
            ]),
            "machines": .array([]),
            "clients": .array([.object(["id": .string("A"), "name": .string("Acme")])]),
            "settings": .object(settings),
        ]
    }

    static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)     // …/mac/KhaytCore/Tests/KhaytAppTests/x.swift
            .deletingLastPathComponent()     // KhaytAppTests
            .deletingLastPathComponent()     // Tests
            .deletingLastPathComponent()     // KhaytCore
            .deletingLastPathComponent()     // mac
            .deletingLastPathComponent()     // repo root
    }

    static func rows(_ root: [String: JSONValue], _ collection: String) -> [[String: JSONValue]] {
        guard case .array(let r)? = root[collection] else { return [] }
        return r.compactMap { if case .object(let o) = $0 { return o } else { return nil } }
    }

    static func row(_ root: [String: JSONValue], _ collection: String, _ id: String) -> [String: JSONValue]? {
        rows(root, collection).first { if case .string(let i)? = $0["id"] { return i == id } else { return false } }
    }

    static func number(_ value: JSONValue?) -> Double? {
        if case .number(let n)? = value { return n }
        return nil
    }

    static func string(_ value: JSONValue?) -> String? {
        if case .string(let s)? = value { return s }
        return nil
    }

    static func move(_ root: inout [String: JSONValue], _ id: String, _ stage: Stage,
                     holdReason: String? = nil, qcNotes: String? = nil)
    async throws -> (undo: [Shop.ChangedRecord], notices: [String]) {
        let engine = try KhaytEngine()
        // Words loaded, not bare: a notice is only useful if it comes back as a
        // sentence, and an unloaded catalogue would let a missing key pass as
        // one.
        let words = Words()
        await words.load("en", engine: engine)
        return try await Shop.applyMove(to: &root, id: id, stage: stage, engine: engine,
                                        words: words, holdReason: holdReason, qcNotes: qcNotes)
    }

    // MARK: -

    @Test("finishing a job moves it, empties the spools it printed with, and says so")
    func completion() async throws {
        var root = Self.book()
        let (undo, notices) = try await Self.move(&root, "J1", .completed)

        let job = try #require(Self.row(root, "printLog", "J1"))
        #expect(Self.string(job["status"]) == "completed")
        #expect(Self.string(job["completedAt"]) != nil, "the moment it finished is recorded")
        #expect(Self.number(job["costBasis"]) == 22.5, "and what it cost is fixed")
        #expect(Self.string(job["surveyToken"])?.hasPrefix("srv-") == true)

        // 160g owed: the chosen spool has 100, the shortfall comes off the other
        // PLA spool, and the PETG one is not touched.
        #expect(Self.number(Self.row(root, "inventory", "S1")?["weight"]) == 0)
        #expect(Self.number(Self.row(root, "inventory", "S2")?["weight"]) == 840)
        #expect(Self.number(Self.row(root, "inventory", "S3")?["weight"]) == 900)

        #expect(Self.number(Self.row(root, "consumables", "C1")?["stock"]) == 8, "four hours of IPA")
        #expect(Self.number(Self.row(root, "consumables", "C2")?["stock"]) == 4, "one box")

        #expect(!notices.isEmpty, "a shop is told what came off the shelf")

        let changed = Set(undo.map(\.collection))
        #expect(changed == ["printLog", "inventory", "consumables"],
                "every collection the move touched must be undoable")
        #expect(undo.contains { $0.id == "S3" } == false, "and only the rows that changed")
    }

    @Test("only what changed is stamped")
    func stampsOnlyTheChanged() async throws {
        var root = Self.book()
        _ = try await Self.move(&root, "J1", .completed)

        #expect(Self.number(Self.row(root, "printLog", "J1")?["rev"]) == 4)
        #expect(Self.number(Self.row(root, "inventory", "S1")?["rev"]) == 2)
        // The untouched spool keeps its revision. Stamping it would push a row
        // to the cloud as an edit nobody made, and on a shop with two machines
        // that is how a stale copy gets to win.
        #expect(Self.number(Self.row(root, "inventory", "S3")?["rev"]) == 1)
        #expect(Self.string(Self.row(root, "printLog", "J2")?["updatedAt"]) == nil)
    }

    @Test("a move that is not a completion deducts nothing")
    func plainMove() async throws {
        var root = Self.book()
        _ = try await Self.move(&root, "J1", .quote)

        #expect(Self.string(Self.row(root, "printLog", "J1")?["status"]) == "quote")
        #expect(Self.number(Self.row(root, "inventory", "S1")?["weight"]) == 100)
        #expect(Self.number(Self.row(root, "consumables", "C2")?["stock"]) == 5)
    }

    @Test("the move is written in the team's activity log, the way Khayt writes it")
    func activityLog() async throws {
        var root = Self.book(settings: ["autoDeduct": .bool(true),
                                        "activeOperatorId": .string("OP1")])
        root["operators"] = .array([.object(["id": .string("OP1"), "name": .string("Sara")])])
        _ = try await Self.move(&root, "J1", .pending)

        let log = Self.rows(root, "auditLog")
        #expect(log.count == 1)
        let entry = try #require(log.first)
        #expect(Self.string(entry["action"]) == "status")
        #expect(Self.string(entry["detail"]) == "J1 → pending")
        #expect(Self.string(entry["ref"]) == "J1")
        #expect(Self.string(entry["operatorId"]) == "OP1")
        #expect(Self.string(entry["operatorName"]) == "Sara", "who did it, not just what")
        #expect(Self.string(entry["id"])?.hasPrefix("AL-") == true)
        #expect(Self.string(entry["at"])?.hasSuffix("Z") == true)
    }

    @Test("a move the rules refuse changes nothing at all")
    func refusedByTheRules() async throws {
        var root = Self.book(settings: ["autoDeduct": .bool(true), "productionPaused": .bool(true)])
        let before = root

        await #expect(throws: Shop.MoveRefused.self) {
            var copy = root
            _ = try await Self.move(&copy, "J2", .printing)
            root = copy
        }
        #expect(root == before, "a paused shop's book is untouched by a refused move")
    }

    /// The failure this whole design exists to prevent: a move made here that
    /// silently does not send what the same move sends in Khayt.
    @Test("a move that would reach somebody is refused whole")
    func refusedForOutbound() async throws {
        let wired: [String: JSONValue] = [
            "autoDeduct": .bool(true),
            "telegram": .object(["botToken": .string("t"), "chatId": .string("c"),
                                 "notifyOnComplete": .bool(true)]),
        ]
        var root = Self.book(settings: wired)
        let before = root

        await #expect(throws: Shop.MoveRefused.self) {
            var copy = root
            _ = try await Self.move(&copy, "J1", .completed)
            root = copy
        }
        #expect(root == before, "not the job, not the spools, not the packaging")

        // The same shop CAN move a job to a stage Telegram says nothing about.
        var moving = Self.book(settings: wired)
        _ = try await Self.move(&moving, "J1", .pending)
        #expect(Self.string(Self.row(moving, "printLog", "J1")?["status"]) == "pending")
    }

    @Test("the refusal names the channel, so a shop knows what it would have missed")
    func refusalSaysWhich() async throws {
        let engine = try KhaytEngine()
        let order: JSONValue = .object(["id": .string("J1"), "clientId": .string("A")])
        let reaches = try await engine.outbound(
            order: order, to: "completed",
            settings: ["telegram": .object(["botToken": .string("t"), "chatId": .string("c"),
                                            "notifyOnComplete": .bool(true)])],
            clients: [])
        #expect(reaches.map(\.channel) == ["telegram"])

        let words = Words()
        let sentence = words.outboundRefusal(reaches)
        #expect(sentence.contains("Telegram"), "naming it is the point: \(sentence)")
    }

    @Test("an undone move puts the filament back on the spool")
    func undoRestoresTheShelf() async throws {
        var root = Self.book()
        let (undo, _) = try await Self.move(&root, "J1", .completed)

        // What restoreMove does to the book, without the file and the menu.
        for record in undo {
            guard case .array(var rows)? = root[record.collection] else { continue }
            for i in rows.indices {
                guard case .object(let current) = rows[i],
                      case .string(let id)? = current["id"], id == record.id else { continue }
                rows[i] = .object(StoreWriter.restoring(record.was, over: current))
            }
            root[record.collection] = .array(rows)
        }

        #expect(Self.string(Self.row(root, "printLog", "J1")?["status"]) == "printing")
        #expect(Self.number(Self.row(root, "inventory", "S1")?["weight"]) == 100)
        #expect(Self.number(Self.row(root, "inventory", "S2")?["weight"]) == 900)
        #expect(Self.number(Self.row(root, "consumables", "C2")?["stock"]) == 5)
        // An undo is an edit like any other, so the revision goes FORWARD. A
        // record that went backwards would look to the next sync like the
        // change never happened, and the other machine's copy would win.
        #expect(Self.number(Self.row(root, "printLog", "J1")?["rev"]) == 5)
    }

    /// The gap this fixes was shipped in the drag itself: a card dropped on
    /// "On Hold" set the status and nothing else, so the job came back with its
    /// original due date and no way to know it had ever stopped.
    @Test("a job dropped on hold records when, and why")
    func holdRecordsWhenAndWhy() async throws {
        var root = Self.book()
        _ = try await Self.move(&root, "J1", .on_hold, holdReason: "waiting on filament")

        let job = try #require(Self.row(root, "printLog", "J1"))
        #expect(Self.string(job["status"]) == "on_hold")
        #expect(Self.string(job["heldAt"])?.hasSuffix("Z") == true, "or the days back cannot be counted")
        #expect(Self.string(job["holdReason"]) == "waiting on filament")
    }

    @Test("a hold with nothing typed is a hold with no reason, not the last one")
    func holdWithNoReason() async throws {
        var root = Self.book()
        _ = try await Self.move(&root, "J1", .on_hold, holdReason: "")
        #expect(Self.row(root, "printLog", "J1")?["holdReason"] == .null)
        #expect(Self.string(Self.row(root, "printLog", "J1")?["heldAt"]) != nil)
    }

    @Test("resuming a held job gives back the days it waited")
    func resumeExtendsTheDueDate() async throws {
        var root = Self.book()
        // Held nine days ago, due in a fortnight.
        guard case .array(var jobs)? = root["printLog"], case .object(var j1) = jobs[0] else {
            Issue.record("fixture changed"); return
        }
        j1["status"] = .string("on_hold")
        j1["dueDate"] = .string("2099-01-20")
        // Nine days and a bit less: the rule counts whole days and rounds UP,
        // so exactly nine days ago plus the microseconds this test takes is ten.
        j1["heldAt"] = .string(StoreWriter.iso(Date().addingTimeInterval(-9 * 86400 + 3600)))
        jobs[0] = .object(j1)
        root["printLog"] = .array(jobs)

        let (_, notices) = try await Self.move(&root, "J1", .printing)
        #expect(Self.string(Self.row(root, "printLog", "J1")?["dueDate"]) == "2099-01-29")
        #expect(Self.row(root, "printLog", "J1")?["heldAt"] == nil, "the hold is over")
        #expect(notices.contains { $0.contains("2099-01-29") }, "and the shop is told: \(notices)")
    }

    /// A completion out of QC that left no record was not counted as a failure.
    /// It was not counted at all — `computeQcMetrics` only counts the orders
    /// `qcStatusOf` can answer for — so a shop's pass rate would have been
    /// computed over a shrinking subset of its own work.
    @Test("a job finished out of inspection records that it passed")
    func qcPassIsRecorded() async throws {
        var root = Self.book()
        guard case .array(var jobs)? = root["printLog"], case .object(var j1) = jobs[0] else {
            Issue.record("fixture changed"); return
        }
        j1["status"] = .string("qc")
        jobs[0] = .object(j1)
        root["printLog"] = .array(jobs)

        _ = try await Self.move(&root, "J1", .completed, qcNotes: "surface is clean")

        let job = try #require(Self.row(root, "printLog", "J1"))
        #expect(Self.string(job["status"]) == "completed")
        #expect(Self.string(job["qcStatus"]) == "pass")
        #expect(Self.string(job["qcPassedAt"])?.hasSuffix("Z") == true)
        #expect(Self.string(job["qcNotes"]) == "surface is clean")
        #expect(job["inspector"] == .null, "nobody was named, and nobody is recorded")
    }

    @Test("a completion that was not an inspection claims nothing about one")
    func completionWithoutQC() async throws {
        var root = Self.book()   // J1 is printing, not in QC
        _ = try await Self.move(&root, "J1", .completed)
        let job = try #require(Self.row(root, "printLog", "J1"))
        #expect(job["qcStatus"] == nil, "or every completion would count as a pass")
        #expect(job["qcPassedAt"] == nil)
    }

    @Test("the two moves that ask a question first, and only those")
    func questionsAsked() async {
        let shop = Shop(source: .sample)
        await shop.load(.sample)
        guard let inQC = shop.orders.first(where: { $0.status == "qc" })
                ?? shop.orders.first(where: { $0.status == "printing" }) else { return }

        // A hold always asks; every ordinary move asks nothing.
        #expect(shop.questionFor(inQC.id, moving: .on_hold) != nil)
        #expect(shop.questionFor(inQC.id, moving: .printing) == nil)
        #expect(shop.questionFor(inQC.id, moving: .post) == nil)

        // Completing asks only when the job is leaving inspection.
        let asks = shop.questionFor(inQC.id, moving: .completed) != nil
        #expect(asks == (Stage.of(inQC) == .qc),
                "finishing a job that was in QC is an inspection; finishing one that was printing is not")
    }

    @Test("the ids this app mints are the ids Khayt mints")
    func idFormats() {
        let id = Shop.uid("AL")
        #expect(id.hasPrefix("AL-"))
        let body = String(id.dropFirst(3))
        #expect(body.count >= 9, "base-36 milliseconds plus three characters: \(id)")
        #expect(body.suffix(3).allSatisfy { $0.isNumber || ($0.isUppercase && $0.isLetter) })

        let token = Shop.surveyToken()
        #expect(token.hasPrefix("srv-"))
        #expect(token.dropFirst(4).count == 24, "twelve bytes in hex")
        #expect(token.dropFirst(4).allSatisfy { $0.isHexDigit && !$0.isUppercase })
    }

    /// The safety net, checked at the source rather than waited for.
    ///
    /// `applyMove` refuses a move whose effects it cannot classify, which is the
    /// right behaviour and is also unreachable in a test: every effect
    /// `lib/order-status.js` emits today IS classified. So this reads the module
    /// and asserts that — a new effect added there without a decision here fails
    /// the build instead of refusing a shop's drag on a Tuesday.
    @Test("every effect the shared rules can ask for has been decided about")
    func everyEffectIsClassified() throws {
        let module = Self.repoRoot.appending(path: "lib/order-status.js")
        let source = try String(contentsOf: module, encoding: .utf8)

        var emitted = Set<String>()
        for match in source.ranges(of: /type:\s*'([a-z_]+)'/) {
            let text = source[match]
            if let quoted = text.split(separator: "'").dropFirst().first {
                emitted.insert(String(quoted))
            }
        }
        #expect(emitted.count >= 12, "found only \(emitted.sorted()) — has the module's shape changed?")

        // The three buckets in KhaytEngine's MOVE_SCRIPT, written out here
        // because a Swift test cannot read a private JavaScript literal.
        let performed: Set<String> = ["deduct_filament", "deduct_packaging", "activity_log",
                                      "save", "ensure_survey_token"]
        let cosmetic: Set<String> = ["render", "toast_updated", "toast_updated_undoable",
                                     "tier_check", "export_status_page"]
        let outbound: Set<String> = ["webhook", "order_webhook", "telegram", "email", "republish_portal"]
        let classified = performed.union(cosmetic).union(outbound)

        let unknown = emitted.subtracting(classified)
        #expect(unknown.isEmpty, """
            lib/order-status.js can now ask for \(unknown.sorted()), and nothing in \
            KhaytEngine.MOVE_SCRIPT says what this app does about it. Decide: perform it, \
            call it cosmetic, or call it outbound — then add it here.
            """)

        let stale = classified.subtracting(emitted)
        #expect(stale.isEmpty, "\(stale.sorted()) is classified but the module no longer emits it")
    }

    @Test("the day a spool's usage is recorded under is this Mac's day")
    func localDay() {
        let day = Shop.localDay(Date(timeIntervalSince1970: 0))
        #expect(day.count == 10 && day.dropFirst(4).first == "-")
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: Date())
        #expect(Shop.localDay() == String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!))
    }
}

/// The whole write, against a real file.
///
/// Everything above works on a `root` dictionary in memory. This runs the path
/// the app actually runs — read from disk inside the write, ask the shared
/// rules, serialise, swap — against a COPY of a real store in a temp directory.
/// A write path whose only trial run was on a dictionary has not been tested
/// where it can lose anything.
@MainActor
struct MoveJobOnDiskTests {

    static func freshCopy(_ root: [String: JSONValue]) throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "khayt-move-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appending(path: "khayt-store.json")
        try JSONEncoder().encode(root).write(to: url)
        return url
    }

    static func read(_ url: URL) throws -> [String: JSONValue] {
        try JSONDecoder().decode([String: JSONValue].self, from: Data(contentsOf: url))
    }

    @Test("a move is written to the file, all three collections at once")
    func writesThroughToDisk() async throws {
        let url = try Self.freshCopy(MoveJobTests.book())
        let engine = try KhaytEngine()
        let words = Words()
        await words.load("en", engine: engine)

        try await StoreWriter.update(storeURL: url, owns: { true }, whoHasIt: { nil }) { root in
            _ = try await Shop.applyMove(to: &root, id: "J1", stage: .completed,
                                         engine: engine, words: words)
        }

        let after = try Self.read(url)
        #expect(MoveJobTests.string(MoveJobTests.row(after, "printLog", "J1")?["status"]) == "completed")
        #expect(MoveJobTests.number(MoveJobTests.row(after, "inventory", "S1")?["weight"]) == 0)
        #expect(MoveJobTests.number(MoveJobTests.row(after, "consumables", "C2")?["stock"]) == 4)
        #expect(MoveJobTests.rows(after, "auditLog").count == 0, "a completion is not an activity-log move")

        // The rollback copy the recovery path reaches for when the primary will
        // not parse.
        #expect(FileManager.default.fileExists(atPath: url.appendingPathExtension("prev").path))
    }

    @Test("a book that changed hands mid-move is not written to")
    func refusedWhenNotOurs() async throws {
        let url = try Self.freshCopy(MoveJobTests.book())
        let before = try Self.read(url)
        let engine = try KhaytEngine()
        let words = Words()
        await words.load("en", engine: engine)

        // Ours for the read, somebody else's by the time the swap comes round —
        // which is the window the second ownership check exists to close, and
        // it is a JavaScript call wide now rather than a serialisation.
        var asked = 0
        await #expect(throws: StoreWriter.Refusal.self) {
            try await StoreWriter.update(storeURL: url,
                                         owns: { asked += 1; return asked == 1 },
                                         whoHasIt: { "Khayt on this Mac" }) { root in
                _ = try await Shop.applyMove(to: &root, id: "J1", stage: .completed,
                                             engine: engine, words: words)
            }
        }
        #expect(try Self.read(url) == before, "not one byte")
    }

    @Test("a move the rules refuse leaves the file untouched")
    func refusedRulesLeaveTheFile() async throws {
        var book = MoveJobTests.book(settings: ["autoDeduct": .bool(true),
                                                "productionPaused": .bool(true)])
        // J2 is pending; starting a print in a paused shop is refused.
        book["settings"] = .object(["autoDeduct": .bool(true), "productionPaused": .bool(true)])
        let url = try Self.freshCopy(book)
        let before = try Self.read(url)
        let engine = try KhaytEngine()
        let words = Words()
        await words.load("en", engine: engine)

        await #expect(throws: Shop.MoveRefused.self) {
            try await StoreWriter.update(storeURL: url, owns: { true }, whoHasIt: { nil }) { root in
                _ = try await Shop.applyMove(to: &root, id: "J2", stage: .printing,
                                             engine: engine, words: words)
            }
        }
        #expect(try Self.read(url) == before)
    }
}

/// Recording money against a job.
///
/// One record changes rather than three, but through the same door: the
/// ownership check, the atomic swap and the undo are the ones the moves already
/// proved, not a second set written for money.
@MainActor
struct PaymentTests {

    static func engineAndWords() async throws -> (KhaytEngine, Words) {
        let engine = try KhaytEngine()
        let words = Words()
        await words.load("en", engine: engine)
        return (engine, words)
    }

    @Test("what is written is what the reports will read back")
    func statusIsDerived() async throws {
        let (engine, _) = try await Self.engineAndWords()
        // SAR 1,000 job, SAR 600 credited back, SAR 400 paid: settled. The
        // dialog used to write "partial" here and every report read "paid".
        let order: JSONValue = .object([
            "id": .string("J1"), "price": .number(1000),
            "creditNotes": .array([.object(["amount": .number(600)])]),
        ])
        let out = try await engine.recordPayment(order: order, amount: 400, method: "mada",
                                                 paidAt: "2026-09-04", today: "2026-09-04")
        guard case .object(let after) = out.order else { Issue.record("not an order"); return }
        #expect(MoveJobTests.string(after["paymentStatus"]) == "paid")
        #expect(MoveJobTests.number(after["paidAmount"]) == 400)
        #expect(MoveJobTests.string(after["paymentMethod"]) == "mada")
        #expect(try await engine.paymentStatus(of: out.order) == "paid",
                "written and read must agree, which is the whole point")
    }

    @Test("a payment cannot exceed the price")
    func clamped() async throws {
        let (engine, _) = try await Self.engineAndWords()
        let order: JSONValue = .object(["id": .string("J1"), "price": .number(100)])
        let out = try await engine.recordPayment(order: order, amount: 5000, method: "cash",
                                                 paidAt: "2026-09-04", today: "2026-09-04")
        guard case .object(let after) = out.order else { Issue.record("not an order"); return }
        #expect(MoveJobTests.number(after["paidAmount"]) == 100,
                "an overpayment is a credit note, not a bigger paidAmount")
    }

    @Test("clearing a payment leaves the order owed, whatever else is on it")
    func cleared() async throws {
        let (engine, _) = try await Self.engineAndWords()
        let order: JSONValue = .object([
            "id": .string("J1"), "price": .number(100), "paidAmount": .number(100),
            "giftCardDiscount": .number(100), "paymentMethod": .string("cash"),
        ])
        let out = try await engine.clearPayment(order: order)
        guard case .object(let after) = out.order else { Issue.record("not an order"); return }
        #expect(MoveJobTests.number(after["paidAmount"]) == 0)
        #expect(MoveJobTests.string(after["paymentStatus"]) == "unpaid",
                "somebody clearing a payment means the order is owed")
        #expect(after["paymentMethod"] == .null)
    }

    @Test("a payment that would reach somebody is refused whole")
    func refusedForOutbound() async throws {
        let (engine, _) = try await Self.engineAndWords()
        let order: JSONValue = .object(["id": .string("J1"), "price": .number(100),
                                        "clientId": .string("C1")])
        let quiet = try await engine.paymentOutbound(order: order, settings: [:], clients: [])
        #expect(quiet.isEmpty, "a shop with nothing configured records a payment and reaches nobody")

        let wired = try await engine.paymentOutbound(
            order: order,
            settings: ["emailConfig": .object(["provider": .string("smtp"),
                                               "triggers": .array([.string("payment_received")])])],
            clients: [.object(["id": .string("C1"), "email": .string("a@b.c")])])
        #expect(wired.map(\.channel) == ["email"])
    }

    @Test("the methods offered are Khayt's own, in Khayt's order")
    func methodsMatchKhayt() throws {
        let source = try String(contentsOf: MoveJobTests.repoRoot.appending(path: "renderer/order-flows.js"),
                                encoding: .utf8)
        // Pinned to the list the Electron dialog offers. Inventing a method here
        // would put a value in paymentMethod that Khayt's own dialog cannot show.
        let expected = "const methodOptions = ['cash','mada','transfer','stcpay','applepay','visa','other']"
        #expect(source.contains(expected),
                "renderer/order-flows.js's payment methods have changed; Shop.paymentMethods must follow")
        #expect(Shop.paymentMethods == ["cash", "mada", "transfer", "stcpay", "applepay", "visa", "other"])
    }
}
